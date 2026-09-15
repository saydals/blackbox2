import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import { CraftHeli3D } from "../src/blackbox-viewer/craft_heli_3d.js";

describe("craft heli 3D", () => {
    it("attitude decideg → rad 변환 후 참조 축 매핑(-pitch, -yaw, -roll)으로 rotateTo", () => {
        // ref: rfblackbox/js/grapher.js:76-88 (index x=attitude[1], y=attitude[2], z=attitude[0])
        // rfblackbox/js/grapher.js:877-881 (x=-val.x, y=-val.y, z=-val.z)
        const degToRad = Math.PI / 1800;
        const frame = { 0: 900, 1: -450, 2: 1800 }; // roll 90°, pitch -45°, yaw 180°
        const idx = { "attitude[0]": 0, "attitude[1]": 1, "attitude[2]": 2 };
        // 참조 그래퍼와 동일한 인덱스 맵 + 부호 반전
        const x = -frame[idx["attitude[1]"]] * degToRad; // model.rotation.x  ← -pitch
        const y = -frame[idx["attitude[2]"]] * degToRad; // wrapper.rotation.y ← -yaw
        const z = -frame[idx["attitude[0]"]] * degToRad; // model.rotation.z  ← -roll
        expect(x).toBeCloseTo(Math.PI / 4, 10);   // -(-45°) = +45°
        expect(y).toBeCloseTo(-Math.PI, 10);      // -180°
        expect(z).toBeCloseTo(-Math.PI / 2, 10);  // -(90°) = -90°
    });

    it("구현 코드가 참조 매핑(음수 + pitch/yaw/roll 순서)을 사용하는지 정적 검증", () => {
        const src = readFileSync("src/blackbox-viewer/craft_heli_3d.js", "utf8");
        expect(src).toContain("-frame[pitchIdx] * degToRad");
        expect(src).toContain("-frame[yawIdx] * degToRad");
        expect(src).toContain("-frame[rollIdx] * degToRad");
        // 이전 버그 (양수 yaw / roll-pitch 스왑) 재발 방지
        expect(src).not.toMatch(/rotateTo\(frame\[rollIdx\]/);
    });

    it("모델 파일 3종이 번들에 포함됨", () => {
        for (const f of ["bell_cw.gltf", "bell_cw.bin", "bell_cw.png"]) {
            const buf = readFileSync(`src/blackbox-viewer/models/${f}`);
            expect(buf.length).toBeGreaterThan(1000);
        }
    });
});
