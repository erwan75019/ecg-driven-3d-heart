import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

// ==================== PARTIE ECG ====================
const ecgCanvas = document.getElementById("ecg-canvas");
const ecgContext = ecgCanvas.getContext("2d");

function drawGrid(context, width, height) {
    const smallGridSize = 10;
    const largeGridSize = smallGridSize * 5;

    context.lineWidth = 1;

    for (let x = smallGridSize; x < width; x += smallGridSize) {
        const isLargeLine = x % largeGridSize === 0;
        context.strokeStyle = isLargeLine ? "#fecaca" : "#fee2e2";
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
    }

    for (let y = smallGridSize; y < height; y += smallGridSize) {
        const isLargeLine = y % largeGridSize === 0;
        context.strokeStyle = isLargeLine ? "#fecaca" : "#fee2e2";
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
    }
}

function drawHeartbeat(context, startX, baselineY, beatWidth, amplitude) {
    context.moveTo(startX, baselineY);

    // Baseline and P wave
    context.lineTo(startX + beatWidth * 0.10, baselineY);
    context.bezierCurveTo(
        startX + beatWidth * 0.13, baselineY,
        startX + beatWidth * 0.14, baselineY - amplitude * 0.13,
        startX + beatWidth * 0.18, baselineY - amplitude * 0.13
    );
    context.bezierCurveTo(
        startX + beatWidth * 0.22, baselineY - amplitude * 0.13,
        startX + beatWidth * 0.23, baselineY,
        startX + beatWidth * 0.27, baselineY
    );

    // QRS complex
    context.lineTo(startX + beatWidth * 0.34, baselineY);
    context.lineTo(startX + beatWidth * 0.37, baselineY + amplitude * 0.16);
    context.lineTo(startX + beatWidth * 0.40, baselineY - amplitude);
    context.lineTo(startX + beatWidth * 0.43, baselineY + amplitude * 0.34);
    context.lineTo(startX + beatWidth * 0.47, baselineY);

    // ST segment and T wave
    context.lineTo(startX + beatWidth * 0.58, baselineY);
    context.bezierCurveTo(
        startX + beatWidth * 0.63, baselineY,
        startX + beatWidth * 0.66, baselineY - amplitude * 0.32,
        startX + beatWidth * 0.72, baselineY - amplitude * 0.32
    );
    context.bezierCurveTo(
        startX + beatWidth * 0.78, baselineY - amplitude * 0.32,
        startX + beatWidth * 0.80, baselineY,
        startX + beatWidth * 0.86, baselineY
    );
    context.lineTo(startX + beatWidth, baselineY);
}

function drawEcg() {
    const bounds = ecgCanvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;

    ecgCanvas.width = Math.round(bounds.width * pixelRatio);
    ecgCanvas.height = Math.round(bounds.height * pixelRatio);

    ecgContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ecgContext.fillStyle = "#ffffff";
    ecgContext.fillRect(0, 0, bounds.width, bounds.height);

    drawGrid(ecgContext, bounds.width, bounds.height);

    const horizontalPadding = 20;
    const baselineY = bounds.height * 0.55;
    const beatWidth = (bounds.width - horizontalPadding * 2) / 2;
    const amplitude = Math.min(bounds.height * 0.38, beatWidth * 0.42);

    ecgContext.strokeStyle = "#dc2626";
    ecgContext.lineWidth = 2.5;
    ecgContext.lineCap = "round";
    ecgContext.lineJoin = "round";
    ecgContext.beginPath();
    drawHeartbeat(ecgContext, horizontalPadding, baselineY, beatWidth, amplitude);
    drawHeartbeat(ecgContext, horizontalPadding + beatWidth, baselineY, beatWidth, amplitude);
    ecgContext.stroke();
}

drawEcg();
window.addEventListener("resize", drawEcg);


// ==================== PARTIE 3D (Three.js & Cœur) ====================
const heartContainer = document.getElementById("heart-container");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const width = heartContainer.clientWidth || 400;
const height = heartContainer.clientHeight || 300;

const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(width, height);
heartContainer.innerHTML = ""; 
heartContainer.appendChild(renderer.domElement);

// Éclairages pour le relief
scene.add(new THREE.AmbientLight(0xffffff, 1.5));
const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.5);
dirLight1.position.set(5, 5, 5);
scene.add(dirLight1);

const dirLight2 = new THREE.DirectionalLight(0x93c5fd, 1);
dirLight2.position.set(-5, -5, -5);
scene.add(dirLight2);

let heartMesh = null;
let clock = new THREE.Clock();
let isPlaying = false;
let animOffset = 0;

// Gestion des boutons (Start, Pause, Restart)
const startBtn = document.getElementById("start-btn");
const pauseBtn = document.getElementById("pause-btn");
const restartBtn = document.getElementById("restart-btn");

if (startBtn) {
    startBtn.addEventListener("click", () => { isPlaying = true; });
}

if (pauseBtn) {
    pauseBtn.addEventListener("click", () => { isPlaying = false; });
}

if (restartBtn) {
    restartBtn.addEventListener("click", () => {
        isPlaying = true;
        clock.start();
        animOffset = Math.random() * 10; // Redémarre sur un cycle aléatoire
    });
}

const loader = new GLTFLoader();
loader.load('models/Human_Heart.glb', (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 2.5;
    const scaleFactor = targetSize / maxDim;

    model.position.sub(center);
    heartMesh = new THREE.Group();
    heartMesh.add(model);
    heartMesh.scale.setScalar(scaleFactor);
    heartMesh.rotation.y = -0.5;
    const baseScale = scaleFactor;
    scene.add(heartMesh);

    camera.position.set(0, 0, 2.2);
    camera.lookAt(0, 0, 0);

    function animate3D() {
        requestAnimationFrame(animate3D);

        if (heartMesh) {
            if (isPlaying) {
                const elapsedTime = clock.getElapsedTime() + animOffset;
                const beat = Math.abs(Math.sin(elapsedTime * 5));
                const contraction = Math.pow(beat, 3) * 0.15;
                
                heartMesh.scale.set(
                    baseScale * (1 + contraction * 0.7),
                    baseScale * (1 + contraction),
                    baseScale * (1 + contraction * 0.7)
                );
                
                heartMesh.rotation.y = -0.5 + Math.sin(elapsedTime * 5) * 0.04;
            } else {
                heartMesh.scale.set(baseScale, baseScale, baseScale);
                heartMesh.rotation.y = -0.5;
            }
        }

        renderer.render(scene, camera);
    }
    animate3D();

}, undefined, (error) => {
    console.error("Erreur de chargement du modèle 3D :", error);
    heartContainer.innerHTML = "<p style='color: #dc2626;'>Erreur de chargement du modèle 3D</p>";
});