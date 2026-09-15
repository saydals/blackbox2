import FileSystem from "../js/FileSystem";
import { CsvExporter } from "./csv-exporter.js";
import { GpxExporter } from "./gpx-exporter.js";
import { BblExporter } from "./bbl-exporter.js";

// NOTE: the blackbox-viewer subsystem is English-only for now, so the picker
// descriptions are plain strings rather than i18n keys.
const EXPORT_DESCRIPTIONS = {
    csv: "CSV file",
    gpx: "GPX file",
    bbl: "BBL file",
};

export function suggestedName(logFilename, fileExtension, options = {}) {
    const base = (logFilename || "log").replace(/\.[^/.]+$/, "");

    if (fileExtension === "bbl" && options.flightIndex != null && options.startTime != null && options.endTime != null) {
        const flightNumber = options.flightIndex + 1;
        // start/end는 절대 타임스탬프이므로 비행 시작(minTime) 기준 상대 시간으로 표기한다.
        // 예: flight2_11.0-21.0s_100Hz.bbl
        const baseTime =
            options.baseTime != null && Number.isFinite(options.baseTime) ? options.baseTime : options.startTime;
        const startSec = ((options.startTime - baseTime) / 1000000).toFixed(1);
        const endSec = ((options.endTime - baseTime) / 1000000).toFixed(1);
        let name = `${base}_Flight${flightNumber}_${startSec}s-${endSec}s`;
        if (options.sampleRate != null && Number.isFinite(options.sampleRate)) {
            name += `_${options.sampleRate}Hz`;
        }
        return `${name}.bbl`;
    }

    return `${base}.${fileExtension}`;
}

// Prompt the user for a save location (preserving the export button's user
// gesture), then run the async exporter and write the result through the shared
// FileSystem wrapper. `dumpFn` receives success/failure callbacks where supported.
// The returned promise only settles once the file has actually been written (or
// the export failed/was cancelled), so callers can reliably await completion.
async function saveExport(fileExtension, suggested, dumpFn) {
    let file;
    try {
        file = await FileSystem.pickSaveFile(
            suggested,
            EXPORT_DESCRIPTIONS[fileExtension] || `${fileExtension.toUpperCase()} file`,
            `.${fileExtension}`,
        );
    } catch (error) {
        if (error?.name === "AbortError") {
            return; // user cancelled the dialog
        }
        console.error(`Failed to open save dialog for ${fileExtension.toUpperCase()} export:`, error);
        return;
    }

    if (!file) {
        return;
    }

    const startTime = performance.now();
    await new Promise((resolve) => {
        const onFailure = (error) => {
            console.error(`Failed to export ${fileExtension.toUpperCase()} file:`, error);
            resolve();
        };

        try {
            dumpFn(async (data) => {
                console.debug(
                    `${fileExtension.toUpperCase()} export finished in ${(performance.now() - startTime) / 1000} secs`,
                );
                if (!data) {
                    console.debug("Empty data, nothing to save");
                    resolve();
                    return;
                }
                try {
                    await FileSystem.writeFile(file, data);
                } catch (error) {
                    console.error(`Failed to write ${fileExtension.toUpperCase()} file:`, error);
                } finally {
                    resolve();
                }
            }, onFailure);
        } catch (error) {
            onFailure(error);
        }
    });
}

export function exportCsv(flightLog, logFilename, options = {}) {
    return saveExport("csv", suggestedName(logFilename, "csv"), (onSuccess, onFailure) =>
        CsvExporter(flightLog, options).dump(onSuccess, onFailure),
    );
}

export function exportGpx(flightLog, logFilename) {
    return saveExport("gpx", suggestedName(logFilename, "gpx"), (onSuccess) => GpxExporter(flightLog).dump(onSuccess));
}

export function exportSpectrumToCsv(analyser, logFilename, options = {}) {
    const fileName = analyser.getExportedFileName();
    if (!fileName) {
        console.warn("The export is not supported for this spectrum type");
        return;
    }

    return saveExport("csv", `${fileName}.csv`, (onSuccess) => analyser.exportSpectrumToCSV(onSuccess, options));
}

export function exportBbl(flightLog, rawData, logFilename, startTime, endTime, sampleRate) {
    return saveExport(
        "bbl",
        suggestedName(logFilename, "bbl", {
            flightIndex: flightLog.getLogIndex(),
            startTime,
            endTime,
            baseTime: flightLog.getMinTime(),
            sampleRate,
            originalRate: flightLog.getBlackboxRate(),
        }),
        (onSuccess, onFailure) =>
            BblExporter(flightLog, rawData, startTime, endTime, sampleRate).dump(onSuccess, onFailure),
    );
}

export function generateBbl(flightLog, rawData, startTime, endTime, sampleRate) {
    return new Promise((resolve, reject) => {
        BblExporter(flightLog, rawData, startTime, endTime, sampleRate).dump(resolve, reject);
    });
}
