import semver from "semver";

function makeReadOnly(x) {
    // Make read-only if browser supports it:
    if (Object.freeze) {
        return Object.freeze(x);
    }

    // Otherwise a no-op
    return x;
}

// Firmware type constants
export const FIRMWARE_TYPE_UNKNOWN = 0;
export const FIRMWARE_TYPE_BASEFLIGHT = 1;
export const FIRMWARE_TYPE_CLEANFLIGHT = 2;
export const FIRMWARE_TYPE_BETAFLIGHT = 3;
export const FIRMWARE_TYPE_INAV = 4;
export const FIRMWARE_TYPE_ROTORFLIGHT = 5;

// Some constants used at different places
export const MAX_MOTOR_NUMBER = 8;
// Rotorflight motor limit (ref: rfblackbox/js/flightlog_fielddefs.js:14 `MAX_MOTOR_NUMBER = 4`).
// 3단계에서는 상수만 추가하고, 5단계에서 estimateNumMotors 등 사용처를 firmwareType으로 분기한다.
// (지금 8→4로 바꾸면 BF 8모터 로그가 깨지므로 금지.)
export const MAX_MOTOR_NUMBER_RF = 4;
// Rotorflight servo channels: swash 3 + tail 1 포함 8ch (todolist 본문 요구사항).
export const MAX_SERVO_NUMBER_RF = 8;
export const DSHOT_MIN_VALUE = 48;
const DSHOT_MAX_VALUE = 2047;
export const DSHOT_RANGE = DSHOT_MAX_VALUE - DSHOT_MIN_VALUE;

// Fields definitions for lists
// NOTE(3단계): BF 전용 이벤트(AUTOTUNE_*/GTUNE_*/TWITCH_TEST)는 유지한다.
// RF 로그에는 등장하지 않지만 삭제 시 grapher.js/parser switch의 case 참조가
// 깨지므로, RF 이벤트는 추가만 하고 기존 키는 절대 제거하지 않는다.
export const FlightLogEvent = makeReadOnly({
    SYNC_BEEP: 0,

    AUTOTUNE_CYCLE_START: 10,
    AUTOTUNE_CYCLE_RESULT: 11,
    AUTOTUNE_TARGETS: 12,
    INFLIGHT_ADJUSTMENT: 13,
    LOGGING_RESUME: 14,
    DISARM: 15,

    GTUNE_CYCLE_RESULT: 20,
    FLIGHT_MODE: 30,
    TWITCH_TEST: 40, // Feature for latency testing

    // Rotorflight events (ref: rfblackbox/js/flightlog_fielddefs.js:26-31).
    // 50/51/52/100/101은 BF 테이블과 겹치지 않으므로 안전하게 추가 가능.
    GOVERNOR_STATE: 50,
    RESCUE_STATE: 51,
    AIRBORNE_STATE: 52,

    CUSTOM_DATA: 100,
    CUSTOM_STRING: 101,

    CUSTOM: 250, // Virtual Event Code - Never part of Log File.
    CUSTOM_BLANK: 251, // Virtual Event Code - Never part of Log File. - No line shown
    LOG_END: 255,
});

// Add a general axis index.
export const AXIS = makeReadOnly({
    ROLL: 0,
    PITCH: 1,
    YAW: 2,
});

export let FLIGHT_LOG_FLIGHT_MODE_NAME = [];

export const FLIGHT_LOG_FLIGHT_MODE_NAME_RF_4_2 = makeReadOnly([
    "ARM",
    "ANGLE",
    "HORIZON",
    "PASSTHRU",
    "FAILSAFE",
    "RESCUE",
    "GPSRESCUE",
    "CAMSTAB",
    "BEEPER",
    "LEDLOW",
    "CALIB",
    "OSD",
    "TELEMETRY",
    "SERVO1",
    "SERVO2",
    "SERVO3",
    "BLACKBOX",
    "BLACKBOXERASE",
    "CAMERA1",
    "CAMERA2",
    "CAMERA3",
    "PREARM",
    "BEEPGPSCOUNT",
    "VTXPITMODE",
    "PARALYZE",
    "USER1",
    "USER2",
    "USER3",
    "USER4",
    "ACROTRAINER",
    "VTXCONTROLDISABLE",
]);

export const FLIGHT_LOG_FLIGHT_MODE_NAME_RF_4_3 = makeReadOnly([
    "ARM",
    "ANGLE",
    "HORIZON",
    "TRAINER",
    "ALTHOLD",
    "RESCUE",
    "GPSRESCUE",
    "FAILSAFE",
    "PREARM",
    "PARALYZE",
    "BEEPERON",
    "BEEPERMUTE",
    "LEDLOW",
    "CALIB",
    "OSD",
    "TELEMETRY",
    "BEEPGPSCOUNT",
    "BLACKBOX",
    "BLACKBOXERASE",
    "CAMERA1",
    "CAMERA2",
    "CAMERA3",
    "VTXPITMODE",
    "VTXCONTROLDISABLE",
    "STICKCOMMANDDISABLE",
    "USER1",
    "USER2",
    "USER3",
    "USER4",
]);

export const FLIGHT_LOG_FLIGHT_MODE_NAME_RF_4_6 = makeReadOnly([
    "ARM",
    "ANGLE",
    "HORIZON",
    "TRAINER",
    "ALTHOLD",
    "RESCUE",
    "GPSRESCUE",
    "FAILSAFE",
    "PREARM",
    "PARALYZE",
    "BEEPERON",
    "BEEPERMUTE",
    "LEDLOW",
    "CALIB",
    "OSD",
    "TELEMETRY",
    "BEEPGPSCOUNT",
    "BLACKBOX",
    "BLACKBOXERASE",
    "CAMERA1",
    "CAMERA2",
    "CAMERA3",
    "VTXPITMODE",
    "VTXCONTROLDISABLE",
    "STICKCOMMANDDISABLE",
    "GOVFALLBACK",
    "GOVSUSPEND",
    "GOVBYPASS",
    "USER1",
    "USER2",
    "USER3",
    "USER4",
]);

export const FLIGHT_LOG_FLIGHT_MODE_NAME_PRE_3_3 = makeReadOnly([
    "ARM",
    "ANGLE",
    "HORIZON",
    "BARO",
    "ANTIGRAVITY",
    "MAG",
    "HEADFREE",
    "HEADADJ",
    "CAMSTAB",
    "CAMTRIG",
    "GPSHOME",
    "GPSHOLD",
    "PASSTHRU",
    "BEEPER",
    "LEDMAX",
    "LEDLOW",
    "LLIGHTS",
    "CALIB",
    "GOV",
    "OSD",
    "TELEMETRY",
    "GTUNE",
    "SONAR",
    "SERVO1",
    "SERVO2",
    "SERVO3",
    "BLACKBOX",
    "FAILSAFE",
    "AIRMODE",
    "3DDISABLE",
    "FPVANGLEMIX",
    "BLACKBOXERASE",
    "CAMERA1",
    "CAMERA2",
    "CAMERA3",
    "FLIPOVERAFTERCRASH",
    "PREARM",
]);

export const FLIGHT_LOG_FLIGHT_MODE_NAME_POST_3_3 = makeReadOnly([
    "ARM",
    "ANGLE",
    "HORIZON",
    "MAG",
    "BARO",
    "GPSHOME",
    "GPSHOLD",
    "HEADFREE",
    "PASSTHRU",
    "RANGEFINDER",
    "FAILSAFE",
    "GPSRESCUE",
    "ANTIGRAVITY",
    "HEADADJ",
    "CAMSTAB",
    "CAMTRIG",
    "BEEPER",
    "LEDMAX",
    "LEDLOW",
    "LLIGHTS",
    "CALIB",
    "GOV",
    "OSD",
    "TELEMETRY",
    "GTUNE",
    "SERVO1",
    "SERVO2",
    "SERVO3",
    "BLACKBOX",
    "AIRMODE",
    "3D",
    "FPVANGLEMIX",
    "BLACKBOXERASE",
    "CAMERA1",
    "CAMERA2",
    "CAMERA3",
    "FLIPOVERAFTERCRASH",
    "PREARM",
    "BEEPGPSCOUNT",
    "VTXPITMODE",
    "USER1",
    "USER2",
    "USER3",
    "USER4",
    "PIDAUDIO",
    "ACROTRAINER",
    "VTXCONTROLDISABLE",
    "LAUNCHCONTROL",
]);

export const FLIGHT_LOG_FLIGHT_MODE_NAME_POST_4_5 = makeReadOnly([
    "ARM",
    "ANGLE",
    "HORIZON",
    "MAG",
    "ALTHOLD",
    "HEADFREE",
    "CHIRP",
    "PASSTHRU",
    "FAILSAFE",
    "POSHOLD",
    "GPSRESCUE",
    "ANTIGRAVITY",
    "HEADADJ",
    "CAMSTAB",
    "BEEPER",
    "LEDLOW",
    "CALIB",
    "OSD",
    "TELEMETRY",
    "SERVO1",
    "SERVO2",
    "SERVO3",
    "BLACKBOX",
    "AIRMODE",
    "3D",
    "FPVANGLEMIX",
    "BLACKBOXERASE",
    "CAMERA1",
    "CAMERA2",
    "CAMERA3",
    "FLIPOVERAFTERCRASH",
    "PREARM",
    "BEEPGPSCOUNT",
    "VTXPITMODE",
    "USER1",
    "USER2",
    "USER3",
    "USER4",
    "PIDAUDIO",
    "ACROTRAINER",
    "VTXCONTROLDISABLE",
    "LAUNCHCONTROL",
]);

export const FLIGHT_LOG_FEATURES = makeReadOnly([
    "RX_PPM",
    "VBAT",
    "INFLIGHT_ACC_CAL",
    "RX_SERIAL",
    "MOTOR_STOP",
    "SERVO_TILT",
    "SOFTSERIAL",
    "GPS",
    "FAILSAFE",
    "SONAR",
    "TELEMETRY",
    "CURRENT_METER",
    "3D",
    "RX_PARALLEL_PWM",
    "RX_MSP",
    "RSSI_ADC",
    "LED_STRIP",
    "DISPLAY",
    "ONESHOT125",
    "BLACKBOX",
    "CHANNEL_FORWARDING",
    "TRANSPONDER",
    "AIRMODE",
    "SUPEREXPO_RATES",
]);

// BF feature bit list alias (ref: rfblackbox/js/flightlog_fielddefs.js:242 `FLIGHT_LOG_FEATURES_BF`).
// 3단계까지는 adjustFieldDefsList가 RF 로그에만 RF 테이블을 대입하고 BF/기타 로그는
// 이 BF 리스트를 그대로 쓰므로, 기존 동작과 바이트 단위로 동일하다.
export const FLIGHT_LOG_FEATURES_BF = FLIGHT_LOG_FEATURES;

// Rotorflight feature bit lists (ref: rfblackbox/js/flightlog_fielddefs.js:269-335).
// Bit index == 배열 index. BF와 달리 GOVERNOR/ESC_SENSOR/FREQ_SENSOR 등이 비트를 차지한다.
export const FLIGHT_LOG_FEATURES_RF_4_2 = makeReadOnly([
    "RX_PPM",
    "UNUSED1",
    "INFLIGHT_ACC_CAL",
    "RX_SERIAL",
    "UNUSED4",
    "UNUSED5",
    "SOFTSERIAL",
    "GPS",
    "UNUSED8",
    "SONAR",
    "TELEMETRY",
    "UNUSED11",
    "UNUSED12",
    "RX_PARALLEL_PWM",
    "RX_MSP",
    "RSSI_ADC",
    "LED_STRIP",
    "DISPLAY",
    "OSD",
    "UNUSED19",
    "UNUSED20",
    "UNUSED21",
    "UNUSED22",
    "UNUSED23",
    "UNUSED24",
    "RX_SPI",
    "GOVERNOR",
    "ESC_SENSOR",
    "FREQ_SENSOR",
    "DYNAMIC_FILTER",
    "RPM_FILTER",
]);

export const FLIGHT_LOG_FEATURES_RF_4_3 = makeReadOnly([
    "RX_PPM",
    "UNUSED1",
    "UNUSED2",
    "RX_SERIAL",
    "UNUSED4",
    "UNUSED5",
    "SOFTSERIAL",
    "GPS",
    "UNUSED8",
    "SONAR",
    "TELEMETRY",
    "UNUSED11",
    "UNUSED12",
    "RX_PARALLEL_PWM",
    "RX_MSP",
    "RSSI_ADC",
    "LED_STRIP",
    "DISPLAY",
    "OSD",
    "UNUSED19",
    "UNUSED20",
    "UNUSED21",
    "UNUSED22",
    "UNUSED23",
    "UNUSED24",
    "RX_SPI",
    "GOVERNOR",
    "ESC_SENSOR",
    "FREQ_SENSOR",
    "DYN_NOTCH",
    "RPM_FILTER",
]);

// Mutable RF views selected by adjustFieldDefsList (BF의 FLIGHT_LOG_FEATURES는 const 유지).
// NOTE: 참조는 `FLIGHT_LOG_FEATURES` 자체를 mutable로 쓰지만, 본 뷰어는 이미 const로
// export 중이라 presenter(grapher 외 1곳)가 직접 참조하므로 const를 건드리지 않고
// RF 전용 mutable 뷰를 별도로 둔다. 4단계 presenter에서 RF 로그일 때 이 뷰를 우선 사용.
export let FLIGHT_LOG_FEATURES_RF = [];

export const OFF_ON = makeReadOnly(["OFF", "ON"]);

export const FAST_PROTOCOL = makeReadOnly([
    "PWM",
    "ONESHOT125",
    "ONESHOT42",
    "MULTISHOT",
    "BRUSHED",
    "DSHOT150",
    "DSHOT300",
    "DSHOT600",
    "DSHOT1200", //deprecated
    "PROSHOT1000",
]);

// Rotorflight fast protocols (ref: rfblackbox/js/flightlog_fielddefs.js:356-381).
// BF와 달리 DSHOT1200이 없고 DISABLED/CASTLE_LINK가 있다. index가 header enum 값이므로 순서 유지가 필수.
export const FAST_PROTOCOL_RF = makeReadOnly([
    "PWM",
    "ONESHOT125",
    "ONESHOT42",
    "MULTISHOT",
    "BRUSHED",
    "DSHOT150",
    "DSHOT300",
    "DSHOT600",
    "PROSHOT1000",
    "DISABLED",
]);

export const FAST_PROTOCOL_RF_4_5 = makeReadOnly([
    "PWM",
    "ONESHOT125",
    "ONESHOT42",
    "MULTISHOT",
    "BRUSHED",
    "DSHOT150",
    "DSHOT300",
    "DSHOT600",
    "PROSHOT1000",
    "CASTLE_LINK",
    "DISABLED",
]);

// Mutable RF views selected by adjustFieldDefsList. BF의 FAST_PROTOCOL const는 그대로 둔다.
export let FAST_PROTOCOL_RF_ACTIVE = [];

export const MOTOR_SYNC = makeReadOnly(["SYNCED", "UNSYNCED"]);

export const SERIALRX_PROVIDER = makeReadOnly([
    "SPEK1024",
    "SPEK2048",
    "SBUS",
    "SUMD",
    "SUMH",
    "XB-B",
    "XB-B-RJ01",
    "IBUS",
    "JETIEXBUS",
    "CRSF",
    "SRXL",
    "CUSTOM",
    "FPORT",
    "SRXL2",
    "GHST",
]);

export const ANTI_GRAVITY_MODE = makeReadOnly(["SMOOTH", "STEP"]);

export const RC_SMOOTHING_TYPE = makeReadOnly(["INTERPOLATION", "FILTER"]);

export const RC_SMOOTHING_MODE = makeReadOnly(["OFF", "ON"]);

export const RC_SMOOTHING_DEBUG_AXIS = makeReadOnly(["ROLL", "PITCH", "YAW", "THROTTLE"]);

export const FILTER_TYPE = makeReadOnly(["PT1", "BIQUAD", "PT2", "PT3"]);

// Debug mode names and debug field labels are no longer defined here. They now
// live in the single shared source of truth `src/js/utils/debugModes.js`
// (getDebugModes / getDebugFieldNames), consumed by both the configurator debug
// store and the blackbox viewer. The blackbox parser resolves the log's
// API version once (firmwareToApiVersion) and stores it on sysConfig.apiVersion.
// --- RF exception (3단계): Rotorflight enum은 BF debug.h와 무관하므로 아래
// `DEBUG_MODE_RF_*`를 fielddefs에 내장한다 (ref: rfblackbox/js/flightlog_fielddefs.js:526-769).
// BF 로그는 기존 공용 테이블 경로를 그대로 사용하고, RF 로그일 때만 4단계 presenter가
// `DEBUG_MODE_RF_ACTIVE`를 우선 참조한다. 동작 계약: BF 로그의 debug 라벨은 1비트도 변하지 않음.

export const DEBUG_MODE_RF_4_2 = makeReadOnly([
    "NONE",
    "CYCLETIME",
    "BATTERY",
    "GYRO",
    "ACCELEROMETER",
    "PIDLOOP",
    "GYRO_SCALED",
    "RC_INTERPOLATION",
    "ANGLERATE",
    "ESC_SENSOR",
    "SCHEDULER",
    "STACK",
    "ESC_SENSOR_RPM",
    "ESC_SENSOR_TMP",
    "ALTITUDE",
    "FFT",
    "FFT_TIME",
    "FFT_FREQ",
    "RX_FRSKY_SPI",
    "RX_SFHSS_SPI",
    "GYRO_RAW",
    "DUAL_GYRO_RAW",
    "DUAL_GYRO_DIFF",
    "MAX7456_SIGNAL",
    "MAX7456_SPICLOCK",
    "SBUS",
    "FPORT",
    "RANGEFINDER",
    "RANGEFINDER_QUALITY",
    "LIDAR_TF",
    "ADC_INTERNAL",
    "GOVERNOR",
    "SDIO",
    "CURRENT_SENSOR",
    "USB",
    "SMARTAUDIO",
    "RTH",
    "ITERM_RELAX",
    "ACRO_TRAINER",
    "RC_SMOOTHING",
    "RX_SIGNAL_LOSS",
    "RC_SMOOTHING_RATE",
    "UNUSED_42",
    "DYN_LPF",
    "RX_SPECTRUM_SPI",
    "DSHOT_RPM_TELEMETRY",
    "RPM_FILTER",
    "RPM_SOURCE",
    "AC_CORRECTION",
    "AC_ERROR",
    "DUAL_GYRO_SCALED",
    "DSHOT_RPM_ERRORS",
    "CRSF_LINK_STATISTICS_UPLINK",
    "CRSF_LINK_STATISTICS_PWR",
    "CRSF_LINK_STATISTICS_DOWN",
    "BARO",
    "GPS_RESCUE_THROTTLE_PID",
    "FREQ_SENSOR",
    "FF_LIMIT",
    "FF_INTERPOLATED",
    "BLACKBOX_OUTPUT",
    "GYRO_SAMPLE",
    "RX_TIMING",
    "YAW_PRECOMP",
    "USER1",
    "USER2",
    "USER3",
    "USER4",
]);

export const DEBUG_MODE_RF_4_3 = makeReadOnly([
    "NONE",
    "CYCLETIME",
    "BATTERY",
    "GYRO",
    "ACCELEROMETER",
    "PIDLOOP",
    "GYRO_SCALED",
    "RC_COMMAND",
    "ANGLERATE",
    "ESC_SENSOR",
    "SCHEDULER",
    "STACK",
    "ESC_SENSOR_DATA",
    "ESC_SENSOR_FRAME",
    "ALTITUDE",
    "DYN_NOTCH",
    "DYN_NOTCH_TIME",
    "DYN_NOTCH_FREQ",
    "RX_FRSKY_SPI",
    "RX_SFHSS_SPI",
    "GYRO_RAW",
    "DUAL_GYRO_RAW",
    "DUAL_GYRO_DIFF",
    "MAX7456_SIGNAL",
    "MAX7456_SPICLOCK",
    "SBUS",
    "FPORT",
    "RANGEFINDER",
    "RANGEFINDER_QUALITY",
    "LIDAR_TF",
    "ADC_INTERNAL",
    "GOVERNOR",
    "SDIO",
    "CURRENT_SENSOR",
    "USB",
    "SMARTAUDIO",
    "RTH",
    "ITERM_RELAX",
    "ACRO_TRAINER",
    "SETPOINT",
    "RX_SIGNAL_LOSS",
    "RC_RAW",
    "RC_DATA",
    "DYN_LPF",
    "RX_SPECTRUM_SPI",
    "DSHOT_RPM_TELEMETRY",
    "RPM_FILTER",
    "RPM_SOURCE",
    "TTA",
    "AIRBORNE",
    "DUAL_GYRO_SCALED",
    "DSHOT_RPM_ERRORS",
    "CRSF_LINK_STATISTICS_UPLINK",
    "CRSF_LINK_STATISTICS_PWR",
    "CRSF_LINK_STATISTICS_DOWN",
    "BARO",
    "GPS_RESCUE_THROTTLE_PID",
    "FREQ_SENSOR",
    "FEEDFORWARDD_LIMIT",
    "FEEDFORWARD",
    "BLACKBOX_OUTPUT",
    "GYRO_SAMPLE",
    "RX_TIMING",
    "D_LPF",
    "VTX_TRAMP",
    "GHST",
    "SCHEDULER_DETERMINISM",
    "TIMING_ACCURACY",
    "RX_EXPRESSLRS_SPI",
    "RX_EXPRESSLRS_PHASELOCK",
    "RX_STATE_TIME",
    "PITCH_PRECOMP",
    "YAW_PRECOMP",
    "RESCUE",
    "RESCUE_ALTHOLD",
    "CROSS_COUPLING",
    "ERROR_DECAY",
    "HS_OFFSET",
    "HS_BLEED",
    "USER1",
    "USER2",
    "USER3",
    "USER4",
]);

export const DEBUG_MODE_RF_4_6 = makeReadOnly([
    "NONE",
    "CYCLETIME",
    "BATTERY",
    "GYRO",
    "ACCELEROMETER",
    "PIDLOOP",
    "GYRO_SCALED",
    "RC_COMMAND",
    "ANGLERATE",
    "ESC_SENSOR",
    "SCHEDULER",
    "STACK",
    "ESC_SENSOR_DATA",
    "ESC_SENSOR_FRAME",
    "ALTITUDE",
    "DYN_NOTCH",
    "DYN_NOTCH_TIME",
    "DYN_NOTCH_FREQ",
    "RX_FRSKY_SPI",
    "RX_SFHSS_SPI",
    "GYRO_RAW",
    "DUAL_GYRO_RAW",
    "DUAL_GYRO_DIFF",
    "MAX7456_SIGNAL",
    "MAX7456_SPICLOCK",
    "SBUS",
    "FPORT",
    "RANGEFINDER",
    "RANGEFINDER_QUALITY",
    "LIDAR_TF",
    "ADC_INTERNAL",
    "GOVERNOR",
    "SDIO",
    "CURRENT_SENSOR",
    "USB",
    "SMARTAUDIO",
    "RTH",
    "ITERM_RELAX",
    "ACRO_TRAINER",
    "SETPOINT",
    "RX_SIGNAL_LOSS",
    "RC_RAW",
    "RC_DATA",
    "DYN_LPF",
    "RX_SPECTRUM_SPI",
    "DSHOT_RPM_TELEMETRY",
    "RPM_FILTER",
    "RPM_SOURCE",
    "TTA",
    "AIRBORNE",
    "DUAL_GYRO_SCALED",
    "DSHOT_RPM_ERRORS",
    "CRSF_LINK_STATISTICS_UPLINK",
    "CRSF_LINK_STATISTICS_PWR",
    "CRSF_LINK_STATISTICS_DOWN",
    "BARO",
    "GPS_RESCUE_THROTTLE_PID",
    "FREQ_SENSOR",
    "FEEDFORWARDD_LIMIT",
    "FEEDFORWARD",
    "BLACKBOX_OUTPUT",
    "GYRO_SAMPLE",
    "RX_TIMING",
    "D_LPF",
    "VTX_TRAMP",
    "GHST",
    "SCHEDULER_DETERMINISM",
    "TIMING_ACCURACY",
    "RX_EXPRESSLRS_SPI",
    "RX_EXPRESSLRS_PHASELOCK",
    "RX_STATE_TIME",
    "PITCH_PRECOMP",
    "YAW_PRECOMP",
    "RESCUE",
    "RESCUE_ALTHOLD",
    "CROSS_COUPLING",
    "ERROR_DECAY",
    "HS_OFFSET",
    "HS_BLEED",
    "GOV_MOTOR",
    "POLAR_RATE",
    "USER1",
    "USER2",
    "USER3",
    "USER4",
]);

// Mutable RF debug view selected by adjustFieldDefsList (4단계 presenter가 RF 로그에 사용).
// ESM live binding 함정: `export let`을 재할당하면 기존 import 바인딩도 갱신되지만,
// Vite/Rollup 번들 환경과 구형 번들러 호환을 위해 presenter는 이 배열을 직접 인덱싱하지 않고
// getRfDebugModeName() accessor로만 읽는다 (live binding 무관, 항상 최신 참조).
export let DEBUG_MODE_RF_ACTIVE = [];
export function getRfDebugModeName(debugModeIndex) {
    return DEBUG_MODE_RF_ACTIVE[debugModeIndex];
}
export function getRfDebugModeAll() {
    return DEBUG_MODE_RF_ACTIVE;
}

export const SUPER_EXPO_YAW = makeReadOnly(["OFF", "ON", "ALWAYS"]);

export const GYRO_LPF = makeReadOnly(["OFF", "188HZ", "98HZ", "42HZ", "20HZ", "10HZ", "5HZ", "EXPERIMENTAL"]);

export const GYRO_HARDWARE_LPF = makeReadOnly(["NORMAL", "EXPERIMENTAL", "1KHZ_SAMPLING"]);

export const GYRO_32KHZ_HARDWARE_LPF = makeReadOnly(["NORMAL", "EXPERIMENTAL"]);

export let ACC_HARDWARE = [];

const ACC_HARDWARE_COMPLETE = makeReadOnly([
    "AUTO",
    "NONE",
    "ADXL345",
    "MPU6050",
    "MMA8452",
    "BMA280",
    "LSM303DLHC",
    "MPU6000",
    "MPU6500",
    "MPU9250",
    "ICM20601",
    "ICM20602",
    "ICM20608G",
    "ICM20649",
    "ICM20689",
    "ICM42605",
    "ICM42688P",
    "BMI160",
    "BMI270",
    "LSM6DSO",
    "LSM6DSV16X",
    "VIRTUAL",
]);

export const BARO_HARDWARE = makeReadOnly([
    "AUTO",
    "NONE",
    "BMP085",
    "MS5611",
    "BMP280",
    "LPS",
    "QMP6988",
    "BMP388",
    "DPS310",
    "2SMPB_02B",
]);

export let MAG_HARDWARE = [];

const MAG_HARDWARE_COMPLETE = makeReadOnly([
    "AUTO",
    "NONE",
    "HMC5883",
    "AK8975",
    "AK8963",
    "QMC5883",
    "LIS3MDL",
    "MAG_MPU925X_AK8963",
]);

export const FLIGHT_LOG_FLIGHT_STATE_NAME = makeReadOnly([
    "GPS_FIX_HOME",
    "GPS_FIX",
    "CALIBRATE_MAG",
    "SMALL_ANGLE",
    "FIXED_WING",
]);

export const FLIGHT_LOG_FAILSAFE_PHASE_NAME = makeReadOnly(["IDLE", "RX_LOSS_DETECTED", "LANDING", "LANDED"]);

export const FFT_CALC_STEPS = makeReadOnly([
    "ARM_CFFT_F32",
    "BITREVERSAL",
    "STAGE_RFFT_F32",
    "ARM_CMPLX_MAG_F32",
    "CALC_FREQUENCIES",
    "UPDATE_FILTERS",
    "HANNING",
]);

export const ITERM_RELAX = makeReadOnly(["OFF", "RP", "RPY", "RP_INC", "RPY_INC"]);

export const ITERM_RELAX_TYPE = makeReadOnly(["GYRO", "SETPOINT"]);

export const FLIGHT_LOG_DISARM_REASON = makeReadOnly([
    "ARMING_DISABLED",
    "FAILSAFE",
    "THROTTLE_TIMEOUT",
    "STICKS",
    "SWITCH",
    "CRASH_PROTECTION",
    "RUNAWAY_TAKEOFF",
    "GPS_RESCUE",
    "SERIAL_IO",
]);

// Rotorflight governor/rescue/airborne states (ref: rfblackbox/js/flightlog_fielddefs.js:886-925).
// 5단계 parser 이벤트 디코딩 + 6단계 grapher 라벨에서 사용. index가 로그 바이트 값이므로 순서 고정.
export const FLIGHT_LOG_GOVSTATES_RF = makeReadOnly([
    "THROTTLE_OFF",
    "THROTTLE_IDLE",
    "SPOOLING_UP",
    "RECOVERY",
    "ACTIVE",
    "LOST_THROTTLE",
    "LOST_HEADSPEED",
    "AUTOROTATION",
    "BAILOUT",
]);

export const FLIGHT_LOG_GOVSTATES_RF_4_6 = makeReadOnly([
    "THROTTLE_OFF",
    "THROTTLE_IDLE",
    "SPOOLUP",
    "RECOVERY",
    "ACTIVE",
    "THROTTLE_HOLD",
    "FALLBACK",
    "AUTOROTATION",
    "BAILOUT",
    "BYPASS",
]);

export const FLIGHT_LOG_RESCUE_STATES = makeReadOnly(["OFF", "PULLUP", "FLIP", "CLIMB", "HOVER", "EXIT"]);

export const FLIGHT_LOG_AIRBORNE_STATES = makeReadOnly(["LANDING", "TAKEOFF"]);

// Mutable RF gov view selected by adjustFieldDefsList.
export let FLIGHT_LOG_GOVSTATES_RF_ACTIVE = [];

export const RATES_TYPE = makeReadOnly(["NONE", "BETAFLIGHT", "RACEFLIGHT", "KISS", "ACTUAL", "QUICK", "ROTORFLIGHT"]);

export const GYRO_TO_USE = makeReadOnly(["FIRST", "SECOND", "BOTH"]);

export const FF_AVERAGING = makeReadOnly(["OFF", "2_POINT", "3_POINT", "4_POINT"]);

export const SIMPLIFIED_PIDS_MODE = makeReadOnly(["OFF", "ON - RP", "ON - RPY"]);

export const THROTTLE_LIMIT_TYPE = makeReadOnly(["OFF", "SCALE", "CLIP"]);

export function adjustFieldDefsList(firmwareType, firmwareVersion) {
    // Rotorflight branch (ref: rfblackbox/js/flightlog_fielddefs.js:962-1014).
    // BF 분기와 완전히 분리: RF 로그일 때만 RF 전용 mutable 뷰 5종을 채운다.
    // BF/INAV/legacy 로그는 아래 기존 분기를 그대로 타므로 동작 불변.
    // NOTE: 참조는 FLIGHT_LOG_FEATURES/FAST_PROTOCOL/DEBUG_MODE 자체를 갈아끼우지만,
    // 본 뷰어는 BF const를 유지해야 하므로 *_RF_ACTIVE / *_RF 뷰에 대입한다 (4단계에서 사용).
    // NOTE2: 참조의 RF 하한은 4.2 — 그 미만 RF 버전은 뷰가 빈 배열([])로 남아
    // 4단계 presenter가 빈 테이블을 감지하고 BF 폴백 + 콘솔 경고를 내도록 계약한다.
    if (firmwareType === FIRMWARE_TYPE_ROTORFLIGHT) {
        // Flight mode names
        if (semver.gte(firmwareVersion, "4.6.0")) {
            FLIGHT_LOG_FLIGHT_MODE_NAME = FLIGHT_LOG_FLIGHT_MODE_NAME_RF_4_6.slice(0);
        } else if (semver.gte(firmwareVersion, "4.3.0")) {
            FLIGHT_LOG_FLIGHT_MODE_NAME = FLIGHT_LOG_FLIGHT_MODE_NAME_RF_4_3.slice(0);
        } else if (semver.gte(firmwareVersion, "4.2.0")) {
            FLIGHT_LOG_FLIGHT_MODE_NAME = FLIGHT_LOG_FLIGHT_MODE_NAME_RF_4_2.slice(0);
        } else {
            FLIGHT_LOG_FLIGHT_MODE_NAME = [];
        }
        FLIGHT_LOG_FLIGHT_MODE_NAME = makeReadOnly(FLIGHT_LOG_FLIGHT_MODE_NAME);

        // Features → RF 전용 뷰 (BF const untouched)
        if (semver.gte(firmwareVersion, "4.3.0")) {
            FLIGHT_LOG_FEATURES_RF = FLIGHT_LOG_FEATURES_RF_4_3.slice(0);
        } else if (semver.gte(firmwareVersion, "4.2.0")) {
            FLIGHT_LOG_FEATURES_RF = FLIGHT_LOG_FEATURES_RF_4_2.slice(0);
        } else {
            FLIGHT_LOG_FEATURES_RF = [];
        }
        FLIGHT_LOG_FEATURES_RF = makeReadOnly(FLIGHT_LOG_FEATURES_RF);

        // Debug names → RF 전용 뷰 (공용 BF 테이블 untouched)
        if (semver.gte(firmwareVersion, "4.6.0")) {
            DEBUG_MODE_RF_ACTIVE = DEBUG_MODE_RF_4_6.slice(0);
        } else if (semver.gte(firmwareVersion, "4.3.0")) {
            DEBUG_MODE_RF_ACTIVE = DEBUG_MODE_RF_4_3.slice(0);
        } else if (semver.gte(firmwareVersion, "4.2.0")) {
            DEBUG_MODE_RF_ACTIVE = DEBUG_MODE_RF_4_2.slice(0);
        } else {
            DEBUG_MODE_RF_ACTIVE = [];
        }
        DEBUG_MODE_RF_ACTIVE = makeReadOnly(DEBUG_MODE_RF_ACTIVE);

        // Gov states → RF 전용 뷰
        if (semver.gte(firmwareVersion, "4.6.0")) {
            FLIGHT_LOG_GOVSTATES_RF_ACTIVE = FLIGHT_LOG_GOVSTATES_RF_4_6.slice(0);
        } else {
            FLIGHT_LOG_GOVSTATES_RF_ACTIVE = FLIGHT_LOG_GOVSTATES_RF.slice(0);
        }

        // Fast protocols → RF 전용 뷰
        if (semver.gte(firmwareVersion, "4.5.0")) {
            FAST_PROTOCOL_RF_ACTIVE = FAST_PROTOCOL_RF_4_5.slice(0);
        } else {
            FAST_PROTOCOL_RF_ACTIVE = FAST_PROTOCOL_RF.slice(0);
        }
        FAST_PROTOCOL_RF_ACTIVE = makeReadOnly(FAST_PROTOCOL_RF_ACTIVE);

        return;
    }

    if (firmwareType === FIRMWARE_TYPE_BETAFLIGHT && semver.gte(firmwareVersion, "3.3.0")) {
        // Hardware names
        ACC_HARDWARE = ACC_HARDWARE_COMPLETE.slice(0);
        MAG_HARDWARE = MAG_HARDWARE_COMPLETE.slice(0);

        if (semver.gte(firmwareVersion, "4.5.0")) {
            MAG_HARDWARE.splice(MAG_HARDWARE.indexOf("LIS3MDL"), 0, "LIS2MDL");
            MAG_HARDWARE.push("IST8310");
        }
        if (semver.gte(firmwareVersion, "2025.12.0")) {
            ACC_HARDWARE.splice(ACC_HARDWARE.indexOf("ADXL345"), 1);
            ACC_HARDWARE.splice(ACC_HARDWARE.indexOf("MMA8452"), 1);
            ACC_HARDWARE.splice(ACC_HARDWARE.indexOf("BMA280"), 1);
            ACC_HARDWARE.splice(ACC_HARDWARE.indexOf("LSM303DLHC"), 1);
            ACC_HARDWARE.splice(ACC_HARDWARE.indexOf("LSM6DSV16X") + 1, 0, "IIM42653");
        }

        ACC_HARDWARE = makeReadOnly(ACC_HARDWARE);
        MAG_HARDWARE = makeReadOnly(MAG_HARDWARE);

        // Flight mode names
        if (semver.gte(firmwareVersion, "2025.12.0")) {
            FLIGHT_LOG_FLIGHT_MODE_NAME = FLIGHT_LOG_FLIGHT_MODE_NAME_POST_4_5.slice(0);
        } else {
            FLIGHT_LOG_FLIGHT_MODE_NAME = FLIGHT_LOG_FLIGHT_MODE_NAME_POST_3_3.slice(0);
            if (semver.lt(firmwareVersion, "3.4.0")) {
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("GPSRESCUE"), 1);
            }
            if (semver.gte(firmwareVersion, "3.5.0")) {
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("RANGEFINDER"), 1);
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("CAMTRIG"), 1);
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("LEDMAX"), 1);
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("LLIGHTS"), 1);
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("GOV"), 1);
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("GTUNE"), 1);
            }
            if (semver.gte(firmwareVersion, "4.0.0")) {
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("BARO"), 1);
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("GPSHOME"), 1);
                FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("GPSHOLD"), 1);
            }
        }
        if (semver.gte(firmwareVersion, "2026.6.0")) {
            FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("GPSRESCUE") + 1, 0, "AUTOPILOT");
        }

        FLIGHT_LOG_FLIGHT_MODE_NAME = makeReadOnly(FLIGHT_LOG_FLIGHT_MODE_NAME);
    } else {
        ACC_HARDWARE = makeReadOnly(ACC_HARDWARE_COMPLETE.slice(0));
        MAG_HARDWARE = makeReadOnly(MAG_HARDWARE_COMPLETE.slice(0));

        FLIGHT_LOG_FLIGHT_MODE_NAME = FLIGHT_LOG_FLIGHT_MODE_NAME_PRE_3_3.slice(0);

        if (firmwareType === FIRMWARE_TYPE_BETAFLIGHT && semver.lte(firmwareVersion, "3.1.6")) {
            FLIGHT_LOG_FLIGHT_MODE_NAME.splice(FLIGHT_LOG_FLIGHT_MODE_NAME.indexOf("ANTIGRAVITY"), 1);
        }

        FLIGHT_LOG_FLIGHT_MODE_NAME = makeReadOnly(FLIGHT_LOG_FLIGHT_MODE_NAME);
    }
}
