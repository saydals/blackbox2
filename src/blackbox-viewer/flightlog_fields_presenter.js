import semver from "semver";
import {
    FLIGHT_LOG_FLIGHT_MODE_NAME,
    FLIGHT_LOG_FEATURES,
    FLIGHT_LOG_FLIGHT_STATE_NAME,
    FLIGHT_LOG_FAILSAFE_PHASE_NAME,
    FFT_CALC_STEPS,
    FIRMWARE_TYPE_BETAFLIGHT,
    FIRMWARE_TYPE_CLEANFLIGHT,
    FIRMWARE_TYPE_ROTORFLIGHT,
    getRfDebugModeName,
    getRfDebugModeAll,
    FLIGHT_LOG_FEATURES_RF,
} from "./flightlog_fielddefs";
import { formatTime } from "./tools";
import { useSettingsStore } from "./stores/settings.js";
import {
    getDebugModes,
    getDebugFieldNames,
    decodeDebugFieldToFriendly as sharedDecodeDebugFieldToFriendly,
    convertDebugFieldValue as sharedConvertDebugFieldValue,
} from "../js/utils/debugModes";

/**
 * Resolve the debug_mode name for a parsed log using the shared, API-version
 * keyed definitions (`getDebugModes`). The log's apiVersion is resolved once by
 * the parser (see firmwareToApiVersion) and stored on sysConfig.
 */
function debugModeNameForLog(flightLog) {
    const sysConfig = flightLog.getSysConfig();
    return getDebugModes(sysConfig.apiVersion)[sysConfig.debug_mode];
}

/**
 * Build the hardware-scaling context the shared debug decode/convert helpers
 * need, bound to a parsed FlightLog. Keeps the shared functions free of any
 * FlightLog coupling.
 */
function debugScaleContext(flightLog) {
    const sysConfig = flightLog.getSysConfig();
    return {
        apiVersion: sysConfig.apiVersion,
        motorPoles: sysConfig["motor_poles"],
        accRawToGs: (v) => flightLog.accRawToGs(v),
        gyroRawToDegreesPerSecond: (v) => flightLog.gyroRawToDegreesPerSecond(v),
        rcCommandRawToThrottle: (v) => flightLog.rcCommandRawToThrottle(v),
        throttleToRcCommandRaw: (v) => flightLog.ThrottleTorcCommandRaw(v),
        fftCalcSteps: FFT_CALC_STEPS,
    };
}

export function FlightLogFieldPresenter() {
    // this is intentional
}

const FRIENDLY_FIELD_NAMES = {
    "axisP[all]": "PID P",
    "axisP[0]": "PID P [roll]",
    "axisP[1]": "PID P [pitch]",
    "axisP[2]": "PID P [yaw]",

    "axisI[all]": "PID I",
    "axisI[0]": "PID I [roll]",
    "axisI[1]": "PID I [pitch]",
    "axisI[2]": "PID I [yaw]",

    "axisD[all]": "PID D",
    "axisD[0]": "PID D [roll]",
    "axisD[1]": "PID D [pitch]",
    "axisD[2]": "PID D [yaw]",

    "axisF[all]": "PID Feedforward",
    "axisF[0]": "PID Feedforward [roll]",
    "axisF[1]": "PID Feedforward [pitch]",
    "axisF[2]": "PID Feedforward [yaw]",

    "axisS[all]": "PID S",
    "axisS[0]": "PID S [roll]",
    "axisS[1]": "PID S [pitch]",
    "axisS[2]": "PID S [yaw]",

    //Virtual field
    "axisSum[all]": "PID Sum",
    "axisSum[0]": "PID Sum [roll]",
    "axisSum[1]": "PID Sum [pitch]",
    "axisSum[2]": "PID Sum [yaw]",

    //Virtual field
    "axisError[all]": "PID Error",
    "axisError[0]": "PID Error [roll]",
    "axisError[1]": "PID Error [pitch]",
    "axisError[2]": "PID Error [yaw]",

    //Virtual field
    "rcCommands[all]": "Setpoints",
    "rcCommands[0]": "Setpoint [roll]",
    "rcCommands[1]": "Setpoint [pitch]",
    "rcCommands[2]": "Setpoint [yaw]",
    "rcCommands[3]": "Setpoint [throttle]",

    "rcCommand[all]": "RC Commands",
    "rcCommand[0]": "RC Command [roll]",
    "rcCommand[1]": "RC Command [pitch]",
    "rcCommand[2]": "RC Command [yaw]",
    "rcCommand[3]": "RC Command [throttle]",

    "gyroADC[all]": "Gyros",
    "gyroADC[0]": "Gyro [roll]",
    "gyroADC[1]": "Gyro [pitch]",
    "gyroADC[2]": "Gyro [yaw]",

    "gyroUnfilt[all]": "Unfiltered Gyros",
    "gyroUnfilt[0]": "Unfiltered Gyro [roll]",
    "gyroUnfilt[1]": "Unfiltered Gyro [pitch]",
    "gyroUnfilt[2]": "Unfiltered Gyro [yaw]",

    //End-users prefer 1-based indexing
    "motor[all]": "Motors",
    "motor[0]": "Motor [1]",
    "motor[1]": "Motor [2]",
    "motor[2]": "Motor [3]",
    "motor[3]": "Motor [4]",
    "motor[4]": "Motor [5]",
    "motor[5]": "Motor [6]",
    "motor[6]": "Motor [7]",
    "motor[7]": "Motor [8]",

    "eRPM[all]": "RPM",
    "eRPM[0]": "RPM [1]",
    "eRPM[1]": "RPM [2]",
    "eRPM[2]": "RPM [3]",
    "eRPM[3]": "RPM [4]",
    "eRPM[4]": "RPM [5]",
    "eRPM[5]": "RPM [6]",
    "eRPM[6]": "RPM [7]",
    "eRPM[7]": "RPM [8]",

    "servo[all]": "Servos",
    "servo[5]": "Servo Tail",

    vbatLatest: "Battery volt.",
    amperageLatest: "Amperage",
    baroAlt: "Barometer",

    "heading[all]": "Heading",
    "heading[0]": "Heading [roll]",
    "heading[1]": "Heading [pitch]",
    "heading[2]": "Heading [yaw]",

    "accSmooth[all]": "Accel.",
    "accSmooth[0]": "Accel. [X]",
    "accSmooth[1]": "Accel. [Y]",
    "accSmooth[2]": "Accel. [Z]",

    "magADC[all]": "Compass",
    "magADC[0]": "Compass [X]",
    "magADC[1]": "Compass [Y]",
    "magADC[2]": "Compass [Z]",

    flightModeFlags: "Flight Mode Flags",
    stateFlags: "State Flags",
    failsafePhase: "Failsafe Phase",
    rxSignalReceived: "RX Signal Received",
    rxFlightChannelsValid: "RX Flight Ch. Valid",
    rssi: "RSSI",

    GPS_numSat: "GPS Sat Count",
    "GPS_coord[0]": "GPS Latitude",
    "GPS_coord[1]": "GPS Longitude",
    GPS_altitude: "GPS Altitude ASL",
    GPS_speed: "GPS Speed",
    GPS_ground_course: "GPS Heading",

    "GPS_velned[all]": "GPS NED velocities",
    "GPS_velned[0]": "North velocity",
    "GPS_velned[1]": "East velocity",
    "GPS_velned[2]": "Down velocity",

    "gpsCartesianCoords[all]": "GPS Coords",
    "gpsCartesianCoords[0]": "GPS Coords [X]",
    "gpsCartesianCoords[1]": "GPS Coords [Y]",
    "gpsCartesianCoords[2]": "GPS Coords [Z]",
    gpsDistance: "GPS Home distance",
    gpsHomeAzimuth: "GPS Home azimuth",
    gpsTrajectoryTiltAngle: "GPS Traject. tilt angle",

    "pitot[all]": "Pitot data",
    "pitot[0]": "Airspeed",
    "pitot[1]": "Diff. pressure",
};

// ---------------------------------------------------------------------------
// Rotorflight debug-mode friendly names (ref: rfblackbox/js/flightlog_fields_presenter.js:165-669).
// RF 로그의 debug 필드 라벨 전용 테이블. 공용 debugModes.js(BF 전용)는 건드리지 않는다.
// 키는 DEBUG_MODE_RF_ACTIVE(DEBUG_MODE_RF_4_2/4_3/4_6)의 이름 문자열과 대응한다.
const RF_DEBUG_FRIENDLY_FIELD_NAMES_INITIAL = {
    NONE: {
        "debug[all]": "Debug [all]",
        "debug[0]": "Debug [0]",
        "debug[1]": "Debug [1]",
        "debug[2]": "Debug [2]",
        "debug[3]": "Debug [3]",
        "debug[4]": "Debug [4]",
        "debug[5]": "Debug [5]",
        "debug[6]": "Debug [6]",
        "debug[7]": "Debug [7]",
    },
    CYCLETIME: {
        "debug[all]": "Debug Cycle Time",
        "debug[0]": "Cycle Time",
        "debug[1]": "CPU Load",
        "debug[2]": "Motor Update",
        "debug[3]": "Motor Deviation",
    },
    BATTERY: {
        "debug[all]": "Debug Battery",
        "debug[0]": "Battery Volt. ADC",
        "debug[1]": "Battery Volt.",
        "debug[2]": "Not Used",
        "debug[3]": "Not Used",
    },
    GYRO: {
        "debug[all]": "Debug Gyro",
        "debug[0]": "Gyro Raw [X]",
        "debug[1]": "Gyro Raw [Y]",
        "debug[2]": "Gyro Raw [Z]",
        "debug[3]": "Not Used",
    },
    GYRO_FILTERED: {
        "debug[all]": "Debug Gyro Filtered",
        "debug[0]": "Gyro Filtered [X]",
        "debug[1]": "Gyro Filtered [Y]",
        "debug[2]": "Gyro Filtered [Z]",
        "debug[3]": "Not Used",
    },
    ACCELEROMETER: {
        "debug[all]": "Debug Accel.",
        "debug[0]": "Accel. Raw [X]",
        "debug[1]": "Accel. Raw [Y]",
        "debug[2]": "Accel. Raw [Z]",
        "debug[3]": "Not Used",
    },
    MIXER: {
        "debug[all]": "Debug Mixer",
        "debug[0]": "Roll-Pitch-Yaw Mix [0]",
        "debug[1]": "Roll-Pitch-Yaw Mix [1]",
        "debug[2]": "Roll-Pitch-Yaw Mix [2]",
        "debug[3]": "Roll-Pitch-Yaw Mix [3]",
    },
    PIDLOOP: {
        "debug[all]": "Debug PID",
        "debug[0]": "Step 1",
        "debug[1]": "Step 2",
        "debug[2]": "Step 3",
        "debug[3]": "Step 4",
        "debug[4]": "Step 5",
        "debug[5]": "Step 6",
        "debug[6]": "Step 7",
        "debug[7]": "Step 8",
    },
    NOTCH: {
        "debug[all]": "Debug Notch",
        "debug[0]": "Gyro Pre-Notch [roll]",
        "debug[1]": "Gyro Pre-Notch [pitch]",
        "debug[2]": "Gyro Pre-Notch [yaw]",
        "debug[3]": "Not Used",
    },
    GYRO_SCALED: {
        "debug[all]": "Debug Gyro Scaled",
        "debug[0]": "Gyro Scaled [roll]",
        "debug[1]": "Gyro Scaled [pitch]",
        "debug[2]": "Gyro Scaled [yaw]",
        "debug[3]": "Not Used",
    },
    GYRO_SAMPLE: {
        "debug[all]": "Gyro Sample [debug-axis]",
        "debug[0]": "Gyro Raw",
        "debug[1]": "Gyro Downsampled",
        "debug[2]": "After RPM-filter",
        "debug[3]": "After Lowpass",
        "debug[4]": "After Static Notches",
        "debug[5]": "After Dynamic Notches",
        "debug[6]": "Not Used",
        "debug[7]": "Not Used",
    },
    RC_COMMAND: {
        "debug[all]": "Debug RC Command",
        "debug[0]": "Roll",
        "debug[1]": "Pitch",
        "debug[2]": "Rudder",
        "debug[3]": "Collective",
        "debug[4]": "Throttle",
    },
    RC_SMOOTHING: {
        "debug[all]": "Debug RC Smoothing",
        "debug[0]": "Raw RC Command",
        "debug[1]": "Raw RC Derivative",
        "debug[2]": "Smoothed RC Derivative",
        "debug[3]": "RX Refresh Rate",
    },
    RC_SMOOTHING_RATE: {
        "debug[all]": "Debug RC Smoothing Rate",
        "debug[0]": "Current RX Refresh Rate",
        "debug[1]": "Training Step Count",
        "debug[2]": "Average RX Refresh Rate",
        "debug[3]": "Sampling State",
    },
    DTERM_FILTER: {
        "debug[all]": "Debug Filter",
        "debug[0]": "DTerm Filter [roll]",
        "debug[1]": "DTerm Filter [pitch]",
        "debug[2]": "Not Used",
        "debug[3]": "Not Used",
    },
    ANGLERATE: {
        "debug[all]": "Debug Angle Rate",
        "debug[0]": "Angle Rate[roll]",
        "debug[1]": "Angle Rate[pitch]",
        "debug[2]": "Angle Rate[yaw]",
        "debug[3]": "Not Used",
    },
    ESC_SENSOR: {
        "debug[all]": "ESC Sensor",
        "debug[0]": "ESC 1 RPM",
        "debug[1]": "ESC 1 Temp",
        "debug[2]": "ESC 1 Voltage",
        "debug[3]": "ESC 1 Current",
        "debug[4]": "ESC 2 RPM",
        "debug[5]": "ESC 2 Temp",
        "debug[6]": "ESC 2 Voltage",
        "debug[7]": "ESC 2 Current",
    },
    SCHEDULER: {
        "debug[all]": "Scheduler",
        "debug[0]": "Not Used",
        "debug[1]": "Not Used",
        "debug[2]": "Schedule Time",
        "debug[3]": "Function Exec Time",
    },
    STACK: {
        "debug[all]": "Stack",
        "debug[0]": "Stack High Mem",
        "debug[1]": "Stack Low Mem",
        "debug[2]": "Stack Current",
        "debug[3]": "Stack p",
    },
    DYN_NOTCH: {
        "debug[all]": "Dyn Notch [debug-axis]",
        "debug[0]": "Gyro Pre-filter",
        "debug[1]": "Gyro Post-filter",
        "debug[2]": "Not Used",
        "debug[3]": "Gyro Average",
        "debug[4]": "Notch 1",
        "debug[5]": "Notch 2",
        "debug[6]": "Notch 3",
        "debug[7]": "Notch 4",
    },
    DYN_NOTCH_TIME: {
        "debug[all]": "Dyn Notch timing",
        "debug[0]": "dynNotchUpdate duration",
        "debug[1]": "sdftPushBatch duration",
        "debug[2]": "stepWindow duration",
        "debug[3]": "stepDetectPeaks duration",
        "debug[4]": "stepCalcFreqs duration",
        "debug[5]": "stepUpdate duration",
        "debug[6]": "stateTick",
        "debug[7]": "sampleIndex",
    },
    DYN_NOTCH_FREQ: {
        "debug[all]": "Dyn Notches [debug-axis]",
        "debug[0]": "Notch 1",
        "debug[1]": "Notch 2",
        "debug[2]": "Notch 3",
        "debug[3]": "Notch 4",
        "debug[4]": "Notch 5",
        "debug[5]": "Notch 6",
        "debug[6]": "Notch 7",
        "debug[7]": "Notch 8",
    },
    GYRO_RAW: {
        "debug[all]": "Debug Gyro Raw",
        "debug[0]": "Gyro Raw [X]",
        "debug[1]": "Gyro Raw [Y]",
        "debug[2]": "Gyro Raw [Z]",
        "debug[3]": "Not Used",
    },
    DUAL_GYRO: {
        "debug[all]": "Debug Dual Gyro",
        "debug[0]": "Gyro 1 Filtered [roll]",
        "debug[1]": "Gyro 1 Filtered [pitch]",
        "debug[2]": "Gyro 2 Filtered [roll]",
        "debug[3]": "Gyro 2 Filtered [pitch]",
    },
    DUAL_GYRO_RAW: {
        "debug[all]": "Debug Dual Gyro Raw",
        "debug[0]": "Gyro 1 Raw [roll]",
        "debug[1]": "Gyro 1 Raw [pitch]",
        "debug[2]": "Gyro 2 Raw [roll]",
        "debug[3]": "Gyro 2 Raw [pitch]",
    },
    DUAL_GYRO_COMBINED: {
        "debug[all]": "Debug Dual Combined",
        "debug[0]": "Not Used",
        "debug[1]": "Gyro Filtered [roll]",
        "debug[2]": "Gyro Filtered [pitch]",
        "debug[3]": "Not Used",
    },
    DUAL_GYRO_DIFF: {
        "debug[all]": "Debug Dual Gyro Diff",
        "debug[0]": "Gyro Diff [roll]",
        "debug[1]": "Gyro Diff [pitch]",
        "debug[2]": "Gyro Diff [yaw]",
        "debug[3]": "Not Used",
    },
    ESC_SENSOR_DATA: {
        "debug[all]": "ESC Data",
        "debug[0]": "RPM",
        "debug[1]": "PWM",
        "debug[2]": "Temp",
        "debug[3]": "Voltage",
        "debug[4]": "Current",
        "debug[5]": "Capacity",
        "debug[6]": "Extra",
        "debug[7]": "Age",
    },
    ESC_SENSOR_FRAME: {
        "debug[all]": "ESC Framing",
        "debug[0]": "Byte Count",
        "debug[1]": "Frame Count",
        "debug[2]": "Sync Count",
        "debug[3]": "Sync Errors",
        "debug[4]": "CRC Errors",
        "debug[5]": "Timeouts",
        "debug[6]": "Buffer size",
        "debug[7]": "Not Used",
    },
    DSHOT_RPM_TELEMETRY: {
        "debug[all]": "DShot Telemetry RPM",
        "debug[0]": "Motor 1 - DShot",
        "debug[1]": "Motor 2 - DShot",
        "debug[2]": "Motor 3 - DShot",
        "debug[3]": "Motor 4 - DShot",
    },
    RPM_FILTER: {
        "debug[all]": "RPM Filter",
        "debug[0]": "Motor RPM",
        "debug[1]": "Freq",
        "debug[2]": "Notch",
        "debug[3]": "Update rate",
        "debug[4]": "Motor",
        "debug[5]": "Min Hz",
        "debug[6]": "Max Hz",
        "debug[7]": "Notch Q",
    },
    D_MIN: {
        "debug[all]": "D_MIN",
        "debug[0]": "Gyro Factor [roll]",
        "debug[1]": "Setpoint Factor [roll]",
        "debug[2]": "Actual D [roll]",
        "debug[3]": "Actual D [pitch]",
    },
    ITERM_RELAX: {
        "debug[all]": "I-term Relax",
        "debug[0]": "Setpoint HPF [roll]",
        "debug[1]": "I Relax Factor [roll]",
        "debug[2]": "Relaxed I Error [roll]",
        "debug[3]": "Axis Error [roll]",
    },
    DYN_LPF: {
        "debug[all]": "Debug Dyn LPF",
        "debug[0]": "Gyro Scaled [dbg-axis]",
        "debug[1]": "Notch Center [roll]",
        "debug[2]": "Lowpass Cutoff",
        "debug[3]": "Gyro Pre-Dyn [dbg-axis]",
    },
    AC_CORRECTION: {
        "debug[all]": "AC Correction",
        "debug[0]": "AC Correction [roll]",
        "debug[1]": "AC Correction [pitch]",
        "debug[2]": "AC Correction [yaw]",
        "debug[3]": "Not Used",
    },
    AC_ERROR: {
        "debug[all]": "AC Error",
        "debug[0]": "AC Error [roll]",
        "debug[1]": "AC Error [pitch]",
        "debug[2]": "AC Error [yaw]",
        "debug[3]": "Not Used",
    },
    DUAL_GYRO_SCALED: {
        "debug[all]": "Dual Gyro Scaled",
        "debug[0]": "Gyro 1 [roll]",
        "debug[1]": "Gyro 1 [pitch]",
        "debug[2]": "Gyro 2 [roll]",
        "debug[3]": "Gyro 2 [pitch]",
    },
    DSHOT_RPM_ERRORS: {
        "debug[all]": "DSHOT RPM Error",
        "debug[0]": "DSHOT RPM Error [1]",
        "debug[1]": "DSHOT RPM Error [2]",
        "debug[2]": "DSHOT RPM Error [3]",
        "debug[3]": "DSHOT RPM Error [4]",
    },
    CRSF_LINK_STATISTICS_UPLINK: {
        "debug[all]": "CRSF Stats Uplink",
        "debug[0]": "Uplink RSSI 1",
        "debug[1]": "Uplink RSSI 2",
        "debug[2]": "Uplink Link Quality",
        "debug[3]": "RF Mode",
    },
    CRSF_LINK_STATISTICS_PWR: {
        "debug[all]": "CRSF Stats Power",
        "debug[0]": "Antenna",
        "debug[1]": "SNR",
        "debug[2]": "TX Power",
        "debug[3]": "Not Used",
    },
    CRSF_LINK_STATISTICS_DOWN: {
        "debug[all]": "CRSF Stats Downlink",
        "debug[0]": "Downlink RSSI",
        "debug[1]": "Downlink Link Quality",
        "debug[2]": "Downlink SNR",
        "debug[3]": "Not Used",
    },
    BARO: {
        "debug[all]": "Debug Barometer",
        "debug[0]": "Baro State",
        "debug[1]": "Baro Temperature",
        "debug[2]": "Baro Pressure",
        "debug[3]": "Baro Pressure Sum",
    },
    GPS_RESCUE_THROTTLE_PID: {
        "debug[all]": "GPS Rescue Throttle PID",
        "debug[0]": "Throttle P",
        "debug[1]": "Throttle I",
        "debug[2]": "Throttle D",
        "debug[3]": "Z Velocity",
    },
    DYN_IDLE: {
        "debug[all]": "Dyn Idle",
        "debug[0]": "Motor Range Min Inc",
        "debug[1]": "Target RPS Change Rate",
        "debug[2]": "Error",
        "debug[3]": "Min RPM",
    },
    FF_LIMIT: {
        "debug[all]": "FF Limit",
        "debug[0]": "FF input [roll]",
        "debug[1]": "FF input [pitch]",
        "debug[2]": "FF limited [roll]",
        "debug[3]": "Not Used",
    },
    FF_INTERPOLATED: {
        "debug[all]": "FF Interpolated [roll]",
        "debug[0]": "Setpoint Delta Impl [roll]",
        "debug[1]": "Boost amount [roll]",
        "debug[2]": "Boost amount, clipped [roll]",
        "debug[3]": "Clip amount [roll]",
    },
    RTH: {
        "debug[all]": "RTH",
        "debug[0]": "Rescue Throttle",
        "debug[1]": "Rescue Angle",
        "debug[2]": "Altitude Adjustment",
        "debug[3]": "Rescue State",
    },
    YAW_PRECOMP: {
        "debug[all]": "Yaw Precompensation",
        "debug[0]": "Collective Deflection",
        "debug[1]": "Collective Feedforward",
        "debug[2]": "Collective High Freq FF",
        "debug[3]": "Cyclic Deflection",
        "debug[4]": "Yaw Collective Feedforward",
        "debug[5]": "Yaw Collective High Freq FF",
        "debug[6]": "Yaw Cyclic Feedforward",
        "debug[7]": "Total Precompensation",
    },
    GOVERNOR: {
        "debug[all]": "Governor",
        "debug[0]": "HS Requested",
        "debug[1]": "HS Setpoint",
        "debug[2]": "HS Actual",
        "debug[3]": "Gov PID sum",
        "debug[4]": "Gov P",
        "debug[5]": "Gov I",
        "debug[6]": "Gov D",
        "debug[7]": "Gov F",
    },
    RX_TIMING: {
        "debug[all]": "Receiver Timing",
        "debug[0]": "Average Refresh Rate",
        "debug[1]": "ARR * currentMult",
        "debug[2]": "Current Refresh Rate",
        "debug[3]": "Not Used",
        "debug[4]": "Frame Delta",
        "debug[5]": "Local Delta",
        "debug[6]": "Frame Age",
        "debug[7]": "currentMult",
    },
    FREQ_SENSOR: {
        "debug[all]": "Freq Sensor",
        "debug[0]": "Input Freq",
        "debug[1]": "Freq",
        "debug[2]": "Input Period",
        "debug[3]": "Period",
        "debug[4]": "Zeros",
        "debug[5]": "Prescaler",
    },
    PITCH_PRECOMP: {
        "debug[all]": "Pitch Precompensation",
        "debug[0]": "Collective Deflection",
        "debug[1]": "Pitch Precompensation",
    },
    RESCUE: {
        "debug[all]": "Rescue",
        "debug[0]": "Roll Attitude",
        "debug[1]": "Pitch Attitude",
        "debug[2]": "Yaw Attitude",
        "debug[3]": "Cos Tilt Angle",
        "debug[4]": "Setpoint Roll",
        "debug[5]": "Setpoint Pitch",
        "debug[6]": "Setpoint Yaw",
        "debug[7]": "Setpoint Collective",
    },
    RESCUE_ALTHOLD: {
        "debug[all]": "Rescue Altitude Hold",
        "debug[0]": "Error",
        "debug[1]": "Sqrt Error",
        "debug[2]": "P-term",
        "debug[3]": "I-term",
        "debug[4]": "D-term",
        "debug[5]": "PID Sum",
    },
    SETPOINT: {
        "debug[all]": "Setpoint",
        "debug[0]": "RC Deflection",
        "debug[1]": "SP After Cyclic Ring",
        "debug[2]": "SP After Slew Limit",
        "debug[3]": "SP After Filter",
        "debug[4]": "SP After Rates",
        "debug[5]": "SP Maximum",
        "debug[6]": "Cutoff",
        "debug[7]": "Frame Time",
    },
    TTA: {
        "debug[all]": "Tail Torque Assist",
        "debug[0]": "Stabilized Yaw",
        "debug[1]": "TTA",
        "debug[2]": "Headroom",
        "debug[3]": "TTA Add",
        "debug[4]": "Gov P",
        "debug[5]": "Gov I",
        "debug[6]": "Gov PID Sum",
        "debug[7]": "Gov Target Headspeed",
    },
    AIRBORNE: {
        "debug[all]": "Setpoint",
        "debug[0]": "Sqrt SP Max [roll]",
        "debug[1]": "Sqrt SP Max [pitch]",
        "debug[2]": "Sqrt SP Max [yaw]",
        "debug[3]": "Sqrt SP Max [collective]",
        "debug[4]": "Cos Tilt Angle",
        "debug[5]": "Is Spooled Up",
        "debug[6]": "Is Hands On",
        "debug[7]": "Is Airborne",
    },
    GOV_MOTOR: {
        "debug[all]": "Gov Motor",
        "debug[0]": "RPM Constant",
        "debug[1]": "Motor RPM Constant",
        "debug[2]": "Throttle Estimation",
        "debug[3]": "Minimum Throttle",
        "debug[5]": "Voltage Compensation Gain",
    },
    HS_OFFSET: {
        "debug[all]": "HS Offset",
        "debug[0]": "erroRate",
        "debug[1]": "itermErrorRate",
        "debug[2]": "offMod",
        "debug[3]": "offDelta",
        "debug[4]": "axisError",
        "debug[5]": "axisOffset",
        "debug[6]": "O",
        "debug[7]": "I",
    },
    CROSS_COUPLING: {
        "debug[all]": "Cross Coupling",
        "debug[0]": "Roll Derivative",
        "debug[1]": "Pitch Derivative",
        "debug[2]": "Roll Compensation",
        "debug[3]": "Pitch Compensation",
    },
    POLAR_RATE: {
        "debug[all]": "Polar Rates",
        "debug[0]": "SP Roll",
        "debug[1]": "SP Pitch",
        "debug[2]": "Rate",
        "debug[3]": "Mult",
    },
};

// 버전별 override 캐시 (ref: rfblackbox .../flightlog_fields_presenter.js:671-701 adjustDebugDefsList).
// 참조는 파서가 adjustDebugDefsList를 호출해 전역을 갈아끼우지만, 본 뷰어는 모듈 상태 오염을
// 피하기 위해 firmwareVersion 기반 지연 빌드 캐시로 동일 결과를 만든다.
let rfDebugFriendlyFieldNamesCache = null;
let rfDebugFriendlyFieldNamesCacheVersion = null;

function rfDebugFieldNamesFor(firmwareVersion) {
    if (rfDebugFriendlyFieldNamesCache === null || rfDebugFriendlyFieldNamesCacheVersion !== firmwareVersion) {
        const names = { ...RF_DEBUG_FRIENDLY_FIELD_NAMES_INITIAL };

        if (semver.gte(firmwareVersion, "4.3.0")) {
            names.ITERM_RELAX = {
                "debug[all]": "I-term Relax",
                "debug[0]": "Setpoint",
                "debug[1]": "Gyro Rate",
                "debug[2]": "Setpoint LPF",
                "debug[3]": "Setpoint HPF",
                "debug[4]": "I Relax Factor",
                "debug[5]": "Relaxed I Error",
            };
        }
        if (semver.gte(firmwareVersion, "4.5.0")) {
            names.YAW_PRECOMP = {
                "debug[all]": "Yaw Precompensation",
                "debug[0]": "Total Precompensation",
                "debug[1]": "Main Precompensation",
                "debug[2]": "Main Deflection",
                "debug[3]": "Collective Deflection",
                "debug[4]": "Cyclic Deflection",
                "debug[6]": "Speed Change",
                "debug[7]": "Torque Precompensation",
            };
        }

        rfDebugFriendlyFieldNamesCache = names;
        rfDebugFriendlyFieldNamesCacheVersion = firmwareVersion;
    }
    return rfDebugFriendlyFieldNamesCache;
}

FlightLogFieldPresenter.presentFlags = function (flags, flagNames) {
    let printedFlag = false,
        i = 0,
        result = "";

    while (flags > 0) {
        if ((flags & 1) !== 0) {
            if (printedFlag) {
                result += "|";
            } else {
                printedFlag = true;
            }

            result += flagNames[i];
        }

        // `>>>` and not `>>`: a signed shift coerces to int32, so a set bit 31
        // would turn the value negative and end the loop, hiding the rest.
        flags >>>= 1;
        i++;
    }

    if (printedFlag) {
        return result;
    } else {
        return "0"; //No flags set
    }
};

// Only list events that have changed, flag with eirer go ON or OFF.
FlightLogFieldPresenter.presentChangeEvent = function presentChangeEvent(flags, lastFlags, flagNames) {
    let eventState = "";
    let found = false;
    const maxModeNumber = 32; // int has 32 bit only! We have not to roll bit shift 1<<i for i values grate then 31 !!!
    let modesCount = flagNames.length;
    if (modesCount > maxModeNumber) {
        modesCount = maxModeNumber;
    }
    for (let i = 0; i < modesCount; i++) {
        if ((1 << i) & (flags ^ lastFlags)) {
            // State Changed
            eventState += `${found ? "|" : ""}${flagNames[i]} ${(1 << i) & flags ? "ON" : "OFF"}`;
            found = true;
        }
    }
    if (!found) {
        eventState += " | ACRO";
    } // Catch the state when all flags are off, which is ACRO of course
    return eventState;
};

FlightLogFieldPresenter.presentEnum = function presentEnum(value, enumNames) {
    if (enumNames[value] === undefined) {
        return value;
    }

    return enumNames[value];
};

/**
 * Function to translate altitudes from the default meters
 * to the user selected measurement unit.
 * @param altitude String: Altitude in meters.
 * @param altitudeUnits Integer: 1 for meters, 2 for feet.
 *
 * @returns String: readable meters in selected unit.
 */

FlightLogFieldPresenter.decodeCorrectAltitude = function (altitude, altitudeUnits) {
    switch (altitudeUnits) {
        case 1: // Keep it in meters.
            return `${altitude.toFixed(2)} m`;
        case 2: // Translate it into feet.
            return `${(altitude * 3.28).toFixed(2)} ft`;
    }
};

// Altitude back convertacion function
FlightLogFieldPresenter.decodeAltitudeLogToChart = function (altitude, altitudeUnits) {
    switch (altitudeUnits) {
        case 1: // Keep it in meters.
            return altitude;
        case 2: // Translate it into feet.
            return altitude * 3.28;
    }
};

/**
 * Attempt to decode the given raw logged value into something more human readable, or return an empty string if
 * no better representation is available.
 *
 * @param flightLog The pointer to FlightLog object
 * @param fieldName Name of the field
 * @param value Value of the field
 */
FlightLogFieldPresenter.decodeFieldToFriendly = function (flightLog, fieldName, value, _currentFlightMode) {
    // Rotorflight 로그는 RF 필드셋/스케일로만 디코드한다 (ref: rfblackbox .../flightlog_fields_presenter.js:819-985).
    // BF 경로는 아래 switch에 손대지 않았으므로 출력 불변.
    if (flightLog && flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_ROTORFLIGHT) {
        return FlightLogFieldPresenter.decodeFieldRfToFriendly(flightLog, fieldName, value);
    }
    const { userSettings } = useSettingsStore();
    if (value === undefined) {
        return "";
    }

    const highResolutionScale = flightLog && flightLog.getSysConfig().blackbox_high_resolution > 0 ? 10 : 1;
    const highResolutionAddPrecision = flightLog && flightLog.getSysConfig().blackbox_high_resolution > 0 ? 1 : 0;

    switch (fieldName) {
        case "time":
            return formatTime(value / 1000, true);

        case "gyroADC[0]":
        case "gyroADC[1]":
        case "gyroADC[2]":
        case "gyroUnfilt[0]":
        case "gyroUnfilt[1]":
        case "gyroUnfilt[2]":
            return `${flightLog
                .gyroRawToDegreesPerSecond(value / highResolutionScale)
                .toFixed(highResolutionAddPrecision)} °/s`;

        case "gyroADCs[0]":
        case "gyroADCs[1]":
        case "gyroADCs[2]":
            return `${value.toFixed(0)} °/s`;

        case "axisError[0]":
        case "axisError[1]":
        case "axisError[2]":
            return `${(value / highResolutionScale).toFixed(highResolutionAddPrecision)} °/s`;

        case "rcCommand[0]":
        case "rcCommand[1]":
        case "rcCommand[2]":
            return `${(value / highResolutionScale + 1500).toFixed(highResolutionAddPrecision)} us`;
        case "rcCommand[3]":
            return `${(value / highResolutionScale).toFixed(highResolutionAddPrecision)} us`;

        case "motor[0]":
        case "motor[1]":
        case "motor[2]":
        case "motor[3]":
        case "motor[4]":
        case "motor[5]":
        case "motor[6]":
        case "motor[7]":
            return `${flightLog.rcMotorRawToPctPhysical(value).toFixed(2)} %`;

        case "eRPM[0]":
        case "eRPM[1]":
        case "eRPM[2]":
        case "eRPM[3]":
        case "eRPM[4]":
        case "eRPM[5]":
        case "eRPM[6]":
        case "eRPM[7]": {
            const motor_poles = flightLog.getSysConfig()["motor_poles"];
            return `${((value * 200) / motor_poles).toFixed(0)} rpm / ${((value * 3.333) / motor_poles).toFixed(1)} hz`;
        }
        case "rcCommands[0]":
        case "rcCommands[1]":
        case "rcCommands[2]":
            return `${(value / highResolutionScale).toFixed(highResolutionAddPrecision)} °/s`;
        case "rcCommands[3]":
            return `${value.toFixed(1)}%`;

        case "axisSum[0]":
        case "axisSum[1]":
        case "axisSum[2]":
        case "axisP[0]":
        case "axisP[1]":
        case "axisP[2]":
        case "axisI[0]":
        case "axisI[1]":
        case "axisI[2]":
        case "axisD[0]":
        case "axisD[1]":
        case "axisD[2]":
        case "axisF[0]":
        case "axisF[1]":
        case "axisF[2]":
        case "axisS[0]":
        case "axisS[1]":
        case "axisS[2]":
            return `${flightLog.getPIDPercentage(value).toFixed(1)} %`;

        case "accSmooth[0]":
        case "accSmooth[1]":
        case "accSmooth[2]":
            return `${flightLog.accRawToGs(value).toFixed(2 + highResolutionAddPrecision)} g`;

        case "vbatLatest":
            if (
                flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                semver.gte(flightLog.getSysConfig().firmwareVersion, "4.0.0")
            ) {
                return (
                    `${(value / 100).toFixed(2)}V` +
                    `, ${(value / 100 / flightLog.getNumCellsEstimate()).toFixed(2)} V/cell`
                );
            } else if (
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "3.1.0")) ||
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_CLEANFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "2.0.0"))
            ) {
                return (
                    `${(value / 10).toFixed(2)}V` +
                    `, ${(value / 10 / flightLog.getNumCellsEstimate()).toFixed(2)} V/cell`
                );
            } else {
                return (
                    `${(flightLog.vbatADCToMillivolts(value) / 1000).toFixed(2)}V` +
                    `, ${(flightLog.vbatADCToMillivolts(value) / 1000 / flightLog.getNumCellsEstimate()).toFixed(
                        2,
                    )} V/cell`
                );
            }

        case "amperageLatest":
            if (
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "3.1.7")) ||
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_CLEANFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "2.0.0"))
            ) {
                return (
                    `${(value / 100).toFixed(2)}A` + `, ${(value / 100 / flightLog.getNumMotors()).toFixed(2)} A/motor`
                );
            } else if (
                flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                semver.gte(flightLog.getSysConfig().firmwareVersion, "3.1.0")
            ) {
                return (
                    `${(value / 100).toFixed(2)}A` + `, ${(value / 100 / flightLog.getNumMotors()).toFixed(2)} A/motor`
                );
            } else {
                return (
                    `${(flightLog.amperageADCToMillivolts(value) / 1000).toFixed(2)}A` +
                    `, ${(flightLog.amperageADCToMillivolts(value) / 1000 / flightLog.getNumMotors()).toFixed(
                        2,
                    )} A/motor`
                );
            }

        case "heading[0]":
        case "heading[1]":
        case "heading[2]":
            return `${((value / Math.PI) * 180).toFixed(1)}°`;

        case "baroAlt":
            return FlightLogFieldPresenter.decodeCorrectAltitude(value / 100, userSettings.altitudeUnits);

        case "flightModeFlags":
            return FlightLogFieldPresenter.presentFlags(value, FLIGHT_LOG_FLIGHT_MODE_NAME);

        case "stateFlags":
            return FlightLogFieldPresenter.presentFlags(value, FLIGHT_LOG_FLIGHT_STATE_NAME);

        case "failsafePhase":
            return FlightLogFieldPresenter.presentEnum(value, FLIGHT_LOG_FAILSAFE_PHASE_NAME);

        case "features":
            return FlightLogFieldPresenter.presentEnum(value, FLIGHT_LOG_FEATURES);

        case "rssi":
            return `${((value / 1024) * 100).toFixed(2)} %`;

        //H Field G name:time,GPS_numSat,GPS_coord[0],GPS_coord[1],GPS_altitude,GPS_speed,GPS_ground_course
        case "GPS_numSat":
            return `${value}`;
        case "GPS_coord[0]":
        case "GPS_coord[1]":
            return `${(value / 10000000).toFixed(5)}`;
        case "GPS_altitude":
            return FlightLogFieldPresenter.decodeCorrectAltitude(value / 10, userSettings.altitudeUnits);
        case "GPS_speed":
            switch (userSettings.speedUnits) {
                case 1:
                    return `${(value / 100).toFixed(2)} m/s`;
                case 2:
                    return `${((value / 100) * 3.6).toFixed(2)} kph`;
                case 3:
                    return `${((value / 100) * 2.2369).toFixed(2)} mph`;
                default:
                    return `${(value / 100).toFixed(2)} m/s`;
            }
        case "GPS_ground_course":
            return `${(value / 10).toFixed(1)} °`;

        case "GPS_velned[0]":
        case "GPS_velned[1]":
        case "GPS_velned[2]":
            return `${(value / 100).toFixed(1)} m/s`;

        case "gpsCartesianCoords[0]":
        case "gpsCartesianCoords[1]":
        case "gpsCartesianCoords[2]":
        case "gpsDistance":
            return `${value.toFixed(0)} m`;
        case "gpsHomeAzimuth":
        case "gpsTrajectoryTiltAngle":
            return `${value.toFixed(1)} °`;
        case "magADC[0]":
        case "magADC[1]":
        case "magADC[2]":
            return `${(value / 10).toFixed(1)} °`;

        case "pitot[0]":
            return `${(value / 100).toFixed(1)} m/s`;
        case "pitot[1]":
            return `${value.toFixed(1)} Pa`;

        case "debug[0]":
        case "debug[1]":
        case "debug[2]":
        case "debug[3]":
        case "debug[4]":
        case "debug[5]":
        case "debug[6]":
        case "debug[7]":
            return FlightLogFieldPresenter.decodeDebugFieldToFriendly(flightLog, fieldName, value);

        default:
            return value?.toFixed(0);
    }
};

/**
 * Decode a raw Rotorflight logged value into something human readable
 * (ref: rfblackbox/js/flightlog_fields_presenter.js:819-985).
 * BF decode 경로(decodeFieldToFriendly)는 건드리지 않는다 — RF 로그는
 * decodeFieldToFriendly 선두 분기에서 여기로만 진입한다.
 */
FlightLogFieldPresenter.decodeFieldRfToFriendly = function (flightLog, fieldName, value) {
    if (value === undefined) {
        return "";
    }

    switch (fieldName) {
        case "time":
            return formatTime(value / 1000, true);

        case "rcCommand[0]":
        case "rcCommand[1]":
        case "rcCommand[2]":
        case "rcCommand[3]":
            return `${(value / 5).toFixed(1)} %`;
        case "rcCommand[4]":
            return `${(value / 10).toFixed(1)} %`;

        case "setpoint[0]":
        case "setpoint[1]":
        case "setpoint[2]":
            return `${value.toFixed(0)} °/s`;
        case "setpoint[3]":
            return `${(value * 0.012).toFixed(1)}°`;

        case "mixer[0]":
        case "mixer[1]":
            return `${(value * 0.012).toFixed(1)}°`;
        case "mixer[2]":
            return `${(value * 0.024).toFixed(1)}°`;
        case "mixer[3]":
            return `${(value / 10).toFixed(1)}%`;

        case "axisP[0]":
        case "axisP[1]":
        case "axisP[2]":
        case "axisI[0]":
        case "axisI[1]":
        case "axisI[2]":
        case "axisD[0]":
        case "axisD[1]":
        case "axisD[2]":
        case "axisF[0]":
        case "axisF[1]":
        case "axisF[2]":
        case "axisB[0]":
        case "axisB[1]":
        case "axisB[2]":
        case "axisO[0]":
        case "axisO[1]":
        case "axisO[2]":
        case "axisSum[0]":
        case "axisSum[1]":
        case "axisSum[2]":
        case "axisPD[0]":
        case "axisPD[1]":
        case "axisPD[2]":
            return `${flightLog.getPIDPercentage(value).toFixed(1)}%`;

        case "axisError[0]":
        case "axisError[1]":
        case "axisError[2]":
            return `${Math.round(value)} °/s`;

        case "attitude[0]":
        case "attitude[1]":
        case "attitude[2]":
            return `${(value / 10).toFixed(1)}°`;

        case "gyroADC[0]":
        case "gyroADC[1]":
        case "gyroADC[2]":
        case "gyroRAW[0]":
        case "gyroRAW[1]":
        case "gyroRAW[2]":
            return `${value.toFixed(0)} °/s`;

        case "accADC[0]":
        case "accADC[1]":
        case "accADC[2]":
            return `${flightLog.accRawToGs(value).toFixed(2)}g`;

        case "Vbat":
            return (
                `${(value / 100).toFixed(2)}V (` +
                `${(value / 100 / flightLog.getNumCellsEstimate()).toFixed(2)} V/cell)`
            );
        case "Vbec":
        case "Vbus":
        case "EscV":
        case "Esc2V":
            return `${(value / 100).toFixed(2)}V`;

        case "Ibat":
        case "EscI":
        case "Esc2I":
            return `${(value / 100).toFixed(2)}A`;

        case "Tmcu":
        case "Tesc":
        case "Tesc2":
        case "Tbec":
            return `${value.toFixed(0)}°C`;

        case "EscCap":
        case "Esc2Cap":
            return `${value.toFixed(0)} mAh`;

        case "EscRPM":
        case "Esc2RPM":
            return `${value.toFixed(0)} eRpm`;

        case "EscThr":
        case "EscPwm":
            return `${(value / 10).toFixed(1)}%`;

        case "altitude":
            return `${(value / 100).toFixed(2)}m`;

        case "vario":
            return `${(value / 100).toFixed(2)}m/s`;

        case "rssi":
            return `${((value / 1024) * 100).toFixed(1)}%`;

        case "headspeed":
        case "tailspeed":
            return `${value.toFixed(0)} rpm (${(value / 60).toFixed(1)} Hz)`;

        case "motor[0]":
        case "motor[1]":
        case "motor[2]":
        case "motor[3]":
            // 4단계에서 인라인했던 value/10을 5단계 신설 FlightLog.rcMotorRawToPct 호출로 교체 (인계 완료).
            return `${flightLog.rcMotorRawToPct(value).toFixed(1)} %`;

        case "servo[0]":
        case "servo[1]":
        case "servo[2]":
        case "servo[3]":
        case "servo[4]":
        case "servo[5]":
        case "servo[6]":
        case "servo[7]":
            return `${value.toFixed(0)} µs`;

        case "debug[0]":
        case "debug[1]":
        case "debug[2]":
        case "debug[3]":
        case "debug[4]":
        case "debug[5]":
        case "debug[6]":
        case "debug[7]":
            return FlightLogFieldPresenter.decodeDebugFieldRfToFriendly(flightLog, fieldName, value);

        case "flightModeFlags":
            return FlightLogFieldPresenter.presentFlags(value, FLIGHT_LOG_FLIGHT_MODE_NAME);

        case "stateFlags":
            return FlightLogFieldPresenter.presentFlags(value, FLIGHT_LOG_FLIGHT_STATE_NAME);

        case "failsafePhase":
            return FlightLogFieldPresenter.presentEnum(value, FLIGHT_LOG_FAILSAFE_PHASE_NAME);

        case "features":
            return FlightLogFieldPresenter.presentEnum(value, FLIGHT_LOG_FEATURES_RF);

        default:
            return value.toFixed(0);
    }
};

// __RF_STAGE4_DECODE_APPEND__

/**
 * Decode a raw Rotorflight debug field value (ref: rfblackbox/js/flightlog_fields_presenter.js:987-1345).
 * debug_mode 인덱스→이름은 공용 BF 테이블이 아니라 DEBUG_MODE_RF_ACTIVE(3단계)에서 읽는다.
 */
FlightLogFieldPresenter.decodeDebugFieldRfToFriendly = function (flightLog, fieldName, value) {
    if (flightLog) {
        // NOTE: DEBUG_MODE_RF_ACTIVE를 직접 인덱싱하지 않고 accessor로 읽는다.
        // ESM live binding은 동작하지만, 번들러 차이를 피하고 항상 최신 참조를 보장하기 위함.
        const debugModeName = getRfDebugModeName(flightLog.getSysConfig().debug_mode); // convert to recognisable name
        switch (debugModeName) {
            case "NONE":
            case "AIRMODE":
            case "VELOCITY":
                return "";
            case "CYCLETIME":
                switch (fieldName) {
                    case "debug[1]":
                        return `${value.toFixed(0)}%`;
                    default:
                        return `${value.toFixed(0)} µs`;
                }
            case "PIDLOOP":
                return `${value.toFixed(0)} µs`;
            case "BATTERY":
                switch (fieldName) {
                    case "debug[0]":
                        return value.toFixed(0);
                    default:
                        return `${(value / 10).toFixed(1)}V`;
                }
            case "GYRO":
            case "GYRO_FILTERED":
            case "GYRO_SCALED":
            case "GYRO_SAMPLE":
            case "NOTCH":
            case "DUAL_GYRO":
            case "DUAL_GYRO_COMBINED":
            case "DUAL_GYRO_DIFF":
            case "DUAL_GYRO_RAW":
                return `${Math.round(value)}°/s`;
            case "ACCELEROMETER":
                return `${flightLog.accRawToGs(value).toFixed(2)}g`;
            case "MIXER":
                return `${Math.round(flightLog.rcCommandRawToThrottle(value))} %`;
            case "RC_COMMAND":
                switch (fieldName) {
                    case "debug[0]": // roll
                    case "debug[1]": // pitch
                    case "debug[2]": // rudder
                    case "debug[3]": // collective
                    case "debug[4]": // throttle
                        return `${value.toFixed(0)} µs`;
                }
                break;
            case "RC_SMOOTHING":
                switch (fieldName) {
                    case "debug[0]":
                        return `${(value + 1500).toFixed(0)} µs`;
                    case "debug[3]": // rx frame rate [µs]
                        return `${(value / 1000).toFixed(1)}ms`;
                }
                break;
            case "RC_SMOOTHING_RATE":
                switch (fieldName) {
                    case "debug[0]": // current frame rate [µs]
                    case "debug[2]": // average frame rate [µs]
                        return `${(value / 1000).toFixed(2)}ms`;
                }
                break;
            case "DFILTER":
                return "";
            case "ANGLERATE":
                return `${value.toFixed(0)}°/s`;
            case "ESC_SENSOR":
                switch (fieldName) {
                    case "debug[0]":
                    case "debug[4]":
                        return `${value.toFixed(0)} erpm`;
                    case "debug[1]":
                    case "debug[5]":
                        return `${(value / 10).toFixed(1)} °C`;
                    case "debug[2]":
                    case "debug[6]":
                        return `${(value / 100).toFixed(2)} V`;
                    case "debug[3]":
                    case "debug[7]":
                        return `${(value / 100).toFixed(2)} A`;
                }
                break;
            case "ESC_SENSOR_DATA":
                switch (fieldName) {
                    case "debug[0]":
                        return `${value.toFixed(0)} [erpm]`;
                    case "debug[1]":
                        return `${value.toFixed(0)} [%]`;
                    case "debug[2]":
                        return `${value.toFixed(0)} [°C]`;
                    case "debug[3]":
                        return `${value.toFixed(2)} [V]`;
                    case "debug[4]":
                        return `${value.toFixed(2)} [A]`;
                    case "debug[5]":
                        return `${value.toFixed(0)} [mAh]`;
                    case "debug[6]":
                    case "debug[7]":
                        return value.toFixed(0);
                }
                break;
            case "ESC_SENSOR_FRAME":
                return value.toFixed(0);
            case "SCHEDULER":
                return `${value.toFixed(0)} µs`;
            case "STACK":
                return value.toFixed(0);
            case "DYN_NOTCH":
                switch (fieldName) {
                    case "debug[0]":
                    case "debug[1]":
                        return `${value.toFixed(0)}°/s`;
                    default:
                        return `${value.toFixed(0)} Hz`;
                }
            case "DYN_NOTCH_TIME":
                switch (fieldName) {
                    case "debug[6]":
                    case "debug[7]":
                        return value.toFixed(0);
                    default:
                        return `${value.toFixed(0)} µs`;
                }
            case "DYN_NOTCH_FREQ":
                return `${(value / 10).toFixed(1)} Hz`;
            case "DSHOT_RPM_TELEMETRY":
                return `${((value * 200) / flightLog.getSysConfig()["motor_poles"]).toFixed(0)} rpm`;
            case "RPM_FILTER":
                switch (fieldName) {
                    case "debug[0]": // motor rpm
                        return `${value.toFixed(0)} rpm`;
                    case "debug[1]": // freq
                    case "debug[2]": // notch
                    case "debug[3]": // update rate
                    case "debug[5]": // min hz
                    case "debug[6]": // max hz
                        return `${(value / 10).toFixed(1)} Hz`;
                    case "debug[4]": // motor
                        return value.toFixed(0);
                    case "debug[7]": // notch q
                        return (value / 10).toFixed(1);
                }
                break;
            case "D_MIN":
                switch (fieldName) {
                    case "debug[0]": // roll gyro factor
                    case "debug[1]": // roll setpoint Factor
                        return `${value.toFixed(0)}%`;
                    case "debug[2]": // roll actual D
                    case "debug[3]": // pitch actual D
                        return (value / 10).toFixed(1);
                }
                break;
            case "HS_OFFSET":
                switch (fieldName) {
                    case "debug[0]":
                    case "debug[1]":
                    case "debug[4]":
                    case "debug[5]":
                        return `${(value / 10).toFixed(1)}°/s`;
                    case "debug[3]": // offset delta
                        return `${(value / 1000).toFixed(2)}%`;
                    case "debug[2]": // offset Modulated
                    case "debug[6]": // PID Offset
                    case "debug[7]": // PID I
                        return `${(value / 10).toFixed(1)}%`;
                }
                break;
            case "CROSS_COUPLING":
                switch (fieldName) {
                    case "debug[0]":
                    case "debug[1]":
                        return `${(value / 10).toFixed(1)}°/s^2`;
                    case "debug[2]":
                    case "debug[3]":
                        return `${(value / 100).toFixed(1)}%`;
                }
                break;
            case "ITERM_RELAX":
                if (semver.gte(flightLog.getSysConfig().firmwareVersion, "4.3.0")) {
                    switch (fieldName) {
                        case "debug[0]": // setpoint
                        case "debug[1]": // Gyro Rate
                        case "debug[2]": // setpoint low-pass filtered
                        case "debug[3]": // setpoint high-pass filtered
                            return `${(value / 1000).toFixed(0)}°/s`;
                        case "debug[4]": // I-term relax factor
                            return `${(value / 10).toFixed(0)}%`;
                        case "debug[5]": // Relaxed I Error
                            return (value / 1000).toFixed(1);
                    }
                    break;
                }
                // else
                switch (fieldName) {
                    case "debug[0]": // roll setpoint high-pass filtered
                        return `${value.toFixed(0)}°/s`;
                    case "debug[1]": // roll I-term relax factor
                        return `${value.toFixed(0)}%`;
                    case "debug[3]": // roll absolute control axis error
                        return `${(value / 10).toFixed(1)}deg`;
                }
                break;
            case "DYN_LPF":
                switch (fieldName) {
                    case "debug[0]": // gyro scaled [for selected axis]
                        return `${Math.round(value)}°/s`;
                    default:
                        return `${value.toFixed(0)} Hz`;
                }
            case "DYN_IDLE":
                switch (fieldName) {
                    case "debug[3]": // minRPS best shown as rpm, since commanded value is rpm
                        return value * 6;
                    default:
                        return value.toFixed(0);
                }
            case "AC_ERROR":
                return `${(value / 10).toFixed(1)}deg`;
            case "AC_CORRECTION":
                return `${(value / 10).toFixed(1)}°/s`;
            case "GPS_RESCUE_THROTTLE_PID":
                return value.toFixed(0);
            case "RTH":
                switch (fieldName) {
                    case "debug[1]":
                        return `${(value / 100).toFixed(1)}deg`;
                    default:
                        return value.toFixed(0);
                }
            case "YAW_PRECOMP":
                if (semver.gte(flightLog.getSysConfig().firmwareVersion, "4.5.0")) {
                    switch (fieldName) {
                        case "debug[0]": // Total Precompensation
                        case "debug[1]": // Main Precompensation
                        case "debug[2]": // Main Deflection
                        case "debug[3]": // Collective Deflection
                        case "debug[4]": // Cyclic Deflection
                        case "debug[7]": // Torque Precompensation
                            return `${(value / 10).toFixed(1)}%`;
                        case "debug[6]": // Speed Change
                            return `${value.toFixed(0)}rpm`;
                    }
                    break;
                }
                // else
                switch (fieldName) {
                    case "debug[0]": // collective deflection
                    case "debug[1]": // collective ff
                    case "debug[2]": // collective hf
                    case "debug[3]": // cyclic deflection
                    case "debug[4]": // yaw collective ff
                    case "debug[5]": // yaw collective hf
                    case "debug[6]": // yaw cyclic ff
                    case "debug[7]": // yaw total precomp
                        return `${(value / 10).toFixed(1)}%`;
                }
                break;
            case "GOVERNOR":
                switch (fieldName) {
                    case "debug[0]": // requested head speed
                    case "debug[1]": // target head speed
                    case "debug[2]": // actual head speed
                        return `${value.toFixed(0)}rpm`;
                    case "debug[3]": // gov.pidSum * 1000
                    case "debug[4]": // gov.P * 1000
                    case "debug[5]": // gov.I * 1000
                    case "debug[6]": // gov.D * 1000
                    case "debug[7]": // gov.F * 1000
                        return `${(value / 10).toFixed(1)}%`;
                }
                break;
            case "RX_TIMING":
                switch (fieldName) {
                    case "debug[0]": // average rx refresh rate
                    case "debug[1]": // average rx refresh rate * currentMult
                    case "debug[2]": // current refresh rate
                    case "debug[4]": // frame delta us
                    case "debug[5]": // local delta us
                    case "debug[6]": // frame age us
                        return `${value.toFixed(0)}µs`;
                    case "debug[7]": // currentMult
                        break;
                }
                break;
            case "FREQ_SENSOR":
                switch (fieldName) {
                    case "debug[0]": // input freq
                    case "debug[1]": // freq
                        return `${(value / 1000).toFixed(2)}Hz`;
                    case "debug[2]": // input period
                    case "debug[3]": // period
                        return `${value.toFixed(0)}ticks`;
                    case "debug[4]": // zeros
                    case "debug[5]": // prescaler
                        break;
                }
                break;
            case "PITCH_PRECOMP":
                switch (fieldName) {
                    case "debug[0]": // collective deflection
                    case "debug[1]": // pitch precomp
                        return `${(value / 10).toFixed(1)}%`;
                }
                break;
            case "RESCUE":
                switch (fieldName) {
                    case "debug[0]": // roll attitude
                    case "debug[1]": // pitch attitude
                    case "debug[2]": // yaw attitude
                        return `${(value / 10).toFixed(1)}deg`;
                    case "debug[3]": // cos tilt angle
                        return (value / 1000).toFixed(2);
                    case "debug[4]": // setpoint roll
                    case "debug[5]": // setpoint pitch
                    case "debug[6]": // setpoint yaw
                        return `${value.toFixed(0)} °/s`;
                    case "debug[7]": // setpoint collective
                        break;
                }
                break;
            case "SETPOINT":
                switch (fieldName) {
                    case "debug[0]": // rc deflection
                    case "debug[1]": // sp after cyclic ring
                    case "debug[2]": // sp after slew limit
                    case "debug[3]": // sp after filter
                        return `${(value / 10).toFixed(1)}%`;
                    case "debug[4]": // sp after rates
                    case "debug[5]": // maximum
                    case "debug[6]": // cutoff
                        break;
                    case "debug[7]": // frame rate
                        return `${value.toFixed(0)} µs`;
                }
                break;
            case "AIRBORNE":
                switch (fieldName) {
                    case "debug[0]": // sqrt sp max roll
                    case "debug[1]": // sqrt sp max pitch
                    case "debug[2]": // sqrt sp max yaw
                    case "debug[3]": // sqrt sp max collective
                    case "debug[4]": // cos tilt angle
                        return (value / 1000).toFixed(2);
                    case "debug[5]": // is spooled up
                    case "debug[6]": // is hands on
                    case "debug[7]": // is airborne
                        break;
                }
                break;
        }
        return value.toFixed(0);
    }
    return "";
};

FlightLogFieldPresenter.decodeDebugFieldToFriendly = function (flightLog, fieldName, value) {
    if (!flightLog) {
        return value.toFixed(0);
    }
    return sharedDecodeDebugFieldToFriendly(
        debugModeNameForLog(flightLog),
        fieldName,
        value,
        debugScaleContext(flightLog),
    );
};

FlightLogFieldPresenter.fieldNameToFriendly = function (fieldName, debugMode, apiVersion, firmwareType, firmwareVersion) {
    if (debugMode) {
        // Rotorflight: RF debug 테이블(3단계 DEBUG_MODE_RF_ACTIVE + 본 파일 RF 라벨 테이블)을 우선 참조한다.
        // 동작 계약: BF/기타 펌웨어는 아래 기존 경로 그대로 — firmwareType 미전달(undefined)도 BF 경로.
        if (firmwareType === FIRMWARE_TYPE_ROTORFLIGHT) {
            if (fieldName.includes("debug")) {
                // NOTE: 아래 3줄은 accessor 경유 (live binding 함정 회피 — fielddefs 주석 참조).
                const debugModeName = getRfDebugModeName(debugMode);
                const rfFieldNames = firmwareVersion ? rfDebugFieldNamesFor(firmwareVersion) : RF_DEBUG_FRIENDLY_FIELD_NAMES_INITIAL;
                let debugFields;

                if (debugModeName) {
                    debugFields = rfFieldNames[debugModeName];
                }

                if (!debugFields) {
                    if (fieldName === "debug[all]") {
                        return `Debug (${debugModeName || debugMode})`;
                    }
                    debugFields = rfFieldNames[getRfDebugModeAll()[0]];
                }

                return debugFields?.[fieldName] ?? fieldName;
            }
        }
        if (fieldName.includes("debug")) {
            const modes = getDebugModes(apiVersion);
            const fieldNames = getDebugFieldNames(apiVersion);
            const debugModeName = modes[debugMode];
            let debugFields;

            if (debugModeName) {
                debugFields = fieldNames[debugModeName];
            }

            if (!debugFields) {
                if (fieldName === "debug[all]") {
                    return `Debug (${debugModeName || debugMode})`;
                }
                debugFields = fieldNames[modes[0]];
            }

            return debugFields[fieldName] ?? fieldName;
        }
    }
    if (FRIENDLY_FIELD_NAMES[fieldName]) {
        return FRIENDLY_FIELD_NAMES[fieldName];
    }

    return fieldName;
};

/**
 * Attempt to decode fields values from log file to chart units and back.
 *
 * @param flightLog The pointer to FlightLog object
 * @param fieldName Name of the field
 * @param value Value of the field
 * @param toFriendly If true then convert from log file units to charts, else - from charts units to log file
 */
FlightLogFieldPresenter.ConvertFieldValue = function (flightLog, fieldName, toFriendly, value) {
    const { userSettings } = useSettingsStore();
    if (value === undefined) {
        return 0;
    }

    // RF chart-unit conversion for RF-only fields (reference has no ConvertFieldValue;
    // these mirror decodeFieldRfToFriendly scales so chart min/max match displayed values).
    // Returns undefined for shared/BF fields so they fall through to the BF switch untouched.
    if (flightLog && flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_ROTORFLIGHT) {
        const rfConverted = FlightLogFieldPresenter.ConvertFieldRfValue(flightLog, fieldName, toFriendly, value);
        if (rfConverted !== undefined) {
            return rfConverted;
        }
    }

    const highResolutionScale = flightLog && flightLog.getSysConfig().blackbox_high_resolution > 0 ? 10 : 1;

    switch (fieldName) {
        case "time":
            return toFriendly ? value / 1000 : value * 1000;

        case "gyroADC[0]":
        case "gyroADC[1]":
        case "gyroADC[2]":
        case "gyroUnfilt[0]":
        case "gyroUnfilt[1]":
        case "gyroUnfilt[2]":
            return toFriendly
                ? flightLog.gyroRawToDegreesPerSecond(value / highResolutionScale)
                : (value * highResolutionScale) / flightLog.gyroRawToDegreesPerSecond(1);

        case "axisError[0]":
        case "axisError[1]":
        case "axisError[2]":
            return toFriendly ? value / highResolutionScale : value * highResolutionScale;

        case "rcCommand[0]":
        case "rcCommand[1]":
        case "rcCommand[2]":
            return toFriendly ? value / highResolutionScale + 1500 : (value - 1500) * highResolutionScale;
        case "rcCommand[3]":
            return toFriendly ? value / highResolutionScale : value * highResolutionScale;

        case "motor[0]":
        case "motor[1]":
        case "motor[2]":
        case "motor[3]":
        case "motor[4]":
        case "motor[5]":
        case "motor[6]":
        case "motor[7]":
            return toFriendly ? flightLog.rcMotorRawToPctPhysical(value) : flightLog.PctPhysicalTorcMotorRaw(value);

        case "eRPM[0]":
        case "eRPM[1]":
        case "eRPM[2]":
        case "eRPM[3]":
        case "eRPM[4]":
        case "eRPM[5]":
        case "eRPM[6]":
        case "eRPM[7]": {
            const motor_poles = flightLog.getSysConfig()["motor_poles"];
            return toFriendly ? (value * 200) / motor_poles : (value * motor_poles) / 200;
        }
        case "axisSum[0]":
        case "axisSum[1]":
        case "axisSum[2]":
        case "axisP[0]":
        case "axisP[1]":
        case "axisP[2]":
        case "axisI[0]":
        case "axisI[1]":
        case "axisI[2]":
        case "axisD[0]":
        case "axisD[1]":
        case "axisD[2]":
        case "axisF[0]":
        case "axisF[1]":
        case "axisF[2]":
        case "axisS[0]":
        case "axisS[1]":
        case "axisS[2]":
            return toFriendly ? flightLog.getPIDPercentage(value) : value / flightLog.getPIDPercentage(1);

        case "accSmooth[0]":
        case "accSmooth[1]":
        case "accSmooth[2]":
            return toFriendly ? flightLog.accRawToGs(value) : value / flightLog.accRawToGs(1);

        case "vbatLatest":
            if (
                flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                semver.gte(flightLog.getSysConfig().firmwareVersion, "4.0.0")
            ) {
                return toFriendly ? value / 100 : value * 100;
            } else if (
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "3.1.0")) ||
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_CLEANFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "2.0.0"))
            ) {
                return toFriendly ? value / 10 : value * 10;
            } else {
                return toFriendly ? value / 1000 : value * 1000;
            }

        case "amperageLatest":
            if (
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "3.1.7")) ||
                (flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_CLEANFLIGHT &&
                    semver.gte(flightLog.getSysConfig().firmwareVersion, "2.0.0"))
            ) {
                return toFriendly ? value / 100 : value * 100;
            } else if (
                flightLog.getSysConfig().firmwareType === FIRMWARE_TYPE_BETAFLIGHT &&
                semver.gte(flightLog.getSysConfig().firmwareVersion, "3.1.0")
            ) {
                return toFriendly ? value / 100 : value * 100;
            } else {
                return toFriendly ? value / 1000 : value * 1000;
            }

        case "heading[0]":
        case "heading[1]":
        case "heading[2]":
            return toFriendly ? (value / Math.PI) * 180 : (value * Math.PI) / 180;

        case "baroAlt":
            return toFriendly
                ? FlightLogFieldPresenter.decodeAltitudeLogToChart(value / 100, userSettings.altitudeUnits)
                : (value * 100) / FlightLogFieldPresenter.decodeAltitudeLogToChart(1, userSettings.altitudeUnits);

        case "flightModeFlags":
            return value;

        case "stateFlags":
            return value;

        case "failsafePhase":
            return value;

        case "features":
            return value;

        case "rssi":
            return toFriendly ? (value / 1024) * 100 : (value * 1024) / 100;

        //H Field G name:time,GPS_numSat,GPS_coord[0],GPS_coord[1],GPS_altitude,GPS_speed,GPS_ground_course
        case "GPS_numSat":
            return value;
        case "GPS_coord[0]":
        case "GPS_coord[1]":
            return toFriendly ? value / 10000000 : value * 10000000;
        case "GPS_altitude":
            return toFriendly
                ? FlightLogFieldPresenter.decodeAltitudeLogToChart(value / 10, userSettings.altitudeUnits)
                : (value * 10) / FlightLogFieldPresenter.decodeAltitudeLogToChart(1, userSettings.altitudeUnits);
        case "GPS_speed":
            switch (userSettings.speedUnits) {
                case 1:
                    return toFriendly ? value / 100 : value * 100; // m/s
                case 2:
                    return toFriendly ? (value / 100) * 3.6 : (100 * value) / 3.6; // kph
                case 3:
                    return toFriendly ? (value / 100) * 2.2369 : (value * 100) / 2.2369; //mph
                default:
                    return toFriendly ? value / 100 : value * 100; // m/s
            }
        case "GPS_ground_course":
            return toFriendly ? value / 10 : value * 10;
        case "GPS_velned[0]":
        case "GPS_velned[1]":
        case "GPS_velned[2]":
            return toFriendly ? value / 100 : value * 100;
        case "magADC[0]":
        case "magADC[1]":
        case "magADC[2]":
            return toFriendly ? value / 10 : value * 10;

        case "pitot[0]":
            return toFriendly ? value / 100 : value * 100;

        case "debug[0]":
        case "debug[1]":
        case "debug[2]":
        case "debug[3]":
        case "debug[4]":
        case "debug[5]":
        case "debug[6]":
        case "debug[7]":
            return FlightLogFieldPresenter.ConvertDebugFieldValue(flightLog, fieldName, toFriendly, value);

        default:
            return value;
    }
};

    /**
     * RF-only chart-unit conversion (mirrors decodeFieldRfToFriendly scales).
     * Returns undefined for fields the BF switch must handle (shared names like
     * time/gyroADC/axisError/rssi/flightModeFlags) so ConvertFieldValue falls through.
     */
    FlightLogFieldPresenter.ConvertFieldRfValue = function (flightLog, fieldName, toFriendly, value) {
        switch (fieldName) {
            case "rcCommand[0]":
            case "rcCommand[1]":
            case "rcCommand[2]":
            case "rcCommand[3]":
                return toFriendly ? value / 5 : value * 5;
            case "rcCommand[4]":
                return toFriendly ? value / 10 : value * 10;

            case "setpoint[0]":
            case "setpoint[1]":
            case "setpoint[2]":
                return value;
            case "setpoint[3]":
                return toFriendly ? value * 0.012 : value / 0.012;

            case "mixer[0]":
            case "mixer[1]":
                return toFriendly ? value * 0.012 : value / 0.012;
            case "mixer[2]":
                return toFriendly ? value * 0.024 : value / 0.024;
            case "mixer[3]":
                return toFriendly ? value / 10 : value * 10;

            case "axisP[0]":
            case "axisP[1]":
            case "axisP[2]":
            case "axisI[0]":
            case "axisI[1]":
            case "axisI[2]":
            case "axisD[0]":
            case "axisD[1]":
            case "axisD[2]":
            case "axisF[0]":
            case "axisF[1]":
            case "axisF[2]":
            case "axisB[0]":
            case "axisB[1]":
            case "axisB[2]":
            case "axisO[0]":
            case "axisO[1]":
            case "axisO[2]":
            case "axisSum[0]":
            case "axisSum[1]":
            case "axisSum[2]":
            case "axisPD[0]":
            case "axisPD[1]":
            case "axisPD[2]":
                return toFriendly ? flightLog.getPIDPercentage(value) : value / flightLog.getPIDPercentage(1);

            case "attitude[0]":
            case "attitude[1]":
            case "attitude[2]":
                return toFriendly ? value / 10 : value * 10;

            case "gyroRAW[0]":
            case "gyroRAW[1]":
            case "gyroRAW[2]":
                return value;

            case "accADC[0]":
            case "accADC[1]":
            case "accADC[2]":
                return toFriendly ? flightLog.accRawToGs(value) : value / flightLog.accRawToGs(1);

            case "Vbat":
            case "Vbec":
            case "Vbus":
            case "EscV":
            case "Esc2V":
                return toFriendly ? value / 100 : value * 100;

            case "Ibat":
            case "EscI":
            case "Esc2I":
                return toFriendly ? value / 100 : value * 100;

            case "Tmcu":
            case "Tesc":
            case "Tesc2":
            case "Tbec":
            case "EscCap":
            case "Esc2Cap":
            case "EscRPM":
            case "Esc2RPM":
                return value;

            case "EscThr":
            case "EscPwm":
                return toFriendly ? value / 10 : value * 10;

            case "altitude":
            case "vario":
                return toFriendly ? value / 100 : value * 100;

            case "headspeed":
            case "tailspeed":
                return value;

            case "motor[0]":
            case "motor[1]":
            case "motor[2]":
            case "motor[3]":
                // rcMotorRawToPct(1) = 0.1 — truthy, so no div-by-zero. Written defensively
                // because flightLog is stubbed in unit harnesses.
                return toFriendly ? flightLog.rcMotorRawToPct(value) : value / flightLog.rcMotorRawToPct(1);

            case "servo[0]":
            case "servo[1]":
            case "servo[2]":
            case "servo[3]":
            case "servo[4]":
            case "servo[5]":
            case "servo[6]":
            case "servo[7]":
                return value;

            default:
                return undefined;
        }
    };

/**
 * Attempt to decode debug fields values from log file to chart units and back.
 *
 * @param flightLog The pointer to FlightLog object
 * @param fieldName Name of the field
 * @param value Value of the field
 * @param toFriendly If true then convert from log file units to charts, else - from charts units to log file
 */
FlightLogFieldPresenter.ConvertDebugFieldValue = function (flightLog, fieldName, toFriendly, value) {
    if (!flightLog) {
        return value;
    }
    return sharedConvertDebugFieldValue(
        debugModeNameForLog(flightLog),
        fieldName,
        toFriendly,
        value,
        debugScaleContext(flightLog),
    );
};
