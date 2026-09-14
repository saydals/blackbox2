import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// @ts-expect-error Vite ?url asset import for the heli GLTF model
import bellCwModelUrl from "./models/bell_cw.gltf?url";
import bellCwBinUrl from "./models/bell_cw.bin?url";
import bellCwPngUrl from "./models/bell_cw.png?url";

// Rewrite the GLTF's relative buffer/image URIs to the bundled asset URLs,
// so the loader finds them next to the hashed .gltf in dist/assets/.
async function loadBellCw(glTFLoader) {
    const gltfJson = await (await fetch(bellCwModelUrl)).json();
    if (gltfJson.buffers?.[0]) {
        gltfJson.buffers[0].uri = bellCwBinUrl;
    }
    if (gltfJson.images?.[0]) {
        gltfJson.images[0].uri = bellCwPngUrl;
    }
    const blob = new Blob([JSON.stringify(gltfJson)], { type: "model/gltf+json" });
    const objectUrl = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
        glTFLoader.load(
            objectUrl,
            (gltf) => {
                URL.revokeObjectURL(objectUrl);
                resolve(gltf);
            },
            undefined,
            (err) => {
                URL.revokeObjectURL(objectUrl);
                reject(err);
            },
        );
    });
}

/**
 * Rotorflight helicopter 3D craft model (ref: rfblackbox/js/craft_3d.js:1-68,
 * model: rfblackbox/resources/models/bell_cw.* — copied to ./models/).
 *
 * The multicoptor renderer (craft_3d.js) draws N arms + props from propColors,
 * which is wrong for a single-rotor + tail-rotor heli. This class loads the
 * Bell GLTF model instead and rotates it from the log's attitude[0..2]
 * (decidegrees → radians). API mirrors Craft3D (render/resize) so grapher.js
 * can swap it in for Rotorflight logs only.
 */
export function CraftHeli3D(_flightLog, canvas) {
    const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
    });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
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
    loadBellCw(loader).then(
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
        rotateTo(frame[rollIdx] * degToRad, frame[yawIdx] * degToRad, frame[pitchIdx] * degToRad);
    };

    this.resize = function (width, height) {
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            render();
        }
    };
}
