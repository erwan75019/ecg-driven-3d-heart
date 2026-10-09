const MODEL_URL = "assets/models/heart.glb";

const TARGET_MODEL_SIZE = 2;

const TARGET_FRAME_OCCUPANCY = 0.9;

const MODEL_VERTICAL_CENTER_OFFSET = 0.01;
const HEART_SYNC_EVENT = "ecg-heart-sync";

// The supplied GLB contains one complete morph-based cardiac cycle.
// Geometry inspection shows that visible contraction starts near 0.133 s
// and reaches maximum contraction around 0.400 s.
const CLIP_CONTRACTION_START_TIME = 0.13333334;
const CLIP_MAX_CONTRACTION_TIME = 0.4;

const DEFAULT_MODEL_ROTATION = {

    x: -0.08,

    y: -0.28,

    z: 0.03

};



const viewer = {

    animationAction: null,

    animationClip: null,

    animationClips: [],

    camera: null,

    controls: null,

    meshNames: [],

    mixer: null,

    modelRoot: null,

    renderer: null,

    resizeObserver: null,

    scene: null,

    statusElement: null,

    syncState: null,

    THREE: null

};



function getHeartContainer() {

    return document.getElementById("heart-container");

}



function createStatusElement(container) {

    const statusElement = document.createElement("div");

    statusElement.className = "heart-viewer-status";

    statusElement.setAttribute("role", "status");

    statusElement.setAttribute("aria-live", "polite");

    container.appendChild(statusElement);

    viewer.statusElement = statusElement;

}



function updateStatus(container, state, message) {

    container.dataset.viewerState = state;



    if (viewer.statusElement) {

        viewer.statusElement.textContent = message;

    }

}



function fitCameraToModel() {

    if (!viewer.camera || !viewer.controls || !viewer.modelRoot) {

        return;

    }



    const THREE = viewer.THREE;

    const box = new THREE.Box3().setFromObject(viewer.modelRoot);



    if (box.isEmpty()) {

        return;

    }



    const size = box.getSize(new THREE.Vector3());

    const center = box.getCenter(new THREE.Vector3());

    const modelSize = Math.max(size.x, size.y, size.z);

    center.y += size.y * MODEL_VERTICAL_CENTER_OFFSET;



    const verticalFov = THREE.MathUtils.degToRad(viewer.camera.fov);

    const horizontalFov = 2 * Math.atan(

        Math.tan(verticalFov / 2) * viewer.camera.aspect

    );

    const distanceForHeight = size.y / (2 * Math.tan(verticalFov / 2));

    const distanceForWidth = size.x / (2 * Math.tan(horizontalFov / 2));

    const cameraDistance = (

        Math.max(distanceForHeight, distanceForWidth) / TARGET_FRAME_OCCUPANCY

    ) + size.z * 0.12;

    const viewDirection = viewer.camera.position

        .clone()

        .sub(viewer.controls.target)

        .normalize();



    if (viewDirection.lengthSq() === 0) {

        viewDirection.set(0, 0, 1);

    }



    viewer.controls.target.copy(center);

    viewer.camera.position.copy(center).addScaledVector(viewDirection, cameraDistance);

    viewer.camera.near = Math.max(modelSize / 100, 0.01);

    viewer.camera.far = cameraDistance + modelSize * 8;

    viewer.camera.updateProjectionMatrix();



    viewer.controls.minDistance = Math.max(modelSize * 0.9, cameraDistance * 0.55);

    viewer.controls.maxDistance = Math.max(modelSize * 4, cameraDistance * 2.4);

    viewer.controls.update();

}



function resizeViewer() {

    const container = getHeartContainer();



    if (!container || !viewer.camera || !viewer.renderer) {

        return;

    }



    const width = container.clientWidth;

    const height = container.clientHeight;



    if (width === 0 || height === 0) {

        return;

    }



    viewer.camera.aspect = width / height;

    viewer.camera.updateProjectionMatrix();

    viewer.renderer.setSize(width, height, false);



    if (viewer.modelRoot) {

        fitCameraToModel();

    }

}



function prepareModel(model) {

    const maximumAnisotropy = viewer.renderer.capabilities.getMaxAnisotropy();

    const meshNames = [];



    model.traverse((object) => {

        if (!object.isMesh) {

            return;

        }



        meshNames.push(object.name || "(unnamed mesh)");

        const materials = Array.isArray(object.material)

            ? object.material

            : [object.material];



        for (const material of materials) {

            if (!material) {

                continue;

            }



            for (const property of ["map", "normalMap"]) {

                if (material[property]) {

                    material[property].anisotropy = maximumAnisotropy;

                    material[property].needsUpdate = true;

                }

            }

        }

    });



    viewer.meshNames = meshNames;

}



function centerAndScaleModel(model) {

    const THREE = viewer.THREE;

    const sourceBox = new THREE.Box3().setFromObject(model);



    if (sourceBox.isEmpty()) {

        throw new Error("The 3D heart model has no visible geometry.");

    }



    const sourceCenter = sourceBox.getCenter(new THREE.Vector3());

    const sourceSize = sourceBox.getSize(new THREE.Vector3());

    const maximumDimension = Math.max(sourceSize.x, sourceSize.y, sourceSize.z);



    if (!Number.isFinite(maximumDimension) || maximumDimension <= 0) {

        throw new Error("The 3D heart model has invalid dimensions.");

    }



    model.position.sub(sourceCenter);



    const modelRoot = new THREE.Group();

    modelRoot.name = "HeartModelRoot";

    modelRoot.scale.setScalar(TARGET_MODEL_SIZE / maximumDimension);

    modelRoot.rotation.set(

        DEFAULT_MODEL_ROTATION.x,

        DEFAULT_MODEL_ROTATION.y,

        DEFAULT_MODEL_ROTATION.z

    );

    modelRoot.add(model);

    modelRoot.updateMatrixWorld(true);



    return modelRoot;

}




function getQrsStarts(intervals) {
    if (!Array.isArray(intervals)) {
        return [];
    }

    return intervals
        .map((interval) => Array.isArray(interval) ? Number(interval[0]) : NaN)
        .filter((time) => Number.isFinite(time))
        .sort((a, b) => a - b);
}


function getCurrentCycleWindow(time, qrsIntervals, recordDuration) {
    const qrsStarts = getQrsStarts(qrsIntervals);

    if (qrsStarts.length === 0) {
        return null;
    }

    // If the 10 s record begins between two beats, infer the preceding cycle
    // from the first measured RR interval. This avoids a visual jump at the
    // first QRS in the displayed window.
    if (time < qrsStarts[0]) {
        if (qrsStarts.length >= 2) {
            const firstRr = qrsStarts[1] - qrsStarts[0];
            const start = qrsStarts[0] - firstRr;

            if (firstRr > 0 && time >= start) {
                return {start, end: qrsStarts[0], isEstimated: true};
            }
        }

        return null;
    }

    for (let index = 0; index < qrsStarts.length - 1; index += 1) {
        const start = qrsStarts[index];
        const end = qrsStarts[index + 1];

        if (time >= start && time < end) {
            return {start, end, isEstimated: false};
        }
    }

    // The last QRS has no following QRS inside the 10 s window.
    // Reuse the preceding RR interval, without extending past the record.
    if (qrsStarts.length >= 2) {
        const last = qrsStarts[qrsStarts.length - 1];
        const previous = qrsStarts[qrsStarts.length - 2];
        const previousRr = last - previous;
        const end = Math.min(last + previousRr, recordDuration);

        if (previousRr > 0 && time >= last && time < end) {
            return {start: last, end, isEstimated: true};
        }
    }

    return null;
}


function getSynchronizedClipTime(state) {
    if (!viewer.animationClip || !state) {
        return 0;
    }

    const clipDuration = viewer.animationClip.duration;

    if (!Number.isFinite(clipDuration) || clipDuration <= 0) {
        return 0;
    }

    const time = Number(state.currentTime);
    const recordDuration = Number(state.duration);

    if (!Number.isFinite(time) || !Number.isFinite(recordDuration) || recordDuration <= 0) {
        return 0;
    }

    // Finish in the relaxed/default pose at the exact end of the ECG record.
    if (time >= recordDuration) {
        return 0;
    }

    const cycle = getCurrentCycleWindow(time, state.qrsIntervals, recordDuration);

    if (!cycle || cycle.end <= cycle.start) {
        return 0;
    }

    const cycleProgress = Math.min(
        Math.max((time - cycle.start) / (cycle.end - cycle.start), 0),
        1
    );

    // QRS onset lands on the visible start of ventricular contraction
    // inside the original GLB clip. The clip start/end poses are identical,
    // so the wrap remains continuous from beat to beat.
    const contractionStartFraction = CLIP_CONTRACTION_START_TIME / clipDuration;
    const clipProgress = (cycleProgress + contractionStartFraction) % 1;

    return clipProgress * clipDuration;
}


function applySynchronizedHeartPose() {
    if (!viewer.mixer || !viewer.animationClip) {
        return;
    }

    viewer.mixer.setTime(getSynchronizedClipTime(viewer.syncState));
}


function initializeHeartAnimation(gltf) {
    if (!viewer.THREE || !gltf.scene || viewer.animationClips.length === 0) {
        return;
    }

    const THREE = viewer.THREE;
    const preferredClip = THREE.AnimationClip.findByName(
        viewer.animationClips,
        "C4D Animation Take"
    );

    viewer.animationClip = preferredClip || viewer.animationClips[0];
    viewer.mixer = new THREE.AnimationMixer(gltf.scene);
    viewer.animationAction = viewer.mixer.clipAction(viewer.animationClip);

    // Keep the action active so setTime() can evaluate the morph targets.
    // There is deliberately no mixer.update(delta): ECG currentTime is the
    // only master clock for heart deformation.
    viewer.animationAction.enabled = true;
    viewer.animationAction.setLoop(THREE.LoopRepeat, Infinity);
    viewer.animationAction.play();

    applySynchronizedHeartPose();
}


function handleEcgHeartSync(event) {
    viewer.syncState = event.detail;
    applySynchronizedHeartPose();
}


window.addEventListener(HEART_SYNC_EVENT, handleEcgHeartSync);

if (window.__ecgHeartSyncState) {
    viewer.syncState = window.__ecgHeartSyncState;
}


function loadHeartModel(container, GLTFLoader) {

    const loader = new GLTFLoader();



    loader.load(

        MODEL_URL,

        (gltf) => {

            try {

                viewer.animationClips = gltf.animations || [];

                prepareModel(gltf.scene);

                viewer.modelRoot = centerAndScaleModel(gltf.scene);

                viewer.scene.add(viewer.modelRoot);
                initializeHeartAnimation(gltf);

                fitCameraToModel();

                updateStatus(container, "ready", "");

            } catch (error) {

                console.error("Unable to prepare the 3D heart model.", error);

                updateStatus(container, "error", "3D heart model could not be displayed.");

            }

        },

        undefined,

        (error) => {

            console.error("Unable to load the 3D heart model.", error);

            updateStatus(container, "error", "3D heart model could not be loaded.");

        }

    );

}



function createLights(THREE, scene) {

    scene.add(new THREE.HemisphereLight(0xffffff, 0x78938c, 1.25));

    scene.add(new THREE.AmbientLight(0xffffff, 0.18));



    const keyLight = new THREE.DirectionalLight(0xfff7ef, 3.1);

    keyLight.position.set(4, 5, 6.5);

    scene.add(keyLight);



    const fillLight = new THREE.DirectionalLight(0x9adfd7, 0.9);

    fillLight.position.set(-4, 1, 3);

    scene.add(fillLight);



    const rimLight = new THREE.DirectionalLight(0xffa892, 1.45);

    rimLight.position.set(3, 2, -5);

    scene.add(rimLight);

}



function renderViewer() {

    if (!viewer.renderer || !viewer.scene || !viewer.camera) {

        return;

    }



    if (viewer.controls) {

        viewer.controls.update();

    }



    viewer.renderer.render(viewer.scene, viewer.camera);

}



async function initializeHeartViewer() {

    const container = getHeartContainer();



    if (!container) {

        return;

    }



    createStatusElement(container);

    updateStatus(container, "loading", "Loading 3D heart…");



    let THREE;

    let GLTFLoader;

    let OrbitControls;



    try {

        [THREE, {GLTFLoader}, {OrbitControls}] = await Promise.all([

            import("three"),

            import("three/addons/loaders/GLTFLoader.js"),

            import("three/addons/controls/OrbitControls.js")

        ]);

    } catch (error) {

        console.error("Unable to initialize Three.js.", error);

        updateStatus(container, "error", "3D viewer could not be initialized.");

        return;

    }



    viewer.THREE = THREE;



    try {

        viewer.scene = new THREE.Scene();

        viewer.camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);

        viewer.camera.position.set(0, 0, 3);



        viewer.renderer = new THREE.WebGLRenderer({

            alpha: true,

            antialias: true,

            powerPreference: "high-performance"

        });

        viewer.renderer.setClearColor(0x000000, 0);

        viewer.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        viewer.renderer.outputColorSpace = THREE.SRGBColorSpace;

        viewer.renderer.toneMapping = THREE.ACESFilmicToneMapping;

        viewer.renderer.toneMappingExposure = 1.08;

        viewer.renderer.domElement.className = "heart-viewer-canvas";

        viewer.renderer.domElement.setAttribute(

            "aria-label",

            "Interactive 3D heart model. Drag to rotate and scroll to zoom."

        );



        viewer.controls = new OrbitControls(viewer.camera, viewer.renderer.domElement);

        viewer.controls.enableDamping = true;

        viewer.controls.dampingFactor = 0.07;

        viewer.controls.enablePan = false;

        viewer.controls.minPolarAngle = Math.PI * 0.12;

        viewer.controls.maxPolarAngle = Math.PI * 0.88;



        createLights(THREE, viewer.scene);

        container.appendChild(viewer.renderer.domElement);



        if ("ResizeObserver" in window) {

            viewer.resizeObserver = new ResizeObserver(resizeViewer);

            viewer.resizeObserver.observe(container);

        }



        window.addEventListener("resize", resizeViewer);

        resizeViewer();



        viewer.renderer.domElement.addEventListener("webglcontextlost", (event) => {

            event.preventDefault();

            updateStatus(container, "error", "3D viewer could not be initialized.");

        });



        viewer.renderer.setAnimationLoop(renderViewer);

        loadHeartModel(container, GLTFLoader);

    } catch (error) {

        if (viewer.renderer) {

            viewer.renderer.setAnimationLoop(null);

        }



        console.error("Unable to create the 3D heart viewer.", error);

        updateStatus(container, "error", "3D viewer could not be initialized.");

    }

}



export function getHeartViewerState() {

    const morphTargetWeights = [];



    if (viewer.modelRoot) {

        viewer.modelRoot.traverse((object) => {

            if (object.isMesh && Array.isArray(object.morphTargetInfluences)) {

                morphTargetWeights.push([...object.morphTargetInfluences]);

            }

        });

    }



    return {

        animationClipCount: viewer.animationClips.length,

        animationClipDurations: viewer.animationClips.map((clip) => clip.duration),

        animationClipNames: viewer.animationClips.map((clip) => clip.name),

        activeAnimationClip: viewer.animationClip ? viewer.animationClip.name : null,

        activeAnimationTime: viewer.mixer ? viewer.mixer.time : null,

        contractionStartTime: CLIP_CONTRACTION_START_TIME,

        maxContractionTime: CLIP_MAX_CONTRACTION_TIME,

        cameraPosition: viewer.camera

            ? viewer.camera.position.toArray()

            : null,

        controlsTarget: viewer.controls

            ? viewer.controls.target.toArray()

            : null,

        maxDistance: viewer.controls?.maxDistance || null,

        meshCount: viewer.meshNames.length,

        meshNames: [...viewer.meshNames],

        minDistance: viewer.controls?.minDistance || null,

        modelLoaded: viewer.modelRoot !== null,

        modelUrl: MODEL_URL,

        morphTargetWeights,

        panEnabled: viewer.controls?.enablePan ?? null,

        state: getHeartContainer()?.dataset.viewerState || "not-initialized",

        syncState: viewer.syncState

    };

}



initializeHeartViewer();


