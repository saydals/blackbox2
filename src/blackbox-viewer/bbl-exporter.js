import { binarySearchOrPrevious } from "./tools.js";
import { buildBbl, modifyHeaderText } from "./bbl-writer.js";
import { FlightLogParser } from "./flightlog_parser.js";

const END_OF_LOG_MESSAGE = "End of log\0";
const END_OF_LOG_BYTES = new TextEncoder().encode(END_OF_LOG_MESSAGE);
const LOG_END_EVENT_BYTE = 255; // FlightLogEvent.LOG_END

// FC에서 실제 지원하는 BBL 저장 샘플레이트. 저장 옵션은 다운스케일링만
// 지원하므로, 다이얼로그에는 원본 이하의 값만 표시한다 (업스케일링 원천 차단).
export const BBL_SUPPORTED_SAMPLE_RATES = [1000, 500, 250, 100, 50, 10];

export const BBL_UPSAMPLING_ERROR_MESSAGE =
    "출력 샘플레이트는 원본 샘플레이트보다 높게 설정할 수 없습니다. 파일 용량 감소를 위해 원본 이하의 샘플레이트를 선택하세요.";

// 원본 샘플레이트 이하의 선택 가능한 출력 샘플레이트 목록 (내림차순).
// 원본이 지원 목록에 없는 값이면(예: 2000Hz 로그) 원본 자체를 선두에 포함시켜
// "변환 없이 구간만 추출" 선택이 가능하게 한다.
export function getAvailableSampleRates(originalRate) {
    if (!originalRate || !Number.isFinite(originalRate) || originalRate <= 0) {
        return [];
    }
    const eps = 1e-6;
    const available = BBL_SUPPORTED_SAMPLE_RATES.filter((r) => r <= originalRate + eps);
    const hasOriginal = available.some((r) => Math.abs(r - originalRate) < 0.5);
    if (!hasOriginal) {
        available.unshift(Math.round(originalRate));
    }
    return available.sort((a, b) => b - a);
}

function buildEndOfLogMarker() {
    const marker = new Uint8Array(1 + 1 + END_OF_LOG_BYTES.length);
    marker[0] = 0x45; // 'E'
    marker[1] = LOG_END_EVENT_BYTE;
    marker.set(END_OF_LOG_BYTES, 2);
    return marker;
}

function concatBytes(parts) {
    let total = 0;
    for (const p of parts) {
        total += p.length;
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
        result.set(p, offset);
        offset += p.length;
    }
    return result;
}

// 생성된 BBL을 다시 파서로 읽어 무결성을 검증한다. 실패하면 이유를 반환한다.
function validateExportedBbl(bytes, expectations) {
    const { expectedMainCount, expectedFirstTime, expectedLastTime, expectedFirstFrame, expectedLastFrame } = expectations;
    let parser;
    try {
        parser = new FlightLogParser(bytes);
        parser.parseHeader(0, bytes.length);
    } catch (error) {
        return `헤더 파싱 실패 (${error?.message ?? error})`;
    }
    const decodedMains = [];
    let monotonicOk = true;
    let prevTime = -Infinity;
    let maxGap = 0;
    parser.onFrameReady = (isValid, frame, frameType) => {
        if (!isValid) {
            return;
        }
        // frameType은 "I"/"P" 문자열 또는 {marker} 객체일 수 있다.
        const marker = typeof frameType === "string" ? frameType : frameType?.marker;
        if (marker !== "I" && marker !== "P") {
            return;
        }
        const time = frame[1];
        if (prevTime !== -Infinity) {
            if (time <= prevTime) {
                monotonicOk = false;
            }
            maxGap = Math.max(maxGap, time - prevTime);
        }
        prevTime = time;
        decodedMains.push(Array.from(frame));
    };
    try {
        parser.resetDataState();
        parser.parseLogData(false);
    } catch (error) {
        return `데이터 디코드 실패 (${error?.message ?? error})`;
    } finally {
        parser.onFrameReady = null;
    }
    if (decodedMains.length === 0) {
        return "디코드된 메인 프레임이 없음";
    }
    if (expectedMainCount != null && decodedMains.length !== expectedMainCount) {
        return `프레임 수 불일치 (예상 ${expectedMainCount}, 실제 ${decodedMains.length})`;
    }
    if (!monotonicOk) {
        return "타임스탬프 역전 발생";
    }
    // 10초 이상의 비정상적인 점프 검사 (파서 상수와 동일 기준)
    if (maxGap >= 10 * 1000000) {
        return "타임스탬프 점프가 비정상적으로 큼";
    }
    const firstTime = decodedMains[0][1];
    const lastTime = decodedMains[decodedMains.length - 1][1];
    if (expectedFirstTime != null && Math.abs(firstTime - expectedFirstTime) > 1) {
        return "첫 프레임 시간이 일치하지 않음";
    }
    if (expectedLastTime != null && Math.abs(lastTime - expectedLastTime) > 1) {
        return "마지막 프레임 시간이 일치하지 않음";
    }
    // 재인코딩 충실도: 첫/마지막 프레임의 디코드 값이 원본 디코드 값과 동일해야 한다.
    const framesEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    if (expectedFirstFrame && !framesEqual(decodedMains[0], expectedFirstFrame)) {
        return "첫 프레임 데이터가 원본과 다름";
    }
    if (expectedLastFrame && !framesEqual(decodedMains[decodedMains.length - 1], expectedLastFrame)) {
        return "마지막 프레임 데이터가 원본과 다름";
    }
    return null;
}

export function BblExporter(flightLog, rawData, startTime, endTime, sampleRate) {
    function dump(onSuccess, onFailure = () => {}) {
        try {
            const logIndex = flightLog.getLogIndex();
            const directory = flightLog.getIntraframeDirectory(logIndex);
            const parser = flightLog.parser;

            if (!directory || !directory.offsets || directory.offsets.length === 0) {
                onFailure(new Error("No frame data available for export"));
                return;
            }

            const headerBytes = parser.headerBytes;
            if (!headerBytes || headerBytes.length === 0) {
                onFailure(new Error("Failed to read log header"));
                return;
            }

            const originalRate = flightLog.getBlackboxRate();
            if (!originalRate || !Number.isFinite(originalRate) || originalRate <= 0) {
                onFailure(new Error("원본 샘플레이트를 확인할 수 없습니다."));
                return;
            }

            // 규칙: Output <= Original. UI에서 원본 이하만 선택 가능하므로 여기는 방어선.
            if (sampleRate != null && Number.isFinite(sampleRate) && sampleRate > originalRate + 1e-6) {
                onFailure(new Error(BBL_UPSAMPLING_ERROR_MESSAGE));
                return;
            }
            const targetRate =
                sampleRate != null && Number.isFinite(sampleRate) && sampleRate <= originalRate + 1e-6
                    ? sampleRate
                    : originalRate;
            const useDownsampling = targetRate < originalRate - 1e-6;
            const downsamplingFactor = useDownsampling ? Math.max(2, Math.round(originalRate / targetRate)) : 1;

            const startChunkIndex = Math.max(0, binarySearchOrPrevious(directory.times, startTime));
            const endChunkIndex = Math.min(
                directory.offsets.length - 1,
                binarySearchOrPrevious(directory.times, endTime),
            );

            if (startChunkIndex > endChunkIndex) {
                onFailure(new Error("Selected range contains no frames"));
                return;
            }

            const dataStart = directory.offsets[startChunkIndex];
            const nextLogOffset =
                flightLog.getLogCount() > logIndex + 1
                    ? flightLog.getLogBeginOffset(logIndex + 1)
                    : rawData.length;
            const dataEnd =
                endChunkIndex + 1 < directory.offsets.length
                    ? directory.offsets[endChunkIndex + 1]
                    : nextLogOffset;

            if (dataEnd <= dataStart) {
                onFailure(new Error("Invalid frame range for export"));
                return;
            }

            if (!useDownsampling) {
                // 원본 구간에 이미 End-of-log가 있어도 정확히 1개만 남긴다.
                const markerLen = 2 + END_OF_LOG_BYTES.length;
                const matchEndMarkerAt = (pos) => {
                    if (pos < dataStart || pos + markerLen > dataEnd) {
                        return false;
                    }
                    if (rawData[pos] !== 0x45 || rawData[pos + 1] !== LOG_END_EVENT_BYTE) {
                        return false;
                    }
                    for (let j = 0; j < END_OF_LOG_BYTES.length; j++) {
                        if (rawData[pos + 2 + j] !== END_OF_LOG_BYTES[j]) {
                            return false;
                        }
                    }
                    return true;
                };
                let trimmedEnd = dataEnd;
                while (trimmedEnd - markerLen >= dataStart && matchEndMarkerAt(trimmedEnd - markerLen)) {
                    trimmedEnd -= markerLen;
                }
                const dataBytes = rawData.slice(dataStart, trimmedEnd);
                const endMarker = buildEndOfLogMarker();
                const result = concatBytes([headerBytes, dataBytes, endMarker]);
                const reason = validateExportedBbl(result, {});
                if (reason) {
                    onFailure(new Error(`생성된 BBL 검증 실패: ${reason}`));
                    return;
                }
                onSuccess(result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength));
                return;
            }

            const headerText = new TextDecoder().decode(headerBytes);
            const modifiedHeaderText = modifyHeaderText(headerText, {
                originalRate,
                targetRate,
                downsamplingFactor,
            });

            // 공유 파서를 건드리지 않기 위해 독립 파서로 디코드한다.
            const decodeParser = new FlightLogParser(rawData);
            try {
                decodeParser.parseHeader(flightLog.getLogBeginOffset(logIndex), rawData.length);
            } catch {
                decodeParser.parseHeader(0, rawData.length);
            }
            const mains = [];
            const auxFrames = [];
            decodeParser.onFrameReady = (isValid, frame, frameType, frameStart, frameSize) => {
                if (!isValid) {
                    return;
                }
                // frameType은 "I"/"P" 문자열 또는 {marker} 객체일 수 있다.
                const marker = typeof frameType === "string" ? frameType : frameType?.marker;
                if (marker === "I" || marker === "P") {
                    const time = frame[1];
                    if (time < startTime || time > endTime) {
                        return;
                    }
                    mains.push({ frame: Array.from(frame) });
                    return;
                }
                // S/G/H는 원본 바이트 그대로 유지한다. S는 시간 필드가 없으므로
                // 데이터 구간(dataStart~dataEnd) 안에 있으면 구간 내 것으로 간주한다.
                if (marker === "S" || marker === "G" || marker === "H") {
                    if (frameStart >= dataStart && frameStart < dataEnd) {
                        auxFrames.push({
                            marker,
                            bytes: rawData.slice(frameStart, frameStart + frameSize),
                            atMainIndex: mains.length,
                        });
                    }
                }
            };
            try {
                decodeParser.resetDataState();
                decodeParser.parseLogData(false, dataStart, dataEnd);
            } finally {
                decodeParser.onFrameReady = null;
            }

            if (mains.length === 0) {
                onFailure(new Error("Selected range contains no frames"));
                return;
            }
            mains.sort((a, b) => a.frame[1] - b.frame[1]);

            // 시간축 기준 다운샘플링: 목표 간격 격자에 가장 가까운 원본 선택.
            const targetIntervalUs = 1e6 / targetRate;
            const kept = [];
            let nextTarget = mains[0].frame[1];
            for (const m of mains) {
                if (m.frame[1] + targetIntervalUs / 2 >= nextTarget) {
                    kept.push(m);
                    const steps = Math.max(1, Math.round((m.frame[1] - nextTarget) / targetIntervalUs + 1));
                    nextTarget += steps * targetIntervalUs;
                }
            }
            if (kept.length === 0) {
                kept.push(mains[0]);
            }

            const frameDef = decodeParser.frameDefs.I;
            if (!frameDef || !frameDef.count) {
                onFailure(new Error("Missing I-frame definitions"));
                return;
            }

            // P-frame predictor 구조가 깨지지 않도록 kept 디코드 값을 전부
            // I-frame(SignedVB, predictor 0)으로 재인코딩한다.
            const modifiedIFrameDef = {
                name: [...frameDef.name],
                nameToIndex: { ...frameDef.nameToIndex },
                count: frameDef.count,
                signed: new Array(frameDef.count).fill(1),
                encoding: new Array(frameDef.count).fill(0),
                predictor: new Array(frameDef.count).fill(0),
            };

            const encodeFrames = kept.map((m) => ({ marker: "I", frame: m.frame }));
            // S/G/H 보조: kept 시간 위치에 맞춰 메인 사이에 끼워 넣는다.
            const keptSet = new Set(kept);
            const auxByTime = new Map();
            for (const aux of auxFrames) {
                const origIdx = Math.min(aux.atMainIndex, mains.length - 1);
                const owner = mains[origIdx];
                if (owner && keptSet.has(owner)) {
                    const key = owner.frame[1];
                    if (!auxByTime.has(key)) auxByTime.set(key, []);
                    auxByTime.get(key).push(aux);
                }
            }
            const orderedFrames = [];
            for (const m of kept) {
                orderedFrames.push({ marker: "I", frame: m.frame });
                const auxs = auxByTime.get(m.frame[1]);
                if (auxs) {
                    for (const a of auxs) orderedFrames.push({ marker: "S", bytes: a.bytes });
                }
            }
            const mainPart = buildBbl(modifiedHeaderText, orderedFrames, modifiedIFrameDef, null);
            const endMarker = buildEndOfLogMarker();
            const body = mainPart.slice(0, mainPart.length - endMarker.length);
            const result = concatBytes([body, endMarker]);

            const reason = validateExportedBbl(result, {
                expectedMainCount: encodeFrames.length,
                expectedFirstTime: kept[0].frame[1],
                expectedLastTime: kept[kept.length - 1].frame[1],
                expectedFirstFrame: kept[0].frame,
                expectedLastFrame: kept[kept.length - 1].frame,
            });
            if (reason) {
                onFailure(new Error(`생성된 BBL 검증 실패: ${reason}`));
                return;
            }
            onSuccess(result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength));
        } catch (error) {
            onFailure(error);
        }
    }

    return {
        dump,
    };
}

