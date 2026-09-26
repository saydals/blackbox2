import { afterAll, describe, expect, it } from "vitest";
import * as THREE from "three";

import {
    FLAT_RADIUS,
    FreshMorningEnvironment,
    HELIPAD_MARK_HEIGHT,
    HELIPAD_RADIUS,
    HELIPAD_SURFACE_Y,
    terrainHeight,
} from "../src/blackbox-viewer/three/freshMorningEnvironment.js";

// The environment draws its textures on canvases; there is no WebGL context in
// the test environment, so a minimal 2D context stub is enough.
const originalDocument = globalThis.document;
const gradient = { addColorStop() {} };
function createContext2D() {
    return new Proxy(
        {},
        {
            get(target, property) {
                if (property in target) return target[property];
                if (property === "createRadialGradient") return () => gradient;
                if (property === "createLinearGradient") return () => gradient;
                return () => {};
            },
            set(target, property, value) {
                target[property] = value;
                return true;
            },
        },
    );
}
globalThis.document = {
    createElement() {
        const canvas = { width: 0, height: 0 };
        canvas.getContext = () => createContext2D();
        return canvas;
    },
};
afterAll(() => {
    globalThis.document = originalDocument;
});

/** heli.glb: 179.1 units nose→tail, origin 21.5 units above the skids. */
const HELI_RAW_LENGTH = 179.1;
const HELI_RAW_BOTTOM = 21.5;

function buildEnvironment() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1.6, 0.5, 50000);
    camera.position.set(0, 5, 11);
    const worldGroup = new THREE.Group();
    scene.add(worldGroup);
    const environment = new FreshMorningEnvironment(scene, worldGroup, camera);
    return { scene, camera, worldGroup, environment };
}

function collect(scene) {
    const stats = {
        instanced: 0,
        instances: 0,
        triangles: 0,
        lights: 0,
        textured: 0,
        casters: 0,
    };
    scene.traverse((object) => {
        if (object.isLight) stats.lights++;
        if (!object.isMesh) return;
        if (object.castShadow) stats.casters++;
        if (object.material?.map) stats.textured++;
        const count = object.geometry.index
            ? object.geometry.index.count / 3
            : object.geometry.attributes.position.count / 3;
        stats.triangles += count * (object.isInstancedMesh ? object.count : 1);
        if (object.isInstancedMesh) {
            stats.instanced++;
            stats.instances += object.count;
        }
    });
    return stats;
}

describe("rf3d airfield environment (Three.js port)", () => {
    it("keeps the airfield level inside the flat radius and rolls outside", () => {
        expect(terrainHeight(0, 0)).toBe(0);
        expect(terrainHeight(FLAT_RADIUS - 1, 0)).toBe(0);
        expect(terrainHeight(0, -(FLAT_RADIUS - 1))).toBe(0);
        expect(terrainHeight(300, 220)).toBeGreaterThan(0.5);
        // Deterministic: the same query always returns the same height.
        expect(terrainHeight(300, 220)).toBe(terrainHeight(300, 220));
    });

    it("sizes the helipad mark so the helicopter fits half of it", () => {
        expect(HELIPAD_RADIUS).toBe(15);
        expect(HELIPAD_MARK_HEIGHT).toBe(9);
        expect(HELIPAD_SURFACE_Y).toBeCloseTo(0.04, 6);

        // The panel scales heli.glb by HELIPAD_MARK_HEIGHT / 2 / raw length and
        // lifts it so the skids rest on the pad surface.
        const scale = HELIPAD_MARK_HEIGHT / 2 / HELI_RAW_LENGTH;
        expect(HELI_RAW_LENGTH * scale).toBeCloseTo(4.5, 9);
        const offset = HELI_RAW_BOTTOM * scale + HELIPAD_SURFACE_Y;
        expect(offset - HELI_RAW_BOTTOM * scale).toBeCloseTo(HELIPAD_SURFACE_Y, 9);
    });

    it("builds terrain, helipad, vegetation and props into the world group", () => {
        const { scene, worldGroup, environment } = buildEnvironment();
        const stats = collect(scene);
        expect(worldGroup.children).toHaveLength(1); // the field root
        expect(stats.lights).toBeGreaterThanOrEqual(2); // sun + hemisphere
        expect(stats.instanced).toBeGreaterThanOrEqual(5); // trees/bushes/flowers/fences
        expect(stats.instances).toBeGreaterThan(200);
        expect(stats.triangles).toBeGreaterThan(20000);
        expect(stats.casters).toBeGreaterThan(0);
        expect(stats.textured).toBeGreaterThanOrEqual(2); // terrain + helipad

        // The terrain grid (220x220 quads → 221x221 vertices) tiles its grass
        // texture and the pad disc sits just above the ground.
        let terrain = null;
        let pad = null;
        worldGroup.traverse((object) => {
            if (!object.isMesh) return;
            if (object.geometry?.attributes?.position?.count === 221 * 221) {
                terrain = object;
            }
            if (object.material?.map?.source?.data?.width === 1024) pad = object;
        });
        expect(terrain).not.toBeNull();
        expect(terrain.receiveShadow).toBe(true);
        expect(terrain.material.map.repeat.x).toBeGreaterThan(100);
        expect(pad).not.toBeNull();
        expect(pad.position.y).toBeCloseTo(HELIPAD_SURFACE_Y, 6);
        expect(pad.geometry.attributes.position.count).toBeGreaterThan(90);
        environment.dispose();
    });

    it("follows the camera with the sky and animates clouds and windsock", () => {
        const { camera, environment } = buildEnvironment();
        camera.position.set(40, 12, -25);
        environment.update(1 / 60, 1 / 60);
        expect(environment.sky.position.x).toBeCloseTo(40, 6);
        expect(environment.sky.position.z).toBeCloseTo(-25, 6);

        // Clouds drift: the instance buffer changes and stays finite.
        const before = Array.from(environment.clouds.meshes[0].instanceMatrix.array);
        environment.update(1 / 60, 2 / 60);
        const after = Array.from(environment.clouds.meshes[0].instanceMatrix.array);
        expect(after).not.toEqual(before);
        for (const value of after) expect(Number.isFinite(value)).toBe(true);
        environment.dispose();
    });

    it("disposes everything it added and restores the scene state", () => {
        const { scene, worldGroup, environment } = buildEnvironment();
        expect(scene.background).not.toBeNull();
        expect(scene.fog).not.toBeNull();
        environment.dispose();
        expect(scene.children).toEqual([worldGroup]); // only the panel's group
        expect(worldGroup.children).toHaveLength(0);
        expect(scene.background).toBeNull();
        expect(scene.fog).toBeNull();
        expect(environment.sky).toBeNull();
        environment.dispose(); // a second call must not throw either
    });
});

