import { pinia } from "@/js/pinia_instance.js";
import { useLogStore } from "./stores/log.js";
import { useGraphStore } from "./stores/graph.js";
import { useAppStore } from "./stores/app.js";
import { PrefStorage } from "./pref_storage.js";
import { formatTime, stringLoopTime } from "./tools.js";

export function renderLogFileInfo(file) {
    const logStore = useLogStore(pinia);
    const appStore = useAppStore(pinia);

    appStore.logFilename = file.name;

    const logCount = logStore.flightLog.getLogCount();
    const entries = [];
    for (let index = 0; index < logCount; index++) {
        const error = logStore.flightLog.getLogError(index);
        let logLabel;
        if (error) {
            logLabel = error;
        } else {
            logLabel = `${formatTime(logStore.flightLog.getMinTime(index) / 1000, false)} - ${formatTime(
                logStore.flightLog.getMaxTime(index) / 1000,
                false,
            )} [${formatTime(
                Math.ceil((logStore.flightLog.getMaxTime(index) - logStore.flightLog.getMinTime(index)) / 1000),
                false,
            )}]`;
        }
        const label = logCount > 1 ? `${index + 1}/${logCount}: ${logLabel}` : logLabel;
        entries.push({ label, value: index, disabled: !!error });
    }
    logStore.logIndexEntries = entries;
    logStore.activeLogIndex = 0;
}

export function renderSelectedLogInfo() {
    const logStore = useLogStore(pinia);
    const appStore = useAppStore(pinia);
    const graphStore = useGraphStore(pinia);

    logStore.activeLogIndex = logStore.flightLog.getLogIndex();

    if (logStore.flightLog.getNumCellsEstimate()) {
        appStore.statusCells = `${logStore.flightLog.getNumCellsEstimate()}S (${Number(
            logStore.flightLog.getReferenceVoltageMillivolts() / 1000,
        ).toFixed(2)}V)`;
    } else {
        appStore.statusCells = "";
    }

    const sysConfig = logStore.flightLog.getSysConfig();

    const versionText =
        (sysConfig["Craft name"]?.length ? `${sysConfig["Craft name"]} : ` : "") +
        (sysConfig["Firmware revision"] == null ? "" : `${sysConfig["Firmware revision"]}`) +
        (sysConfig.deviceUID == null ? "" : ` (${sysConfig.deviceUID})`);
    appStore.statusVersion = versionText;

    const looptimeText = stringLoopTime(
        sysConfig.looptime,
        sysConfig.pid_process_denom,
        sysConfig.unsynced_fast_pwm,
        sysConfig.motor_pwm_rate,
    );
    appStore.statusLooptime = looptimeText;

    const blackboxRate = logStore.flightLog.getBlackboxRate();
    const lograteText =
        sysConfig["frameIntervalPDenom"] != null && sysConfig["frameIntervalPNum"] != null
            ? `Sample Rate : ${sysConfig["frameIntervalPNum"]}/${sysConfig["frameIntervalPDenom"]} (${blackboxRate.toFixed(0)}Hz)`
            : "";
    appStore.statusLograte = lograteText;

    if (logStore.flightLog.isWrongLogRate()) {
        const actualLogRate = logStore.flightLog.getActualLogRate();
        appStore.statusLograteWarning = `Wrong log rate: ${actualLogRate.toFixed(0)}Hz`;
    } else {
        appStore.statusLograteWarning = null;
    }

    const seekBar = graphStore.seekBar;
    seekBar.setTimeRange(
        logStore.flightLog.getMinTime(),
        logStore.flightLog.getMaxTime(),
        logStore.currentBlackboxTime,
    );
    applySeekBarActivityRange(graphStore, logStore, seekBar);

    const activity = logStore.flightLog.getActivitySummary();
    seekBar.setActivity(activity.times, activity[graphStore.seekBarMode], activity.hasEvent);
    seekBar.repaint();

    if (logStore.flightLog.hasGpsData()) {
        graphStore.mapGrapher.setFlightLog(logStore.flightLog);
    }
}

/**
 * Normalisation range for the seek bar activity graph. The collective mode scales against
 * the FC's collectiveRange header (ref: rfblackbox/js/main.js:424); the other modes keep
 * using the motor output range.
 */
/**
 * Absolute vibration severity bands for the seek bar (deg/s RMS of the high-frequency
 * gyro content, judged on the flight baseline = p50). Calibrated against a known-good
 * and a known-vibrating Rotorflight log; assumes a typical RF gyro LPF (150~250 Hz) —
 * logs recorded with much lower LPF cut-offs inflate the metric. Lower is better.
 */
const NOISE_SEVERITY_BANDS = {
    swashNoise: { green: 50, yellow: 100, orange: 140 },
    tailNoise: { green: 20, yellow: 35, orange: 50 },
};

const SEVERITY_COLORS = {
    green: "#22c55e",
    yellow: "#eab308",
    orange: "#f97316",
    red: "#ef4444",
};

function computeNoiseSeverity(mode, values) {
    const bands = NOISE_SEVERITY_BANDS[mode];
    if (!bands || !values?.length) {
        return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const score = Math.round(sorted[Math.floor(sorted.length * 0.5)]);
    const color =
        score < bands.green
            ? SEVERITY_COLORS.green
            : score < bands.yellow
              ? SEVERITY_COLORS.yellow
              : score < bands.orange
                ? SEVERITY_COLORS.orange
                : SEVERITY_COLORS.red;
    return { score, color };
}

function applySeekBarActivityRange(graphStore, logStore, seekBar) {
    const sysConfig = logStore.flightLog.getSysConfig();
    const mode = graphStore.seekBarMode;
    let range = sysConfig.motorOutput;
    let severity = null;
    if (
        mode === "collective" &&
        sysConfig.collectiveRange?.[0] != null &&
        sysConfig.collectiveRange?.[1] != null
    ) {
        range = sysConfig.collectiveRange;
    } else if (mode === "swashNoise" || mode === "tailNoise") {
        // Vibration modes are relative: normalise against the log's own 95th percentile
        // (with headroom) so a single extreme spike can't flatten the rest of the bar.
        const values = logStore.flightLog.getActivitySummary()[mode] ?? [];
        const sorted = [...values].sort((a, b) => a - b);
        const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
        range = [0, p95 > 0 ? p95 * 1.1 : 1];
        // Absolute severity: whole graph tinted by the log's baseline vibration level.
        severity = computeNoiseSeverity(mode, values);
    }
    seekBar.setActivityRange(range[0], range[1]);
    seekBar.setSeverity(severity ? severity.score : null, severity ? severity.color : null);
}

export function setSeekBarMode(mode) {
    const logStore = useLogStore(pinia);
    const graphStore = useGraphStore(pinia);

    graphStore.seekBarMode = mode;
    // Remember the last-used mode so it survives app restarts
    new PrefStorage().set("seekBarMode", mode);
    if (logStore.flightLog) {
        const seekBar = graphStore.seekBar;
        applySeekBarActivityRange(graphStore, logStore, seekBar);
        const activity = logStore.flightLog.getActivitySummary();
        seekBar.setActivity(activity.times, activity[mode], activity.hasEvent);
        seekBar.repaint();
    }
}
