import { binarySearchOrPrevious } from "./tools.js";
import { buildBbl, modifyHeaderText } from "./bbl-writer.js";

const END_OF_LOG_MESSAGE = "End of log\0";
const END_OF_LOG_BYTES = new TextEncoder().encode(END_OF_LOG_MESSAGE);
const LOG_END_EVENT_BYTE = 255; // FlightLogEvent.LOG_END

function buildEndOfLogMarker() {
    const marker = new Uint8Array(1 + 1 + END_OF_LOG_BYTES.length);
    marker[0] = 0x45; // 'E'
    marker[1] = LOG_END_EVENT_BYTE;
    marker.set(END_OF_LOG_BYTES, 2);
    return marker;
}

function includesEndOfLog(dataStart, dataEnd, rawData) {
    const length = END_OF_LOG_BYTES.length + 2; // 'E' + event byte + string
    if (dataEnd - dataStart < length) {
        return false;
    }
    for (let i = dataStart; i <= dataEnd - length; i++) {
        if (
            rawData[i] === 0x45 &&
            rawData[i + 1] === LOG_END_EVENT_BYTE &&
            i + 2 + END_OF_LOG_BYTES.length <= dataEnd
        ) {
            let match = true;
            for (let j = 0; j < END_OF_LOG_BYTES.length; j++) {
                if (rawData[i + 2 + j] !== END_OF_LOG_BYTES[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                return true;
            }
        }
    }
    return false;
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

            const startChunkIndex = Math.max(
                0,
                binarySearchOrPrevious(directory.times, startTime),
            );
            const endChunkIndex = Math.min(
                directory.offsets.length - 1,
                binarySearchOrPrevious(directory.times, endTime),
            );

            if (startChunkIndex > endChunkIndex) {
                onFailure(new Error("Selected range contains no frames"));
                return;
            }

            const dataStart = directory.offsets[startChunkIndex];
            const nextLogOffset = flightLog.getLogCount() > logIndex
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

            const originalRate = flightLog.getBlackboxRate();
            const targetRate = sampleRate && sampleRate < originalRate ? sampleRate : originalRate;
            const downsamplingFactor = Math.round(originalRate / targetRate);

            if (downsamplingFactor <= 1) {
                const dataBytes = rawData.slice(dataStart, dataEnd);
                const hasEndMarker = includesEndOfLog(dataStart, dataEnd, rawData);
                const endMarker = buildEndOfLogMarker();

                const outputLength = headerBytes.length + dataBytes.length + (hasEndMarker ? 0 : endMarker.length);
                const result = new Uint8Array(outputLength);
                result.set(headerBytes, 0);
                result.set(dataBytes, headerBytes.length);
                if (!hasEndMarker) {
                    result.set(endMarker, headerBytes.length + dataBytes.length);
                }

                onSuccess(result.buffer);
                return;
            }

            const headerText = new TextDecoder().decode(headerBytes);
            const modifiedHeaderText = modifyHeaderText(headerText, {
                originalRate,
                targetRate,
                downsamplingFactor,
            });

            const frames = [];
            const previousOnFrameReady = parser.onFrameReady;
            parser.onFrameReady = (isValid, frame, frameType, frameStart, frameSize) => {
                if (!isValid) {
                    return;
                }
                const time = frame[1];
                if (time < startTime || time > endTime) {
                    return;
                }
                frames.push({
                    marker: frameType.marker,
                    frame: Array.from(frame),
                    frameStart,
                    frameSize,
                });
            };

            parser.parseLogData(rawData, dataStart, dataEnd);
            parser.onFrameReady = previousOnFrameReady;

            const iframeDef = parser.frameDefs.I;
            if (!iframeDef || !iframeDef.count) {
                onFailure(new Error("Missing I-frame definitions"));
                return;
            }

            const modifiedIFrameDef = {
                name: [...iframeDef.name],
                nameToIndex: { ...iframeDef.nameToIndex },
                count: iframeDef.count,
                signed: new Array(iframeDef.count).fill(1),
                encoding: new Array(iframeDef.count).fill(0),
                predictor: new Array(iframeDef.count).fill(0),
            };

            const keptFrames = [];
            let iframeCount = 0;

            for (const f of frames) {
                if (f.marker === "I" || f.marker === "P") {
                    iframeCount++;
                    if (iframeCount % downsamplingFactor === 0) {
                        keptFrames.push(f);
                    }
                } else if (f.marker === "G" || f.marker === "H" || f.marker === "S") {
                    keptFrames.push(f);
                }
            }

            keptFrames.sort((a, b) => a.frameStart - b.frameStart);

            const result = buildBbl(modifiedHeaderText, keptFrames, modifiedIFrameDef, rawData);
            onSuccess(result.buffer);
        } catch (error) {
            onFailure(error);
        }
    }

    return {
        dump,
    };
}

