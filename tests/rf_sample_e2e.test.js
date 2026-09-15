import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { FlightLogParser, firmwareToApiVersion } from "../src/blackbox-viewer/flightlog_parser.js";
import { FlightLog } from "../src/blackbox-viewer/flightlog.js";
import { FlightLogFieldPresenter } from "../src/blackbox-viewer/flightlog_fields_presenter.js";
import { GraphConfig } from "../src/blackbox-viewer/graph_config.js";
import {
    FIRMWARE_TYPE_ROTORFLIGHT,
    FIRMWARE_TYPE_BETAFLIGHT,
    DEBUG_MODE_RF_4_6,
    DEBUG_MODE_RF_ACTIVE,
    FLIGHT_LOG_FEATURES_RF,
    FLIGHT_LOG_GOVSTATES_RF_ACTIVE,
} from "../src/blackbox-viewer/flightlog_fielddefs.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.join(rootDir, "..", "sample.bbl");

function loadSampleLog() {
    const bytes = readFileSync(samplePath);
    const data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const log = new FlightLog(data);
    // FlightLog 생성자는 헤더를 파싱하지 않는다 — openLog(0)가 parseHeader +
    // buildFieldNames + estimate를 수행 (main.js selectLog 경로와 동일).
    if (!log.openLog(0)) {
        throw new Error("sample.bbl openLog(0) failed");
    }
    return log;
}

function loadBblLog(absPath) {
    const bytes = readFileSync(absPath);
    const data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const log = new FlightLog(data);
    if (!log.openLog(0)) {
        throw new Error(`${absPath} openLog(0) failed`);
    }
    return log;
}

describe("7단계 E2E: Rotorflight sample.bbl", () => {
    it("펌웨어 식별: type=5, version=4.6.0", () => {
        const log = loadSampleLog();
        const sys = log.getSysConfig();
        expect(sys.firmwareType).toBe(FIRMWARE_TYPE_ROTORFLIGHT);
        expect(sys.firmwareVersion).toBe("4.6.0");
    });

    it("헤더 파싱: fields_mask + motor_poles + gyro_scale + debug_mode", () => {
        const sys = loadSampleLog().getSysConfig();
        expect(sys.fields_mask).toBe(50426);
        expect(sys.motor_poles).toBe(1);
        expect(sys.debug_mode).toBe(14);
        // gyro_scale=0x3f800000 (1.0) → rad/us 변환 적용 (2단계 결정)
        expect(sys.gyroScale).toBeCloseTo((Math.PI / 180) * 0.000001, 12);
        expect(sys.acc_1G).toBe(2048);
    });

    it("RF 테이블 선택: DEBUG_MODE_RF_ACTIVE=85항, FEATURES_RF=31항", () => {
        loadSampleLog();
        expect(DEBUG_MODE_RF_ACTIVE.length).toBe(85);
        expect(DEBUG_MODE_RF_ACTIVE.indexOf("GOVERNOR")).toBeGreaterThanOrEqual(0);
        expect(FLIGHT_LOG_FEATURES_RF.length).toBe(31);
        expect(FLIGHT_LOG_FEATURES_RF.indexOf("GOVERNOR")).toBe(26);
        expect(FLIGHT_LOG_GOVSTATES_RF_ACTIVE.length).toBe(10);
    });

    it("isFieldDisabled: fields_mask=50426 매핑", () => {
        const log = loadSampleLog();
        const d = log.isFieldDisabled();
        // bits set: 1,3,4,5,6,7,10,14,15
        expect(d.SETPOINT).toBe(false);
        expect(d.PID).toBe(false);
        expect(d.GYROUNFILT).toBe(false);
        expect(d.GYRO).toBe(false);
        expect(d.ACC).toBe(false);
        expect(d.BATTERY).toBe(false);
        expect(d.MOTORS).toBe(false);
        expect(d.SERVO).toBe(false);
        // bits clear
        expect(d.RC_COMMANDS).toBe(true);
        expect(d.MAGNETOMETER).toBe(true);
        expect(d.RSSI).toBe(true);
        expect(d.GPS).toBe(true);
        expect(d.RPM).toBe(true);
    });

    it("프레임 디코드: setpoint/motor/servo 스케일", () => {
        const log = loadSampleLog();
        const names = log.getMainFieldNames();
        expect(names).toContain("setpoint[0]");
        expect(names).toContain("motor[0]");
        expect(names).toContain("servo[0]");
        expect(names).not.toContain("motor[4]");
        const frame = log.getSmoothedFrameAtTime(log.getMinTime());
        expect(frame).toBeTruthy();
        const i = (n) => log.getMainFieldIndexByName(n);
        const sp0 = FlightLogFieldPresenter.decodeFieldToFriendly(log, "setpoint[0]", frame[i("setpoint[0]")]);
        expect(sp0).toMatch(/°\/s$/);
        const m0 = FlightLogFieldPresenter.decodeFieldToFriendly(log, "motor[0]", frame[i("motor[0]")]);
        expect(m0).toMatch(/%$/);
        const s0 = FlightLogFieldPresenter.decodeFieldToFriendly(log, "servo[0]", frame[i("servo[0]")]);
        expect(s0).toMatch(/µs$/);
    });

    it("debug 라벨: debug_mode=14 → RF 테이블명", () => {
        const log = loadSampleLog();
        const sys = log.getSysConfig();
        const modeName = DEBUG_MODE_RF_4_6[sys.debug_mode];
        expect(modeName).toBe(DEBUG_MODE_RF_ACTIVE[sys.debug_mode]);
        const friendly = FlightLogFieldPresenter.fieldNameToFriendly(
            "debug[0]",
            sys.debug_mode,
            sys.apiVersion,
            sys.firmwareType,
            sys.firmwareVersion,
        );
        expect(friendly).not.toBe("debug[0]");
        expect(typeof friendly).toBe("string");
    });

    it("예시 그래프: RF 15종 중 enabled 기반 생성, BF 목록 아님", () => {
        const log = loadSampleLog();
        const graphs = GraphConfig.getExampleGraphConfigs(log);
        const labels = graphs.map((g) => g.label);
        expect(labels).toContain("Gyros");
        expect(labels).toContain("Setpoints");
        expect(labels).toContain("Motors");
        expect(labels).toContain("Servos");
        // BF 전용 그래프는 RF 목록에 없음
        expect(labels).not.toContain("Motors (Legacy)");
        expect(labels).not.toContain("GPS Cartesian coords");
        // RC_COMMANDS disabled → RC Command 그래프 없음
        expect(labels).not.toContain("RC Command");
    });

    it("RF 회귀: sample.bbl 식별 불변", () => {
        const log = loadBblLog(samplePath);
        expect(log.getSysConfig().firmwareType).toBe(FIRMWARE_TYPE_ROTORFLIGHT);
        expect(firmwareToApiVersion(FIRMWARE_TYPE_ROTORFLIGHT, "4.6.0")).not.toBe("0.0.0");
    });
});
