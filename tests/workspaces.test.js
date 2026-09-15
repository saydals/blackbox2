import { describe, it, expect } from "vitest";
import {
    USER_SLOT_COUNT,
    PRESET_BASE,
    PRESET_COUNT,
    WORKSPACE_COUNT,
    isPresetId,
    isUserSlotId,
    createInitialWorkspaces,
    normalizeWorkspaces,
} from "../src/blackbox-viewer/workspaces.js";

describe("workspace slots: 0-9 user + read-only presets (원본 체계)", () => {
    it("슬롯 구성: 10개 사용자 슬롯 + 6개 프리셋 = 16개", () => {
        expect(USER_SLOT_COUNT).toBe(10);
        expect(PRESET_BASE).toBe(10);
        expect(PRESET_COUNT).toBe(6);
        expect(WORKSPACE_COUNT).toBe(16);
    });

    it("초기값: 0-9는 빈 슬롯(null), 10-15는 이름 있는 프리셋", () => {
        const ws = createInitialWorkspaces();
        expect(ws.length).toBe(16);
        for (let i = 0; i < 10; i++) {
            expect(ws[i]).toBeNull();
        }
        const titles = ws.slice(10).map((s) => s.title);
        expect(titles).toEqual([
            "Filter Tuning",
            "Governor Preset",
            "Yaw Preset",
            "Pitch Preset",
            "Roll Preset",
            "Power Preset",
        ]);
    });

    it("id 판별: 0-9 사용자, 10-15 프리셋", () => {
        for (let i = 0; i < 10; i++) {
            expect(isUserSlotId(i)).toBe(true);
            expect(isPresetId(i)).toBe(false);
        }
        for (let i = 10; i < 16; i++) {
            expect(isUserSlotId(i)).toBe(false);
            expect(isPresetId(i)).toBe(true);
        }
        expect(isUserSlotId(16)).toBe(false);
        expect(isPresetId(16)).toBe(false);
    });

    it("구형 6슬롯 프리셋 단독 저장값은 초기값으로 리셋 (사용자 데이터 없음)", () => {
        const fresh = createInitialWorkspaces();
        // 구형: ws_rf.json 통째 저장된 형태 시뮬레이션
        const legacy = fresh.slice(10).map((s) => structuredClone(s));
        const norm = normalizeWorkspaces(legacy);
        expect(norm.length).toBe(16);
        for (let i = 0; i < 10; i++) {
            expect(norm[i]).toBeNull();
        }
        expect(norm.slice(10).map((s) => s.title)).toEqual(fresh.slice(10).map((s) => s.title));
    });

    it("구형 10슬롯 사용자 데이터는 앞 10칸에 보존", () => {
        const legacy = new Array(10).fill(null);
        legacy[1] = { title: "My Setup", graphConfig: [] };
        legacy[3] = { title: "Test", graphConfig: [] };
        const norm = normalizeWorkspaces(legacy);
        expect(norm.length).toBe(16);
        expect(norm[1].title).toBe("My Setup");
        expect(norm[3].title).toBe("Test");
        expect(norm[0]).toBeNull();
        expect(norm[10].title).toBe("Filter Tuning");
        expect(norm[15].title).toBe("Power Preset");
    });
});
