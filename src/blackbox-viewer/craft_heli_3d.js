import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// @ts-expect-error Vite ?url asset import for the heli GLB model
import heliModelUrl from "./models/heli.glb?url";

/**
 * GLB is self-contained (buffers + textures embedded), so unlike the old
 * gltf+bin+png triple there is no internal-URI rewriting —
 * Vite's hashed ?url is loaded directly.
 */
async function loadHeliModel(glTFLoader) {
    return new Promise((resolve, reject) => {
        glTFLoader.load(
            heliModelUrl,
            (gltf) => {
                resolve(gltf);
            },
            undefined,
            (err) => {
                reject(err);
            },
        );
    });
}

/**
 * Rotorflight helicopter 3D craft model (ref: rfblackbox/js/craft_3d.js:1-68,
 * model: ./models/heli.glb — GLB, self-contained).
 *
 * The multicoptor renderer (craft_3d.js) draws N arms + props from propColors,
 * which is wrong for a single-rotor + tail-rotor heli. This class loads the
 * heli GLB model instead and rotates it from the log's attitude[0..2]
 * (decidegrees → radians). API mirrors Craft3D (render/resize) so grapher.js
 * can swap it in for Rotorflight logs only.
 */
export function CraftHeli3D(_flightLog, canvas) {
    const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    // move the camera away from the model
    camera.position.z = 200;
    scene.add(camera);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.8);
    directionalLight.position.set(0, 600, 800);
    scene.add(directionalLight);

    // modelWrapper adds an extra axis of rotation to avoid gimbal lock with the euler angles
    const modelWrapper = new THREE.Object3D();
    scene.add(modelWrapper);

    let model = null;
    let loadError = null;
    const loader = new GLTFLoader();
    loadHeliModel(loader).then(
        (gltf) => {
            model = gltf.scene;
            modelWrapper.add(model);
            render();
        },
        (err) => {
            loadError = err;
            console.log(`Cannot load heli 3D model: ${err}`);
        },
    );

    function rotateTo(x, y, z) {
        if (!model) {
            return;
        }

        model.rotation.x = x;
        modelWrapper.rotation.y = y;
        model.rotation.z = z;
        render();
    }

    function render() {
        renderer.render(scene, camera);
    }

    /** Diagnose helper for tests/console: null | Error | "loading" | "ready". */
    this.getLoadState = function () {
        if (model) {
            return "ready";
        }
        if (loadError) {
            return loadError;
        }
        return "loading";
    };

    /**
     * Same (frame, fieldIndexes) signature as Craft3D.render so grapher.js
     * needs no per-type call code. RF attitude[] is decidegrees; the model
     * expects radians. Missing attitude (bit off) → keep last pose.
     */
    this.render = function (frame, frameFieldIndexes) {
        const rollIdx = frameFieldIndexes["attitude[0]"];
        const pitchIdx = frameFieldIndexes["attitude[1]"];
        const yawIdx = frameFieldIndexes["attitude[2]"];

        if (rollIdx === undefined || pitchIdx === undefined || yawIdx === undefined) {
            render();
            return;
        }

        const degToRad = Math.PI / 1800; // decideg → rad
        // ref grapher.js:76-88, 877-881 — 축 매핑 x=attitude[1](pitch), y=attitude[2](yaw),
        // z=attitude[0](roll)이고 세 축 모두 부호 반전(-) 후 rotateTo(x, y, z).
        // 이전 구현(rotateTo(roll, +yaw, pitch))은 yaw 방향이 원본과 반대였고
        // pitch/roll 축도 서로 뒤바뀌어 있었다.
        rotateTo(
            -frame[pitchIdx] * degToRad,
            -frame[yawIdx] * degToRad,
            -frame[rollIdx] * degToRad,
        );
    };

    this.resize = function (width, height) {
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            renderer.setViewport(0, 0, width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            render();
        }
    };
}
