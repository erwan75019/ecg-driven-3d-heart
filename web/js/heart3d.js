const DEFAULT_HEART_MODEL_ID = "beating-heart";

const HEART_PHASE_ANCHORS = {
    qrsEnd: 0.24,
    tStart: 0.42,
    tEnd: 0.66,
    pStart: 0.82,
    pEnd: 0.92
};

const HEART_MODELS = {
    "beating-heart": {
        label: "Modèle 3D morphologique (Vue interne / Coupe)",
        url: "assets/models/beating-heart-3d.glb",
        author: "soufiane oujihi",
        authorUrl: "https://sketchfab.com/soufianeoujihi",
        license: "Creative Commons Attribution 4.0 (CC BY 4.0)",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        source: "https://sketchfab.com/3d-models/beating-heart-3d-85d48e7526dd4e73aaf2f22f22f169db",
        file: "web/assets/models/beating-heart-3d.glb"
    },
    "alternate-beating-heart": {
        label: "Modèle 3D externe (Rendu surfacique épuré)",
        url: "assets/models/animated-beating-heart.glb",
        author: "nitwit.friends",
        authorUrl: "https://sketchfab.com/nitwit.friends",
        license: "Creative Commons Attribution 4.0 (CC BY 4.0)",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        source: "https://sketchfab.com/3d-models/animated-beating-heart-335cd677c2014ca19e89efd65c7ddc55",
        file: "web/assets/models/animated-beating-heart.glb"
    },
    "anatomical-heart": {
        label: "Modèle 3D anatomique animé (vue générale)",
        url: "assets/models/anatomical-heart.glb",
        author: "shooogp",
        authorUrl: "https://sketchfab.com/shooogp",
        license: "Creative Commons Attribution 4.0 (CC BY 4.0)",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        source: "https://sketchfab.com/3d-models/heart-0bf594670b6a45db802b57d531e490a6",
        file: "web/assets/models/anatomical-heart.glb"
    },
    "mitral-stenosis": {
        label: "Modèle 3D pathologique (sténose mitrale)",
        url: "assets/models/mitral-stenosis-heart.glb",
        author: "Edwin3dArtist",
        authorUrl: "https://sketchfab.com/edwinaldanadesign",
        license: "Creative Commons Attribution 4.0 (CC BY 4.0)",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        source: "https://sketchfab.com/3d-models/heart-mitral-stenosis-76b535535e054dc4a1b9ef64794428f2",
        file: "web/assets/models/mitral-stenosis-heart.glb"
    },
    "closed-heart": {
        label: "Modèle 3D anatomique fermé (vue externe)",
        url: "assets/models/closed-heart.glb",
        author: "Ali.Zorays",
        authorUrl: "https://sketchfab.com/Ali.Zorays",
        license: "Creative Commons Attribution 4.0 (CC BY 4.0)",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        source: "https://sketchfab.com/3d-models/closed-heart-b995082afacf4498bc22048061b04390",
        file: "web/assets/models/closed-heart.glb"
    },
    "open-heart": {
        label: "Modèle 3D anatomique ouvert (vue interne)",
        url: "assets/models/open-heart.glb",
        author: "Ali.Zorays",
        authorUrl: "https://sketchfab.com/Ali.Zorays",
        license: "Creative Commons Attribution 4.0 (CC BY 4.0)",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        source: "https://sketchfab.com/3d-models/open-heart-2819aadc83c54011bfb9cfd972fe1c87",
        file: "web/assets/models/open-heart.glb"
    },
    "human-heart": {
        label: "Modèle 3D anatomique humain animé (texturé)",
        url: "assets/models/human-heart-animated.glb",
        author: "Ricardo Joel Arana",
        authorUrl: "https://sketchfab.com/Ricardo47291",
        license: "Creative Commons Attribution 4.0 (CC BY 4.0)",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        source: "https://sketchfab.com/3d-models/human-heart-d0c176d08c884d5d8a4657c200a0c9bf",
        file: "web/assets/models/human-heart-animated.glb"
    },
    "realistic-heart": {
        label: "Modèle 3D cardiaque réaliste animé",
        url: "assets/models/realistic-heart-animated.glb",
        author: "Pixio x AI Tutor",
        authorUrl: "https://sketchfab.com/tsiorg",
        license: "Creative Commons Attribution 4.0 (CC BY 4.0)",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        source: "https://sketchfab.com/3d-models/realistic-heart-animated-913988af9ae74d40aacd95927dc0936f",
        file: "web/assets/models/realistic-heart-animated.glb"
    }
};

const TARGET_MODEL_SIZE = 2;

const TARGET_FRAME_OCCUPANCY = 0.76;

const HEART_SYNC_EVENT = "ecg-heart-sync";

const DEFAULT_MODEL_ROTATION = {

    x: -0.08,

    y: -0.28,

    z: 0.03

};



const viewer = {

    animationAction: null,

    animationClip: null,

    animationClips: [],

    modelLoadRequestId: 0,

    modelScene: null,

    selectedModelId: null,

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

function updateModelAttribution(model) {
    const nameElement = document.getElementById("heart-model-info-name");
    const authorElement = document.getElementById("heart-model-info-author");
    const licenseElement = document.getElementById("heart-model-info-license");
    const fileElement = document.getElementById("heart-model-info-file");
    const sourceElement = document.getElementById("heart-model-info-source");

    if (
        !nameElement
        || !authorElement
        || !licenseElement
        || !fileElement
        || !sourceElement
    ) {
        return;
    }

    nameElement.textContent = model.label;
    authorElement.textContent = model.author;
    authorElement.href = model.authorUrl;
    licenseElement.textContent = model.license;
    licenseElement.href = model.licenseUrl;
    fileElement.textContent = model.file;
    sourceElement.href = model.source;
}



function fitCameraToModel() {

    if (!viewer.camera || !viewer.controls || !viewer.modelRoot) {

        return;

    }



    const THREE = viewer.THREE;

    const box = new THREE.Box3().setFromObject(viewer.modelRoot, true);



    if (box.isEmpty()) {

        return;

    }



    const size = box.getSize(new THREE.Vector3());

    const center = box.getCenter(new THREE.Vector3());

    const modelSize = Math.max(size.x, size.y, size.z);

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

    const modelOffset = new THREE.Group();
    modelOffset.add(model);
    modelOffset.updateMatrixWorld(true);

    const sourceBox = new THREE.Box3().setFromObject(modelOffset, true);


    if (sourceBox.isEmpty()) {

        throw new Error("The 3D heart model has no visible geometry.");

    }



    const sourceCenter = sourceBox.getCenter(new THREE.Vector3());

    const sourceSize = sourceBox.getSize(new THREE.Vector3());

    const maximumDimension = Math.max(sourceSize.x, sourceSize.y, sourceSize.z);



    if (!Number.isFinite(maximumDimension) || maximumDimension <= 0) {

        throw new Error("The 3D heart model has invalid dimensions.");

    }



    modelOffset.position.sub(sourceCenter);
    modelOffset.updateMatrixWorld(true);

    const modelRoot = new THREE.Group();

    modelRoot.name = "HeartModelRoot";

    modelRoot.scale.setScalar(TARGET_MODEL_SIZE / maximumDimension);

    modelRoot.rotation.set(

        DEFAULT_MODEL_ROTATION.x,

        DEFAULT_MODEL_ROTATION.y,

        DEFAULT_MODEL_ROTATION.z

    );

    modelRoot.add(modelOffset);

    modelRoot.updateMatrixWorld(true);



    return modelRoot;

}

function disposeModelResources(model) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();

    model.traverse((object) => {
        if (object.geometry && !geometries.has(object.geometry)) {
            geometries.add(object.geometry);
            object.geometry.dispose();
        }

        const objectMaterials = Array.isArray(object.material)
            ? object.material
            : [object.material];

        for (const material of objectMaterials) {
            if (!material || materials.has(material)) {
                continue;
            }

            materials.add(material);
            for (const value of Object.values(material)) {
                if (value && value.isTexture && !textures.has(value)) {
                    textures.add(value);
                    value.dispose();
                }
            }
            material.dispose();
        }
    });
}

function removeCurrentModel() {
    if (viewer.mixer && viewer.modelScene) {
        viewer.mixer.stopAllAction();
        viewer.mixer.uncacheRoot(viewer.modelScene);
    }

    if (viewer.modelRoot) {
        viewer.scene.remove(viewer.modelRoot);
        disposeModelResources(viewer.modelRoot);
    }

    viewer.animationAction = null;
    viewer.animationClip = null;
    viewer.animationClips = [];
    viewer.meshNames = [];
    viewer.mixer = null;
    viewer.modelRoot = null;
    viewer.modelScene = null;
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

function getFirstIntervalAfter(intervals, afterTime, beforeTime) {
    if (!Array.isArray(intervals)) {
        return null;
    }

    return intervals
        .filter((interval) => (
            Array.isArray(interval)
            && interval.length === 2
            && interval.every(Number.isFinite)
            && interval[1] >= interval[0]
            && interval[0] >= afterTime
            && interval[1] <= beforeTime
        ))
        .sort((first, second) => first[0] - second[0])[0] || null;
}


function getEventAlignedCycleProgress(time, state, cycle, phaseAnchors) {
    const qrsInterval = Array.isArray(state.qrsIntervals)
        ? state.qrsIntervals.find((interval) => (
            Array.isArray(interval)
            && interval.length === 2
            && interval.every(Number.isFinite)
            && Math.abs(interval[0] - cycle.start) < 1e-6
            && interval[1] > interval[0]
            && interval[1] < cycle.end
        ))
        : null;

    if (!qrsInterval) {
        return null;
    }

    const anchors = [{time: cycle.start, progress: 0}];
    const addAnchor = (anchorTime, progress) => {
        const previousAnchor = anchors[anchors.length - 1];
        if (
            Number.isFinite(anchorTime)
            && anchorTime > previousAnchor.time
            && anchorTime < cycle.end
            && Number.isFinite(progress)
            && progress > previousAnchor.progress
            && progress < 1
        ) {
            anchors.push({time: anchorTime, progress});
        }
    };

    addAnchor(qrsInterval[1], phaseAnchors.qrsEnd);

    const tInterval = getFirstIntervalAfter(
        state.tIntervals,
        qrsInterval[1],
        cycle.end
    );
    if (tInterval) {
        addAnchor(tInterval[0], phaseAnchors.tStart);
        addAnchor(tInterval[1], phaseAnchors.tEnd);
    }

    const pInterval = getFirstIntervalAfter(
        state.pIntervals,
        tInterval ? tInterval[1] : qrsInterval[1],
        cycle.end
    );
    if (pInterval) {
        addAnchor(pInterval[0], phaseAnchors.pStart);
        addAnchor(pInterval[1], phaseAnchors.pEnd);
    }

    anchors.push({time: cycle.end, progress: 1});

    for (let index = 0; index < anchors.length - 1; index += 1) {
        const start = anchors[index];
        const end = anchors[index + 1];
        if (time <= end.time) {
            const segmentProgress = (time - start.time) / (end.time - start.time);
            return start.progress + segmentProgress * (end.progress - start.progress);
        }
    }

    return 1;
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

    const eventAlignedProgress = getEventAlignedCycleProgress(
        time,
        state,
        cycle,
        HEART_PHASE_ANCHORS
    );
    const cycleProgress = eventAlignedProgress ?? Math.min(
        Math.max((time - cycle.start) / (cycle.end - cycle.start), 0),
        1
    );

    return cycleProgress * clipDuration;
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


async function loadHeartModel(container, GLTFLoader, modelId) {
    const model = HEART_MODELS[modelId];
    if (!model) {
        throw new Error(`Unknown 3D heart model: ${modelId}`);
    }

    const requestId = viewer.modelLoadRequestId + 1;
    viewer.modelLoadRequestId = requestId;
    updateStatus(container, "loading", `Loading ${model.label}…`);

    try {
        const gltf = await new GLTFLoader().loadAsync(model.url);
        if (requestId !== viewer.modelLoadRequestId) {
            disposeModelResources(gltf.scene);
            return;
        }

        try {
            removeCurrentModel();
            viewer.animationClips = gltf.animations || [];
            prepareModel(gltf.scene);
            viewer.modelRoot = centerAndScaleModel(gltf.scene);
            viewer.modelScene = gltf.scene;
            viewer.scene.add(viewer.modelRoot);
            initializeHeartAnimation(gltf);
            fitCameraToModel();
            viewer.selectedModelId = modelId;
            applySynchronizedHeartPose();
            updateModelAttribution(model);
            updateStatus(container, "ready", "");
        } catch (error) {
            removeCurrentModel();
            disposeModelResources(gltf.scene);
            throw error;
        }
    } catch (error) {
        if (requestId !== viewer.modelLoadRequestId) {
            return;
        }

        console.error(`Unable to load the 3D heart model "${model.label}".`, error);
        const modelSelect = document.getElementById("heart-model-select");
        if (viewer.selectedModelId && modelSelect) {
            modelSelect.value = viewer.selectedModelId;
        }
        updateStatus(container, "error", `${model.label} could not be loaded.`);
    }
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

        const modelSelect = document.getElementById("heart-model-select");
        const infoButton = document.getElementById("heart-model-info-button");
        const infoDialog = document.getElementById("heart-model-info-dialog");
        const closeInfoButton = document.getElementById("close-heart-model-info");
        if (modelSelect) {
            modelSelect.value = DEFAULT_HEART_MODEL_ID;
        }
        const initialModelId = DEFAULT_HEART_MODEL_ID;

        loadHeartModel(container, GLTFLoader, initialModelId);
        if (modelSelect) {
            modelSelect.addEventListener("change", () => {
                loadHeartModel(container, GLTFLoader, modelSelect.value);
            });
        }
        if (infoButton && infoDialog) {
            infoButton.addEventListener("click", () => {
                infoDialog.showModal();
            });
            infoDialog.addEventListener("click", (event) => {
                if (event.target === infoDialog) {
                    infoDialog.close();
                }
            });
        }
        if (closeInfoButton && infoDialog) {
            closeInfoButton.addEventListener("click", () => {
                infoDialog.close();
            });
        }

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

        modelUrl: viewer.selectedModelId
            ? HEART_MODELS[viewer.selectedModelId].url
            : null,
        selectedModelId: viewer.selectedModelId,

        morphTargetWeights,

        panEnabled: viewer.controls?.enablePan ?? null,

        state: getHeartContainer()?.dataset.viewerState || "not-initialized",

        syncState: viewer.syncState

    };

}



initializeHeartViewer();
