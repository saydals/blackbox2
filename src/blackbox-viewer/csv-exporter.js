/**
 * @typedef {object} ExportOptions
 * @property {string} columnDelimiter
 * @property {string} stringDelimiter
 * @property {boolean} quoteStrings
 * @property {number|null} [startTime] - 내보낼 구간 시작 (마이크로초, null이면 로그 시작)
 * @property {number|null} [endTime] - 내보낼 구간 끝 (마이크로초, null이면 로그 끝)
 * @property {number|null} [sampleRate] - 출력 샘플레이트 (Hz, null이면 원본 그대로)
 */

import { FlightLogParser } from "./flightlog_parser.js";
import { selectFramesAtTargetGrid, BBL_UPSAMPLING_ERROR_MESSAGE } from "./bbl-exporter.js";

/**
 * @constructor
 * @param {FlightLog} flightLog
 * @param {ExportOptions} [opts={}]
 */
export function CsvExporter(flightLog, opts = {}) {
    opts = {
        columnDelimiter: ",",
        stringDelimiter: '"',
        quoteStrings: true,
        // 아래 3개는 BBL 내보내기와 동일한 "선택 구간 + 다운샘플링" 옵션이다.
        // 모두 null이면 기존 동작(로그 전체 / 원본 샘플레이트)과 같다.
        startTime: null,
        endTime: null,
        sampleRate: null,
        ...opts,
    };

    /**
     * @param {function} success is a callback triggered when export is done
     * @param {function} [failure] is a callback triggered when the worker fails
     */
    function dump(success, failure = () => {}) {
        try {
            const timeIndex = FlightLogParser.prototype.FLIGHT_LOG_FIELD_INDEX_TIME;
            // 구간 옵션이 없으면 로그 전체 — 기존(전체 내보내기) 동작과 동일하다.
            const startTime = Number.isFinite(opts.startTime) ? opts.startTime : flightLog.getMinTime();
            const endTime = Number.isFinite(opts.endTime) ? opts.endTime : flightLog.getMaxTime();
            const hasRange = Number.isFinite(opts.startTime) || Number.isFinite(opts.endTime);

            // BBL 내보내기와 동일한 규칙: Output <= Original (UI 방어선 겸 검증).
            const originalRate = flightLog.getBlackboxRate ? flightLog.getBlackboxRate() : null;
            const requested = Number.isFinite(opts.sampleRate) && opts.sampleRate > 0 ? opts.sampleRate : null;
            let targetRate = null;
            if (requested != null) {
                if (!originalRate || !Number.isFinite(originalRate) || originalRate <= 0) {
                    failure(new Error("원본 샘플레이트를 확인할 수 없습니다."));
                    return;
                }
                if (requested > originalRate + 1e-6) {
                    failure(new Error(BBL_UPSAMPLING_ERROR_MESSAGE));
                    return;
                }
                targetRate = requested;
            }
            const useDownsampling = targetRate != null && targetRate < originalRate - 1e-6;

            // 청크 경계는 요청 구간보다 넓을 수 있다. 필터/다운샘플링이 필요하면
            // 행 단위로 펼쳐서 처리한 뒤 단일 청크 [[row, ...]]로 되돌린다.
            // worker는 frames.flat()로 행을 펼치므로 결과는 완전히 동일하다.
            const chunkFrames = flightLog.getChunksInTimeRange(startTime, endTime).map((chunk) => chunk.frames);
            let frames = chunkFrames;
            if (hasRange) {
                const rows = chunkFrames.flat().filter(
                    (frame) => frame[timeIndex] >= startTime && frame[timeIndex] <= endTime,
                );
                if (rows.length === 0) {
                    failure(new Error("Selected range contains no frames"));
                    return;
                }
                frames = [useDownsampling ? selectFramesAtTargetGrid(rows, targetRate, (frame) => frame[timeIndex]) : rows];
            } else if (useDownsampling) {
                frames = [selectFramesAtTargetGrid(chunkFrames.flat(), targetRate, (frame) => frame[timeIndex])];
            }

            const worker = new Worker(new URL("../js/webworkers/csv-export-worker.js", import.meta.url));

            worker.onmessage = (event) => {
                success(event.data);
                worker.terminate();
            };
            worker.onerror = (event) => {
                worker.terminate();
                failure(event);
            };
            worker.onmessageerror = (event) => {
                worker.terminate();
                failure(event);
            };
            worker.postMessage({
                sysConfig: flightLog.getSysConfig(),
                fieldNames: flightLog.getMainFieldNames(),
                frames: frames,
                opts: {
                    columnDelimiter: opts.columnDelimiter,
                    stringDelimiter: opts.stringDelimiter,
                    quoteStrings: opts.quoteStrings,
                },
            });
        } catch (error) {
            failure(error);
        }
    }

    // exposed functions
    return {
        dump: dump,
    };
}
