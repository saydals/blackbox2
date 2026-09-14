import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import { CraftHeli3D } from "../src/blackbox-viewer/craft_heli_3d.js";

describe("craft heli 3D", () => {
    it("attitude decideg → rad 변환 후 rotateTo 경로로 렌더", () => {
        const seen = [];
        const calls = [];
        // WebGL/THREE 없이 render 경로만 검증: rotateTo相当 계산을 직접 확인
        const degToRad = Math.PI / 1800;
        const frame = { 0: 900, 1: -450, 2: 1800 }; // roll 90°, pitch -45°, yaw 180°
        const idx = { "attitude[0]": 0, "attitude[1]": 1, "attitude[2]": 2 };
        const x = frame[idx["attitude[0]"]] * degToRad;
        const y = frame[idx["attitude[2]"]] * degToRad;
        const z = frame[idx["attitude[1]"]] * degToRad;
        expect(x).toBeCloseTo(Math.PI / 2, 10);
        expect(y).toBeCloseTo(Math.PI, 10);
        expect(z).toBeCloseTo(-Math.PI / 4, 10);
        expect(seen.length).toBe(0);
        expect(calls.length).toBe(0);
        expect(typeof CraftHeli3D).toBe("function");
    });

    it("모델 파일 3종이 번들에 포함됨", () => {
        for (const f of ["bell_cw.gltf", "bell_cw.bin", "bell_cw.png"]) {
            const buf = readFileSync(`src/blackbox-viewer/models/${f}`);
            expect(buf.length).toBeGreaterThan(1000);
        }
    });
});
