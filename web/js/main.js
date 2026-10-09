const ecgCanvas = document.getElementById("ecg-canvas");

const ecgContext = ecgCanvas.getContext("2d");



const playButton = document.getElementById("play-button");

const pauseButton = document.getElementById("pause-button");

const restartButton = document.getElementById("restart-button");

const recordSelect = document.getElementById("record-select");

const speedSelect = document.getElementById("speed-select");

const timeDisplay = document.getElementById("time-display");

const phaseDisplay = document.getElementById("phase-display");

const phaseCode = document.getElementById("phase-code");

const phaseDescription = document.getElementById("phase-description");

const heartContainer = document.getElementById("heart-container");

const HEART_SYNC_EVENT = "ecg-heart-sync";



let currentRecord = null;

let playbackDuration = 0;

let signalMinimum = 0;

let signalMaximum = 1;

let currentTime = 0;

let playbackSpeed = Number(speedSelect.value);

let isPlaying = false;

let isLoading = true;

let loadError = null;

let animationFrameId = null;

let lastTimestamp = null;



function drawGrid(context, width, height, plot, duration) {

    const horizontalLineCount = 8;



    for (let line = 0; line <= horizontalLineCount; line += 1) {

        const y = plot.top + (line / horizontalLineCount) * plot.height;

        const isLargeLine = line % 2 === 0;



        context.strokeStyle = isLargeLine ? "#d7e6e2" : "#edf3f1";

        context.lineWidth = 1;

        context.beginPath();

        context.moveTo(plot.left, y);

        context.lineTo(plot.left + plot.width, y);

        context.stroke();

    }



    const minorStep = 0.2;

    const stepCount = Math.round(duration / minorStep);



    for (let step = 0; step <= stepCount; step += 1) {

        const time = step * minorStep;

        const x = plot.left + (time / duration) * plot.width;

        const isSecond = step % 5 === 0;



        context.strokeStyle = isSecond ? "#d7e6e2" : "#edf3f1";

        context.lineWidth = 1;

        context.beginPath();

        context.moveTo(x, plot.top);

        context.lineTo(x, plot.top + plot.height);

        context.stroke();



        if (step % 10 === 0 && time <= duration) {

            context.fillStyle = "#80918f";

            context.font = "10px Avenir, sans-serif";

            context.textAlign = step === 0

                ? "left"

                : time === duration

                    ? "right"

                    : "center";

            context.fillText(`${time.toFixed(0)}s`, x, height - 10);

        }

    }

}



function getCurrentSampleIndex() {

    if (!currentRecord || currentRecord.ecg.length === 0) {

        return 0;

    }



    const sampleIndex = Math.floor(currentTime * currentRecord.fs);

    return Math.min(Math.max(sampleIndex, 0), currentRecord.ecg.length - 1);

}



function traceSignal(context, plot, color, lineWidth, lastSampleIndex) {

    const signal = currentRecord.ecg;

    const amplitudeRange = signalMaximum - signalMinimum || 1;

    const finalSampleIndex = lastSampleIndex === undefined

        ? signal.length - 1

        : Math.min(Math.max(lastSampleIndex, 0), signal.length - 1);



    context.strokeStyle = color;

    context.lineWidth = lineWidth;

    context.lineCap = "round";

    context.lineJoin = "round";

    context.beginPath();



    let pathStarted = false;



    for (let sampleIndex = 0; sampleIndex <= finalSampleIndex; sampleIndex += 1) {

        const value = Number(signal[sampleIndex]);



        if (!Number.isFinite(value)) {

            pathStarted = false;

            continue;

        }



        const sampleTime = sampleIndex / currentRecord.fs;

        const x = plot.left + (sampleTime / playbackDuration) * plot.width;

        const normalizedValue = (value - signalMinimum) / amplitudeRange;

        const y = plot.top + (1 - normalizedValue) * plot.height;



        if (!pathStarted) {

            context.moveTo(x, y);

            pathStarted = true;

        } else {

            context.lineTo(x, y);

        }

    }



    context.stroke();

}



function drawMessage(context, width, height, message) {

    context.fillStyle = "#748683";

    context.font = "600 14px Avenir, sans-serif";

    context.textAlign = "center";

    context.fillText(message, width / 2, height / 2);

}



function drawEcg() {

    const bounds = ecgCanvas.getBoundingClientRect();

    const pixelRatio = window.devicePixelRatio || 1;



    if (bounds.width === 0 || bounds.height === 0) {

        return;

    }



    ecgCanvas.width = Math.round(bounds.width * pixelRatio);

    ecgCanvas.height = Math.round(bounds.height * pixelRatio);



    ecgContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    ecgContext.fillStyle = "#f9fbfa";

    ecgContext.fillRect(0, 0, bounds.width, bounds.height);



    const plot = {

        left: 28,

        top: 20,

        width: bounds.width - 56,

        height: bounds.height - 54

    };



    drawGrid(ecgContext, bounds.width, bounds.height, plot, playbackDuration || 10);



    if (!currentRecord) {

        const message = loadError || "Loading ECG signal…";

        drawMessage(ecgContext, bounds.width, bounds.height, message);

        return;

    }



    traceSignal(ecgContext, plot, "#b9c9c5", 1.3);



    const progress = Math.min(currentTime / playbackDuration, 1);

    const currentSampleIndex = getCurrentSampleIndex();



    if (progress > 0) {

        const cursorX = plot.left + progress * plot.width;



        traceSignal(

            ecgContext,

            plot,

            "#087c64",

            2.2,

            currentSampleIndex

        );



        ecgContext.strokeStyle = "rgba(8, 124, 100, 0.42)";

        ecgContext.lineWidth = 1;

        ecgContext.beginPath();

        ecgContext.moveTo(cursorX, plot.top);

        ecgContext.lineTo(cursorX, plot.top + plot.height);

        ecgContext.stroke();



        ecgContext.fillStyle = "#087c64";

        ecgContext.beginPath();

        ecgContext.arc(cursorX, plot.top, 4, 0, Math.PI * 2);

        ecgContext.fill();

    }

}



function timeIsInIntervals(time, intervals) {

    return intervals.some(([start, end]) => time >= start && time <= end);

}



function getPhase(time) {

    if (!currentRecord) {

        return {

            name: isLoading ? "Loading…" : "Unavailable",

            code: "—",

            key: "rest",

            description: loadError || "Waiting for an ECG record."

        };

    }



    if (timeIsInIntervals(time, currentRecord.intervals.P)) {

        return {

            name: "P WAVE",

            code: "P",

            key: "p",

            description: "The electrical activity preceding atrial contraction."

        };

    }



    if (timeIsInIntervals(time, currentRecord.intervals.QRS)) {

        return {

            name: "QRS",

            code: "QRS",

            key: "qrs",

            description: "The complex associated with the onset of ventricular contraction."

        };

    }



    if (timeIsInIntervals(time, currentRecord.intervals.T)) {

        return {

            name: "T WAVE",

            code: "T",

            key: "t",

            description: "The ventricles progressively return to their resting electrical state."

        };

    }



    return {

        name: "REST",

        code: "—",

        key: "rest",

        description: "Time outside the annotated P, QRS and T intervals."

    };

}



function formatTime(time) {

    const minutes = Math.floor(time / 60).toString().padStart(2, "0");

    const seconds = (time % 60).toFixed(1).padStart(4, "0");



    return `${minutes}:${seconds}`;

}



function updateControls() {

    const recordUnavailable = isLoading || currentRecord === null;



    recordSelect.disabled = isLoading;

    playButton.disabled = recordUnavailable || isPlaying;

    pauseButton.disabled = recordUnavailable || !isPlaying;

    restartButton.disabled = recordUnavailable;

}




function publishHeartSyncState(phase) {
    const intervals = currentRecord && currentRecord.intervals
        ? currentRecord.intervals
        : {};

    const state = {
        currentTime,
        duration: playbackDuration,
        isPlaying,
        phaseKey: phase.key,
        playbackSpeed,
        recordLabel: currentRecord ? currentRecord.label : null,
        pIntervals: Array.isArray(intervals.P) ? intervals.P : [],
        qrsIntervals: Array.isArray(intervals.QRS) ? intervals.QRS : [],
        tIntervals: Array.isArray(intervals.T) ? intervals.T : []
    };

    // Keep the latest ECG state available even if the Three.js module
    // finishes loading after the ECG interface has already initialized.
    window.__ecgHeartSyncState = state;
    window.dispatchEvent(new CustomEvent(HEART_SYNC_EVENT, {detail: state}));
}


function updateInterface() {

    const phase = getPhase(currentTime);



    timeDisplay.textContent = formatTime(currentTime);

    phaseDisplay.textContent = phase.name;

    phaseCode.textContent = phase.code;

    phaseCode.dataset.phase = phase.key;

    phaseDescription.textContent = phase.description;

    heartContainer.dataset.phase = phase.key;
    publishHeartSyncState(phase);



    updateControls();

    drawEcg();

}



function stopAnimation() {

    isPlaying = false;

    lastTimestamp = null;



    if (animationFrameId !== null) {

        window.cancelAnimationFrame(animationFrameId);

        animationFrameId = null;

    }

}



function pausePlayback() {

    stopAnimation();

    updateInterface();

}



function animate(timestamp) {

    // This scheduled frame has now been consumed.

    animationFrameId = null;



    if (!isPlaying || !currentRecord) {

        return;

    }



    if (lastTimestamp === null) {

        lastTimestamp = timestamp;

        animationFrameId = window.requestAnimationFrame(animate);

        return;

    }



    const deltaRealSeconds = (timestamp - lastTimestamp) / 1000;

    lastTimestamp = timestamp;

    currentTime = Math.min(

        currentTime + deltaRealSeconds * playbackSpeed,

        playbackDuration

    );



    if (currentTime >= playbackDuration) {

        stopAnimation();

        updateInterface();

        return;

    }



    updateInterface();

    animationFrameId = window.requestAnimationFrame(animate);

}



function playPlayback() {

    // Prevent repeated clicks from starting parallel animation loops.

    if (!currentRecord || isPlaying) {

        return;

    }



    if (currentTime >= playbackDuration) {

        currentTime = 0;

    }



    isPlaying = true;

    lastTimestamp = null;

    updateInterface();

    animationFrameId = window.requestAnimationFrame(animate);

}



function restartPlayback() {

    stopAnimation();

    currentTime = 0;

    updateInterface();

}



function changePlaybackSpeed() {

    const selectedSpeed = Number(speedSelect.value);



    if (!Number.isFinite(selectedSpeed) || selectedSpeed <= 0) {

        return;

    }



    // Only the animation loop advances currentTime. The next frame uses the

    // new speed immediately without resetting or changing the ECG timeline.

    playbackSpeed = selectedSpeed;

    updateInterface();

}



function calculateSignalRange(signal) {

    let minimum = Infinity;

    let maximum = -Infinity;



    for (const sample of signal) {

        const value = Number(sample);



        if (Number.isFinite(value)) {

            minimum = Math.min(minimum, value);

            maximum = Math.max(maximum, value);

        }

    }



    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {

        return {minimum: 0, maximum: 1};

    }



    const padding = (maximum - minimum || 1) * 0.08;

    return {

        minimum: minimum - padding,

        maximum: maximum + padding

    };

}



async function fetchJson(path) {

    const response = await fetch(path);



    if (!response.ok) {

        throw new Error(`HTTP error ${response.status}`);

    }



    return response.json();

}



async function loadRecord(recordId) {

    stopAnimation();

    currentTime = 0;

    currentRecord = null;

    playbackDuration = 0;

    loadError = null;

    isLoading = true;

    updateInterface();



    try {

        const record = await fetchJson(`data/ludb/records/record-${recordId}.json`);



        if (!Array.isArray(record.ecg) || !Number.isFinite(record.fs) || record.fs <= 0) {

            throw new Error("Invalid ECG format");

        }



        currentRecord = record;

        playbackDuration = record.ecg.length / record.fs;



        const range = calculateSignalRange(record.ecg);

        signalMinimum = range.minimum;

        signalMaximum = range.maximum;



        ecgCanvas.setAttribute(

            "aria-label",

            `Real ECG signal for ${record.label}, duration ${playbackDuration.toFixed(1)} seconds.`

        );

    } catch (error) {

        loadError = `Unable to load Record ${recordId}.`;

        console.error(error);

    } finally {

        isLoading = false;

        updateInterface();

    }

}



async function initializeRecords() {

    isLoading = true;

    updateInterface();



    try {

        const recordIndex = await fetchJson("data/ludb/index.json");



        if (!Array.isArray(recordIndex) || recordIndex.length === 0) {

            throw new Error("Empty or invalid LUDB index");

        }



        const options = document.createDocumentFragment();



        for (const record of recordIndex) {

            const option = document.createElement("option");

            option.value = record.id;

            option.textContent = record.label;

            options.appendChild(option);

        }



        recordSelect.replaceChildren(options);

        recordSelect.value = recordIndex[0].id;

        await loadRecord(recordIndex[0].id);

    } catch (error) {

        isLoading = false;

        loadError = "Unable to load the LUDB index.";

        console.error(error);

        updateInterface();

    }

}



playButton.addEventListener("click", playPlayback);

pauseButton.addEventListener("click", pausePlayback);

restartButton.addEventListener("click", restartPlayback);

recordSelect.addEventListener("change", () => loadRecord(recordSelect.value));

speedSelect.addEventListener("change", changePlaybackSpeed);

window.addEventListener("resize", drawEcg);

document.addEventListener("visibilitychange", () => {

    // Safari pauses requestAnimationFrame in background tabs. Start with a

    // fresh frame timestamp when the page becomes active again.

    lastTimestamp = null;

});



initializeRecords();


