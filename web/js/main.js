const ecgCanvas = document.getElementById("ecg-canvas");

const ecgContext = ecgCanvas.getContext("2d");



const playButton = document.getElementById("play-button");

const pauseButton = document.getElementById("pause-button");
const signalOptionsButton = document.getElementById("signal-options-button");
const signalOptions = document.getElementById("signal-options");

const restartButton = document.getElementById("restart-button");
const zoomOutButton = document.getElementById("ecg-zoom-out-button");
const resetZoomButton = document.getElementById("ecg-reset-zoom-button");
const zoomInButton = document.getElementById("ecg-zoom-in-button");
const recordSelect = document.getElementById("record-select");
const speedSelect = document.getElementById("speed-select");
const previousRecordButton = document.getElementById("previous-record-button");
const nextRecordButton = document.getElementById("next-record-button");
const importEcgButton = document.getElementById("import-ecg-button");
const importDialog = document.getElementById("import-ecg-dialog");
const importForm = document.getElementById("import-ecg-form");
const importFileInput = document.getElementById("ecg-import-file");
const importError = document.getElementById("ecg-import-error");
const importStatus = document.getElementById("ecg-import-status");
const ecgSourceLabel = document.getElementById("ecg-source-label");
const localRecords = new Map();
let localRecordCount = 0;
let recordLoadRequestId = 0;
let isImporting = false;

const switchSignalButton = document.getElementById("switch-signal-button");
const viewReportButton = document.getElementById("view-report-button");
const reportDialog = document.getElementById("report-dialog");
const reportPreview = document.getElementById("report-preview");
const closeReportButton = document.getElementById("close-report-button");
const userGuideButton = document.getElementById("user-guide-button");
const guideDialog = document.getElementById("guide-dialog");
const closeGuideButton = document.getElementById("close-guide-button");
const guidePageButtons = document.querySelectorAll("[data-guide-page]");
const guidePages = document.querySelectorAll(".guide-page");
const timeDisplay = document.getElementById("time-display");
const samplingFrequencyDisplay = document.getElementById("record-sampling-frequency");

const phaseDisplay = document.getElementById("phase-display");

const phaseCode = document.getElementById("phase-code");

const phaseDescription = document.getElementById("phase-description");

const heartContainer = document.getElementById("heart-container");

const HEART_SYNC_EVENT = "ecg-heart-sync";
const FILTER_LOW_HZ = 0.5;
const FILTER_HIGH_HZ = 40;
const FILTER_ORDER = 4;
const QRS_BASELINE_LOOKBACK_SECONDS = 0.2;
const QRS_BASELINE_GAP_SECONDS = 0.02;
const QRS_MIN_BASELINE_SAMPLE_COUNT = 10;
const QRS_AMPLITUDE_QUANTILE = 0.95;
const QRS_AMPLITUDE_MAD_SCALE = 1.4826;
const QRS_AMPLITUDE_RELATIVE_SCALE_FLOOR = 0.05;
const QRS_AMPLITUDE_Z_LIMIT = 2;
const QRS_AMPLITUDE_EPSILON = 1e-12;
const QRS_ACTIVITY_NOISE_MULTIPLIER = 3;
const QRS_ACTIVITY_NUMERICAL_EPSILON_MULTIPLIER = 32;
const QRS_DEGENERATE_BASELINE_QUANTILE = 0.95;
const ECG_Y_MINIMUM = -1.2;
const ECG_Y_MAXIMUM = 1.2;
const MIN_VIEWPORT_DURATION = 0.5;
const BUTTON_ZOOM_FACTOR = 0.8;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const PAN_MOVEMENT_THRESHOLD = 5;
const VIEWPORT_EPSILON = 1e-6;

let currentRecord = null;
let filteredSignal = null;
let qrsAmplitudeProfile = [];
let showingFilteredSignal = false;
let playbackDuration = 0;

let signalMinimum = ECG_Y_MINIMUM;

let signalMaximum = ECG_Y_MAXIMUM;

let currentTime = 0;

let playbackSpeed = Number(speedSelect.value);

let isPlaying = false;

let isLoading = true;

let loadError = null;

let animationFrameId = null;

let lastTimestamp = null;
let hoveredTime = null;
let isScrubbing = false;
let isPanning = false;
let ecgPointerGesture = null;
let viewportStartTime = 0;
let viewportEndTime = 0;



function getThemeColor(variableName, fallback) {
    const value = getComputedStyle(document.documentElement)
        .getPropertyValue(variableName)
        .trim();

    return value || fallback;
}

function getEcgPlot(width, height) {
    return {
        left: 28,
        top: 20,
        width: Math.max(0, width - 56),
        height: Math.max(0, height - 54)
    };
}

function getViewportDuration() {
    return Math.max(0, viewportEndTime - viewportStartTime);
}

function getMinimumViewportDuration() {
    return Math.min(MIN_VIEWPORT_DURATION, playbackDuration);
}

function clampViewport(startTime = viewportStartTime, endTime = viewportEndTime) {
    if (playbackDuration <= 0) {
        viewportStartTime = 0;
        viewportEndTime = 0;
        return;
    }

    const requestedDuration = Number.isFinite(endTime - startTime)
        ? endTime - startTime
        : playbackDuration;
    const duration = Math.min(
        playbackDuration,
        Math.max(getMinimumViewportDuration(), requestedDuration)
    );
    const latestStart = Math.max(0, playbackDuration - duration);

    viewportStartTime = Math.min(Math.max(startTime, 0), latestStart);
    viewportEndTime = viewportStartTime + duration;
}

function resetViewport() {
    viewportStartTime = 0;
    viewportEndTime = Math.max(0, playbackDuration);
    hoveredTime = null;
}

function zoomViewportAroundTime(time, factor) {
    const oldDuration = getViewportDuration();
    if (
        playbackDuration <= 0
        || oldDuration <= 0
        || !Number.isFinite(time)
        || !Number.isFinite(factor)
        || factor <= 0
    ) {
        return false;
    }

    const newDuration = Math.min(
        playbackDuration,
        Math.max(getMinimumViewportDuration(), oldDuration * factor)
    );
    if (Math.abs(newDuration - oldDuration) < VIEWPORT_EPSILON) {
        return false;
    }

    const anchorTime = Math.min(Math.max(time, viewportStartTime), viewportEndTime);
    const anchorRatio = (anchorTime - viewportStartTime) / oldDuration;

    // Keep the ECG time below the pointer at the same relative canvas position.
    const newStartTime = anchorTime - anchorRatio * newDuration;
    clampViewport(newStartTime, newStartTime + newDuration);
    return true;
}

function panViewport(deltaTime) {
    if (!Number.isFinite(deltaTime) || playbackDuration <= 0) {
        return false;
    }

    const previousStart = viewportStartTime;
    const duration = getViewportDuration();
    clampViewport(
        viewportStartTime + deltaTime,
        viewportStartTime + deltaTime + duration
    );
    return Math.abs(viewportStartTime - previousStart) >= VIEWPORT_EPSILON;
}

// Every ECG layer uses these transformations, so overlays stay synchronized.
function timeToCanvasX(time, plot) {
    const duration = getViewportDuration();
    if (duration <= 0 || plot.width <= 0) {
        return plot.left;
    }

    return plot.left + ((time - viewportStartTime) / duration) * plot.width;
}

function canvasXToTime(canvasX, plot) {
    if (plot.width <= 0 || getViewportDuration() <= 0) {
        return null;
    }

    const ratio = (canvasX - plot.left) / plot.width;
    return viewportStartTime + ratio * getViewportDuration();
}

function isViewportZoomed() {
    return playbackDuration > 0
        && getViewportDuration() < playbackDuration - VIEWPORT_EPSILON;
}

function isTimeInViewport(time) {
    return time >= viewportStartTime - VIEWPORT_EPSILON
        && time <= viewportEndTime + VIEWPORT_EPSILON;
}

function getGridStep(duration) {
    if (duration <= 0) {
        return 0.2;
    }

    const idealStep = duration / 50;
    const magnitude = 10 ** Math.floor(Math.log10(idealStep));
    const normalizedStep = idealStep / magnitude;
    const multiplier = normalizedStep <= 1
        ? 1
        : normalizedStep <= 2
            ? 2
            : normalizedStep <= 5
                ? 5
                : 10;

    return multiplier * magnitude;
}


function drawGrid(context, height, plot) {

    const horizontalLineCount = 8;



    for (let line = 0; line <= horizontalLineCount; line += 1) {

        const y = plot.top + (line / horizontalLineCount) * plot.height;

        const isLargeLine = line % 2 === 0;



        context.strokeStyle = isLargeLine
            ? getThemeColor("--ecg-grid-major", "#d7e6e2")
            : getThemeColor("--ecg-grid-minor", "#edf3f1");

        context.lineWidth = 1;

        context.beginPath();

        context.moveTo(plot.left, y);

        context.lineTo(plot.left + plot.width, y);

        context.stroke();

    }



    const minorStep = getGridStep(getViewportDuration());
    const firstStep = Math.ceil((viewportStartTime - VIEWPORT_EPSILON) / minorStep);
    const lastStep = Math.floor((viewportEndTime + VIEWPORT_EPSILON) / minorStep);
    const majorStep = minorStep * 5;
    const labelDecimals = majorStep < 0.1 ? 2 : majorStep < 1 ? 1 : 0;

    for (let step = firstStep; step <= lastStep; step += 1) {

        const time = step * minorStep;

        const x = timeToCanvasX(time, plot);

        const isMajorLine = step % 5 === 0;



        context.strokeStyle = isMajorLine
            ? getThemeColor("--ecg-grid-major", "#d7e6e2")
            : getThemeColor("--ecg-grid-minor", "#edf3f1");

        context.lineWidth = 1;

        context.beginPath();

        context.moveTo(x, plot.top);

        context.lineTo(x, plot.top + plot.height);

        context.stroke();



        if (isMajorLine) {

            context.fillStyle = getThemeColor("--ecg-axis", "#80918f");

            context.font = "10px Avenir, sans-serif";

            context.textAlign = x < plot.left + 22
                ? "left"
                : x > plot.left + plot.width - 22
                    ? "right"
                    : "center";

            context.fillText(`${time.toFixed(labelDecimals)}s`, x, height - 10);

        }

    }

}

function drawPhaseRegions(context, plot) {
    const phases = [
        {key: "P", color: "rgba(100, 203, 213, 0.22)"},
        {key: "QRS", color: "rgba(238, 116, 95, 0.2)"},
        {key: "T", color: "rgba(242, 184, 75, 0.22)"}
    ];

    for (const phase of phases) {
        const intervals = currentRecord.intervals[phase.key] || [];
        context.fillStyle = phase.color;

        for (const interval of intervals) {
            if (
                !Array.isArray(interval)
                || interval.length !== 2
                || !interval.every(Number.isFinite)
            ) {
                continue;
            }

            const start = Math.max(viewportStartTime, interval[0]);
            const end = Math.min(viewportEndTime, interval[1]);
            if (end <= start) {
                continue;
            }

            const x = timeToCanvasX(start, plot);
            const width = timeToCanvasX(end, plot) - x;
            context.fillRect(x, plot.top, width, plot.height);
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

function getDisplayedSignal() {
    return showingFilteredSignal ? filteredSignal : currentRecord.ecg;
}

function traceSignal(context, plot, color, lineWidth, lastSampleIndex) {
    const signal = getDisplayedSignal();
    const amplitudeRange = signalMaximum - signalMinimum || 1;
    const firstVisibleSampleIndex = Math.max(
        0,
        Math.floor(viewportStartTime * currentRecord.fs) - 1
    );
    const lastVisibleSampleIndex = Math.min(
        signal.length - 1,
        Math.ceil(viewportEndTime * currentRecord.fs) + 1
    );
    const finalSampleIndex = lastSampleIndex === undefined
        ? lastVisibleSampleIndex
        : Math.min(lastVisibleSampleIndex, lastSampleIndex);

    if (finalSampleIndex < firstVisibleSampleIndex) {
        return;
    }



    context.save();
    context.beginPath();
    context.rect(plot.left, plot.top, plot.width, plot.height);
    context.clip();
    context.strokeStyle = color;

    context.lineWidth = lineWidth;

    context.lineCap = "round";

    context.lineJoin = "round";

    context.beginPath();



    let pathStarted = false;



    for (
        let sampleIndex = firstVisibleSampleIndex;
        sampleIndex <= finalSampleIndex;
        sampleIndex += 1
    ) {

        const value = Number(signal[sampleIndex]);



        if (!Number.isFinite(value)) {

            pathStarted = false;

            continue;

        }



        const sampleTime = sampleIndex / currentRecord.fs;

        const x = timeToCanvasX(sampleTime, plot);

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
    context.restore();

}



function drawMessage(context, width, height, message) {

    context.fillStyle = getThemeColor("--ecg-message", "#748683");

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

    ecgContext.fillStyle = getThemeColor("--ecg-canvas-bg", "#f9fbfa");

    ecgContext.fillRect(0, 0, bounds.width, bounds.height);

    ecgCanvas.dataset.zoomed = String(isViewportZoomed());
    ecgCanvas.dataset.panning = String(isPanning);



    const plot = getEcgPlot(bounds.width, bounds.height);



    drawGrid(ecgContext, bounds.height, plot);



    if (!currentRecord) {
        const message = loadError || "Loading ECG signal…";
        drawMessage(ecgContext, bounds.width, bounds.height, message);
        return;
    }

    ecgContext.save();
    ecgContext.beginPath();
    ecgContext.rect(plot.left, plot.top, plot.width, plot.height);
    ecgContext.clip();

    drawPhaseRegions(ecgContext, plot);

    const signalName = showingFilteredSignal ? "Filtered ECG" : "Raw ECG";
    const signalColor = showingFilteredSignal
        ? getThemeColor("--ecg-filtered", "#d97706")
        : getThemeColor("--ecg-raw", "#087c64");

    const backgroundSignalColor = showingFilteredSignal
        ? getThemeColor("--ecg-filtered-muted", "rgba(217, 119, 6, 0.42)")
        : getThemeColor("--ecg-raw-muted", "#b9c9c5");
    traceSignal(ecgContext, plot, backgroundSignalColor, 1.3);



    const currentSampleIndex = getCurrentSampleIndex();
    const selectedSignal = getDisplayedSignal();
    const selectedValue = Number(selectedSignal[currentSampleIndex]);
    const amplitudeRange = signalMaximum - signalMinimum || 1;

    traceSignal(
        ecgContext,
        plot,
        signalColor,
        2.2,
        currentSampleIndex
    );

    if (isTimeInViewport(currentTime)) {
        const cursorX = timeToCanvasX(currentTime, plot);
        const cursorY = plot.top + (
            1 - (selectedValue - signalMinimum) / amplitudeRange
        ) * plot.height;

        ecgContext.strokeStyle = showingFilteredSignal
            ? getThemeColor("--ecg-cursor-filtered", "rgba(217, 119, 6, 0.52)")
            : getThemeColor("--ecg-cursor-raw", "rgba(8, 124, 100, 0.52)");
        ecgContext.lineWidth = 1;
        ecgContext.beginPath();
        ecgContext.moveTo(cursorX, plot.top);
        ecgContext.lineTo(cursorX, plot.top + plot.height);
        ecgContext.stroke();

        if (Number.isFinite(selectedValue)) {
            ecgContext.fillStyle = signalColor;
            ecgContext.beginPath();
            ecgContext.arc(cursorX, cursorY, 4, 0, Math.PI * 2);
            ecgContext.fill();
        }
    }

    if (hoveredTime !== null && isTimeInViewport(hoveredTime) && !isPanning) {
        const hoverSampleIndex = Math.min(
            Math.max(Math.floor(hoveredTime * currentRecord.fs), 0),
            selectedSignal.length - 1
        );
        const hoverValue = Number(selectedSignal[hoverSampleIndex]);
        const hoverX = timeToCanvasX(hoveredTime, plot);
        const hoverY = plot.top + (
            1 - (hoverValue - signalMinimum) / amplitudeRange
        ) * plot.height;

        ecgContext.strokeStyle = getThemeColor(
            "--ecg-hover",
            "rgba(19, 37, 46, 0.55)"
        );
        ecgContext.setLineDash([4, 4]);
        ecgContext.beginPath();
        ecgContext.moveTo(hoverX, plot.top);
        ecgContext.lineTo(hoverX, plot.top + plot.height);
        ecgContext.stroke();
        ecgContext.setLineDash([]);

        if (Number.isFinite(hoverValue)) {
            ecgContext.fillStyle = getThemeColor("--ecg-hover-dot", "#13252e");
            ecgContext.beginPath();
            ecgContext.arc(hoverX, hoverY, 4, 0, Math.PI * 2);
            ecgContext.fill();
        }
    }

    ecgContext.restore();

    ecgCanvas.setAttribute(
        "aria-label",
        `${signalName} for ${currentRecord.label}, showing ${viewportStartTime.toFixed(2)} to ${viewportEndTime.toFixed(2)} seconds of ${playbackDuration.toFixed(1)} seconds.`
    );
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

    const seconds = (time % 60).toFixed(3).padStart(6, "0");



    return `${minutes}:${seconds}`;

}



function updateControls() {

    const recordUnavailable = isLoading || currentRecord === null;



    recordSelect.disabled = isLoading;
    previousRecordButton.disabled = isLoading || recordSelect.selectedIndex <= 0;
    nextRecordButton.disabled = isLoading || recordSelect.selectedIndex < 0
        || recordSelect.selectedIndex >= recordSelect.options.length - 1;
    importEcgButton.disabled = isLoading || isImporting;

    playButton.disabled = recordUnavailable || isPlaying;
    pauseButton.disabled = recordUnavailable || !isPlaying;

    restartButton.disabled = recordUnavailable;
    zoomInButton.disabled = recordUnavailable
        || getViewportDuration() <= getMinimumViewportDuration() + VIEWPORT_EPSILON;
    zoomOutButton.disabled = recordUnavailable || !isViewportZoomed();
    resetZoomButton.disabled = recordUnavailable || !isViewportZoomed();
    switchSignalButton.disabled = recordUnavailable;
    viewReportButton.disabled = recordUnavailable;
    switchSignalButton.textContent = showingFilteredSignal
        ? "Show raw ECG"
        : "Show filtered ECG";
    switchSignalButton.setAttribute(
        "aria-pressed",
        String(showingFilteredSignal)
    );
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
        qrsAmplitudeProfile: Array.isArray(qrsAmplitudeProfile)
            ? qrsAmplitudeProfile
            : [],
        tIntervals: Array.isArray(intervals.T) ? intervals.T : []
    };

    // Keep the latest ECG state available even if the Three.js module
    // finishes loading after the ECG interface has already initialized.
    window.__ecgHeartSyncState = state;
    window.dispatchEvent(new CustomEvent(HEART_SYNC_EVENT, {detail: state}));
}


function updateInterface() {

    const phase = getPhase(currentTime);

    samplingFrequencyDisplay.textContent = currentRecord
        ? `${currentRecord.fs} Hz`
        : "— Hz";


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

function complexMultiply(left, right) {
    return {
        real: left.real * right.real - left.imag * right.imag,
        imag: left.real * right.imag + left.imag * right.real
    };
}

function complexDivide(left, right) {
    const denominator = right.real * right.real + right.imag * right.imag;
    return {
        real: (left.real * right.real + left.imag * right.imag) / denominator,
        imag: (left.imag * right.real - left.real * right.imag) / denominator
    };
}

function complexSquareRoot(value) {
    const magnitude = Math.hypot(value.real, value.imag);
    return {
        real: Math.sqrt(Math.max((magnitude + value.real) / 2, 0)),
        imag: Math.sign(value.imag || 1)
            * Math.sqrt(Math.max((magnitude - value.real) / 2, 0))
    };
}

function getButterworthSections(samplingRate) {
    const order = FILTER_ORDER;
    const angularLow = 2 * samplingRate * Math.tan(Math.PI * FILTER_LOW_HZ / samplingRate);
    const angularHigh = 2 * samplingRate * Math.tan(Math.PI * FILTER_HIGH_HZ / samplingRate);
    const bandwidth = angularHigh - angularLow;
    const centerFrequencySquared = angularLow * angularHigh;
    const analogPoles = [];

    for (let index = 0; index < order; index += 1) {
        const angle = Math.PI * (2 * index + order + 1) / (2 * order);
        const prototypePole = {real: Math.cos(angle), imag: Math.sin(angle)};
        const scaledPole = {
            real: prototypePole.real * bandwidth,
            imag: prototypePole.imag * bandwidth
        };
        const discriminant = complexSquareRoot({
            real: scaledPole.real * scaledPole.real
                - scaledPole.imag * scaledPole.imag
                - 4 * centerFrequencySquared,
            imag: 2 * scaledPole.real * scaledPole.imag
        });

        for (const direction of [-1, 1]) {
            analogPoles.push({
                real: (scaledPole.real + direction * discriminant.real) / 2,
                imag: (scaledPole.imag + direction * discriminant.imag) / 2
            });
        }
    }

    const digitalPoles = analogPoles.map((pole) => complexDivide(
        {real: 2 * samplingRate + pole.real, imag: pole.imag},
        {real: 2 * samplingRate - pole.real, imag: -pole.imag}
    ));

    const gainNumerator = {
        real: bandwidth ** order * (2 * samplingRate) ** order,
        imag: 0
    };
    let gainDenominator = {real: 1, imag: 0};
    for (const pole of analogPoles) {
        gainDenominator = complexMultiply(gainDenominator, {
            real: 2 * samplingRate - pole.real,
            imag: -pole.imag
        });
    }
    const digitalGain = complexDivide(gainNumerator, gainDenominator).real;
    const sections = [];
    const upperHalfPoles = digitalPoles.filter((pole) => pole.imag > 1e-10);

    for (let index = 0; index < upperHalfPoles.length; index += 1) {
        const pole = upperHalfPoles[index];
        const zero = index < order / 2 ? 1 : -1;
        const sectionGain = sections.length === 0 ? digitalGain : 1;
        sections.push({
            b0: sectionGain,
            b1: -2 * zero * sectionGain,
            b2: sectionGain,
            a1: -2 * pole.real,
            a2: pole.real * pole.real + pole.imag * pole.imag
        });
    }

    if (
        sections.length !== order
        || !Number.isFinite(digitalGain)
        || sections.some((section) => (
            !Number.isFinite(section.a1)
            || !Number.isFinite(section.a2)
            || !Number.isFinite(section.b0)
        ))
    ) {
        throw new Error("Unable to design the ECG Butterworth filter.");
    }

    return sections;
}

function filterSection(signal, section) {
    const output = new Array(signal.length);
    const firstInput = signal[0];
    const steadyOutput = (
        (section.b0 + section.b1 + section.b2)
        / (1 + section.a1 + section.a2)
    ) * firstInput;
    let state1 = steadyOutput - section.b0 * firstInput;
    let state2 = section.b2 * firstInput - section.a2 * steadyOutput;

    for (let index = 0; index < signal.length; index += 1) {
        const input = signal[index];
        const value = section.b0 * input + state1;
        state1 = section.b1 * input - section.a1 * value + state2;
        state2 = section.b2 * input - section.a2 * value;
        output[index] = value;
    }

    return output;
}

function applyFilterSections(signal, sections) {
    return sections.reduce(
        (output, section) => filterSection(output, section),
        signal
    );
}

function filterEcg(signal, samplingRate) {
    const padLength = 3 * (2 * (FILTER_ORDER) + 1);
    if (signal.length <= padLength || FILTER_HIGH_HZ >= samplingRate / 2) {
        throw new Error("The selected record is too short or has an invalid sampling rate for filtering.");
    }

    const extended = [];
    for (let index = padLength; index > 0; index -= 1) {
        extended.push(2 * signal[0] - signal[index]);
    }
    for (const sample of signal) extended.push(sample);
    for (let index = 1; index <= padLength; index += 1) {
        extended.push(2 * signal[signal.length - 1] - signal[signal.length - 1 - index]);
    }

    const sections = getButterworthSections(samplingRate);
    const forward = applyFilterSections(extended, sections);
    const backward = applyFilterSections(forward.reverse(), sections).reverse();
    const filtered = backward.slice(padLength, padLength + signal.length);

    if (!filtered.every(Number.isFinite)) {
        throw new Error("The ECG filter produced a non-finite sample.");
    }

    return filtered;
}

function quantile(values, probability) {
    if (!Array.isArray(values) || values.length === 0) {
        return null;
    }

    const finiteValues = values
        .filter(Number.isFinite)
        .sort((left, right) => left - right);

    if (finiteValues.length === 0 || !Number.isFinite(probability)) {
        return null;
    }

    const clampedProbability = Math.min(Math.max(probability, 0), 1);
    const position = (finiteValues.length - 1) * clampedProbability;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);

    if (lowerIndex === upperIndex) {
        return finiteValues[lowerIndex];
    }

    const fraction = position - lowerIndex;
    return finiteValues[lowerIndex]
        + (finiteValues[upperIndex] - finiteValues[lowerIndex]) * fraction;
}

function median(values) {
    return quantile(values, 0.5);
}

function measureQrsAmplitude(signal, samplingRate, interval, pIntervals) {
    if (
        !Array.isArray(signal)
        || !Number.isFinite(samplingRate)
        || samplingRate <= 0
        || !Array.isArray(interval)
        || interval.length !== 2
    ) {
        return null;
    }

    const qrsStart = interval[0];
    const qrsEnd = interval[1];

    if (
        !Number.isFinite(qrsStart)
        || !Number.isFinite(qrsEnd)
        || qrsStart < 0
        || qrsEnd <= qrsStart
    ) {
        return null;
    }

    const signalDuration = signal.length / samplingRate;
    const clampedQrsEnd = Math.min(qrsEnd, signalDuration);
    const firstQrsSample = Math.max(0, Math.ceil(qrsStart * samplingRate));
    const afterLastQrsSample = Math.min(
        signal.length,
        Math.floor(clampedQrsEnd * samplingRate) + 1
    );

    if (afterLastQrsSample - firstQrsSample < 3) {
        return null;
    }

    const baselineEndTime = Math.max(0, qrsStart - QRS_BASELINE_GAP_SECONDS);
    const fallbackBaselineStartTime = Math.max(
        0,
        qrsStart - QRS_BASELINE_LOOKBACK_SECONDS
    );
    const firstBaselineSample = Math.max(
        0,
        Math.ceil(fallbackBaselineStartTime * samplingRate)
    );
    const afterLastBaselineSample = Math.min(
        signal.length,
        Math.floor(baselineEndTime * samplingRate) + 1
    );
    const baselineSamples = [];
    const pFreeBaselineSamples = [];

    for (
        let sampleIndex = firstBaselineSample;
        sampleIndex < afterLastBaselineSample;
        sampleIndex += 1
    ) {
        const sample = Number(signal[sampleIndex]);
        if (!Number.isFinite(sample)) {
            continue;
        }

        baselineSamples.push(sample);
        const sampleTime = sampleIndex / samplingRate;
        const overlapsPWave = Array.isArray(pIntervals)
            && pIntervals.some((pInterval) => (
                Array.isArray(pInterval)
                && pInterval.length === 2
                && Number.isFinite(pInterval[0])
                && Number.isFinite(pInterval[1])
                && sampleTime >= pInterval[0]
                && sampleTime <= pInterval[1]
            ));

        if (!overlapsPWave) {
            pFreeBaselineSamples.push(sample);
        }
    }

    const selectedBaselineSamples = pFreeBaselineSamples.length
        >= QRS_MIN_BASELINE_SAMPLE_COUNT
        ? pFreeBaselineSamples
        : baselineSamples;
    const localBaseline = median(selectedBaselineSamples);
    if (!Number.isFinite(localBaseline)) {
        return null;
    }

    const qrsSamples = signal
        .slice(firstQrsSample, afterLastQrsSample)
        .map(Number)
        .filter(Number.isFinite);
    const absoluteExcursions = qrsSamples.map(
        (sample) => Math.abs(sample - localBaseline)
    );
    const amplitude = quantile(absoluteExcursions, QRS_AMPLITUDE_QUANTILE);

    if (!Number.isFinite(amplitude) || amplitude < 0) {
        return null;
    }

    const baselineAbsoluteDeviations = selectedBaselineSamples.map(
        (sample) => Math.abs(sample - localBaseline)
    );
    const baselineMad = median(baselineAbsoluteDeviations);

    if (!Number.isFinite(baselineMad) || baselineMad < 0) {
        return null;
    }

    const madNoiseScale = QRS_AMPLITUDE_MAD_SCALE * baselineMad;

    if (!Number.isFinite(madNoiseScale) || madNoiseScale < 0) {
        return null;
    }

    let referenceMagnitude = Math.max(Math.abs(localBaseline), Number.MIN_VALUE);
    for (const sample of selectedBaselineSamples) {
        referenceMagnitude = Math.max(referenceMagnitude, Math.abs(sample));
    }
    for (const sample of qrsSamples) {
        referenceMagnitude = Math.max(referenceMagnitude, Math.abs(sample));
    }
    const numericalNoiseFloor = Math.max(
        QRS_ACTIVITY_NUMERICAL_EPSILON_MULTIPLIER
            * Number.EPSILON
            * referenceMagnitude,
        Number.MIN_VALUE
    );
    // MAD can collapse to zero for a quantized baseline even when two or
    // more repeated levels contain noise. In that degenerate case only, use
    // a robust high baseline excursion as the noise estimate. A genuinely
    // constant baseline keeps a zero noiseScale and relies on the numerical
    // floor solely to make the comparison and SNR division safe.
    const fallbackNoiseScale = quantile(
        baselineAbsoluteDeviations,
        QRS_DEGENERATE_BASELINE_QUANTILE
    );
    const noiseScale = madNoiseScale <= numericalNoiseFloor
        && Number.isFinite(fallbackNoiseScale)
        ? fallbackNoiseScale
        : madNoiseScale;
    const effectiveNoiseScale = Math.max(noiseScale, numericalNoiseFloor);
    const rawSignalToNoiseRatio = amplitude / effectiveNoiseScale;
    const signalToNoiseRatio = Number.isFinite(rawSignalToNoiseRatio)
        ? rawSignalToNoiseRatio
        : amplitude > 0
            ? Number.MAX_VALUE
            : 0;
    const active = amplitude
        > QRS_ACTIVITY_NOISE_MULTIPLIER * effectiveNoiseScale;

    return {
        amplitude,
        noiseScale,
        signalToNoiseRatio,
        active
    };
}

function normalizeQrsAmplitudes(profile) {
    if (!Array.isArray(profile)) {
        return [];
    }

    const validAmplitudes = profile
        .map((entry) => entry && entry.active === true
            ? entry.amplitude
            : null)
        .filter((amplitude) => Number.isFinite(amplitude) && amplitude >= 0);

    if (validAmplitudes.length === 0) {
        return profile.map((entry) => ({
            ...entry,
            normalizedAmplitude: null
        }));
    }

    const center = median(validAmplitudes);
    const absoluteDeviations = validAmplitudes.map(
        (amplitude) => Math.abs(amplitude - center)
    );
    const medianAbsoluteDeviation = median(absoluteDeviations);
    const scale = Math.max(
        QRS_AMPLITUDE_MAD_SCALE * medianAbsoluteDeviation,
        QRS_AMPLITUDE_RELATIVE_SCALE_FLOOR * Math.abs(center),
        QRS_AMPLITUDE_EPSILON
    );

    return profile.map((entry) => {
        const amplitude = entry ? entry.amplitude : null;
        if (
            !entry
            || entry.active !== true
            || !Number.isFinite(amplitude)
            || amplitude < 0
        ) {
            return {...entry, normalizedAmplitude: null};
        }

        const zScore = Math.min(
            Math.max((amplitude - center) / scale, -QRS_AMPLITUDE_Z_LIMIT),
            QRS_AMPLITUDE_Z_LIMIT
        );
        const normalizedAmplitude = Math.min(
            Math.max(0.5 + zScore / (2 * QRS_AMPLITUDE_Z_LIMIT), 0),
            1
        );

        return {...entry, normalizedAmplitude};
    });
}

function buildQrsAmplitudeProfile(record, signal) {
    const qrsIntervals = record && record.intervals
        && Array.isArray(record.intervals.QRS)
        ? record.intervals.QRS
        : [];
    const pIntervals = record && record.intervals
        && Array.isArray(record.intervals.P)
        ? record.intervals.P
        : [];

    const profile = qrsIntervals.map((interval) => {
        const start = Array.isArray(interval) ? interval[0] : NaN;
        const end = Array.isArray(interval) ? interval[1] : NaN;
        const measurement = measureQrsAmplitude(
            signal,
            record.fs,
            interval,
            pIntervals
        );

        return {
            start: Number.isFinite(start) ? start : null,
            end: Number.isFinite(end) ? end : null,
            amplitude: measurement ? measurement.amplitude : null,
            noiseScale: measurement ? measurement.noiseScale : null,
            signalToNoiseRatio: measurement
                ? measurement.signalToNoiseRatio
                : null,
            normalizedAmplitude: null,
            active: measurement ? measurement.active : false
        };
    });

    return normalizeQrsAmplitudes(profile);
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function generateReportPlot(record) {
    const width = 1000;
    const height = 420;
    const padding = {top: 24, right: 24, bottom: 54, left: 64};
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const range = calculateSignalRange([...record.ecg, ...filteredSignal]);
    const amplitudeRange = range.maximum - range.minimum || 1;
    const duration = record.ecg.length / record.fs;
    const phaseColors = {
        P: "#64cbd5",
        QRS: "#ee745f",
        T: "#f2b84b"
    };
    const stride = Math.max(1, Math.ceil(record.ecg.length / 2500));
    const toPoints = (signal) => {
        const points = [];
        const appendPoint = (sampleIndex) => {
            const value = signal[sampleIndex];
            const x = padding.left + (sampleIndex / (signal.length - 1)) * plotWidth;
            const y = padding.top
                + (1 - (value - range.minimum) / amplitudeRange) * plotHeight;
            points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
        };

        for (let sampleIndex = 0; sampleIndex < signal.length; sampleIndex += stride) {
            appendPoint(sampleIndex);
        }
        if ((signal.length - 1) % stride !== 0) {
            appendPoint(signal.length - 1);
        }
        return points.join(" ");
    };
    const grid = Array.from({length: 5}, (_, index) => {
        const ratio = index / 4;
        const y = padding.top + ratio * plotHeight;
        const value = range.maximum - ratio * amplitudeRange;
        return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" />`
            + `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end">${value.toFixed(2)}</text>`;
    }).join("");
    const timeTicks = Array.from({length: 6}, (_, index) => {
        const ratio = index / 5;
        const x = padding.left + ratio * plotWidth;
        return `<line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" />`
            + `<text x="${x}" y="${height - padding.bottom + 24}" text-anchor="middle">${(duration * ratio).toFixed(1)}</text>`;
    }).join("");
    const phaseRegions = Object.entries(phaseColors).flatMap(([phase, color]) => (
        (record.intervals[phase] || []).flatMap((interval) => {
            if (
                !Array.isArray(interval)
                || interval.length !== 2
                || !interval.every(Number.isFinite)
            ) {
                return [];
            }

            const start = Math.max(0, interval[0]);
            const end = Math.min(duration, interval[1]);
            if (end <= start) {
                return [];
            }

            const x = padding.left + (start / duration) * plotWidth;
            const regionWidth = ((end - start) / duration) * plotWidth;
            return [`<rect x="${x.toFixed(2)}" y="${padding.top}" width="${regionWidth.toFixed(2)}" height="${plotHeight}" fill="${color}" fill-opacity="0.28" />`];
        })
    )).join("");

    return `<svg class="report-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparison of raw and filtered ECG signals">
        <g class="phase-regions">${phaseRegions}</g>
        <g class="chart-grid">${grid}${timeTicks}</g>
        <polyline class="chart-raw" points="${toPoints(record.ecg)}" />
        <polyline class="chart-filtered" points="${toPoints(filteredSignal)}" />
        <text class="chart-axis-label" x="${width / 2}" y="${height - 8}" text-anchor="middle">Time (s)</text>
        <text class="chart-axis-label" transform="translate(16 ${height / 2}) rotate(-90)" text-anchor="middle">Amplitude</text>
    </svg>`;
}

function generateReportPreview(record) {
    const recordName = escapeHtml(record.label || `Record ${recordSelect.value}`);
    const reportTheme = document.documentElement.dataset.theme === "dark"
        ? "dark"
        : "light";
    const plot = generateReportPlot(record);
    const pWaveMeasurements = getPWavePeakMeasurements(record, filteredSignal);
    const pWaveRows = pWaveMeasurements.length
        ? pWaveMeasurements.map((measurement) => `<tr>
                    <td>P${measurement.number} → QRS${measurement.qrsNumber}</td>
                    <td>${measurement.onset.toFixed(3)} s</td>
                    <td>${measurement.peakTime.toFixed(3)} s</td>
                    <td>${(measurement.delay * 1000).toFixed(1)} ms</td>
                    <td>${measurement.amplitude.toFixed(4)}</td>
                </tr>`).join("")
        : '<tr><td colspan="5">No valid P-to-QRS annotations are available for this record.</td></tr>';

    return `<!DOCTYPE html>
<html lang="en" data-theme="${reportTheme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ECG report - ${recordName}</title>
    <style>
        :root {
            color-scheme: light;
            --report-page: #f3f6f3;
            --report-surface: #ffffff;
            --report-text: #16324f;
            --report-secondary: #304852;
            --report-muted: #62747b;
            --report-header: #16324f;
            --report-header-text: #ffffff;
            --report-header-muted: #e5eef4;
            --report-grid: #e6eeeb;
            --report-border: #e1e8e6;
            --report-table-heading: #eaf5f3;
            --report-shadow: 0 18px 50px rgba(18, 55, 67, .12);
            --report-accent: #087c64;
            --report-accent-text: #ffffff;
            --report-raw: #2878b5;
            --report-filtered: #d97706;
            font-family: "Segoe UI", Arial, sans-serif;
            color: var(--report-text);
            background: var(--report-page);
        }
        :root[data-theme="dark"] {
            color-scheme: dark;
            --report-page: #091115;
            --report-surface: #111c21;
            --report-text: #e8f0ee;
            --report-secondary: #b0c0bc;
            --report-muted: #91a6a1;
            --report-header: #071b23;
            --report-header-text: #f4fbf9;
            --report-header-muted: #b8cbc6;
            --report-grid: #294047;
            --report-border: #30434a;
            --report-table-heading: #162a27;
            --report-shadow: 0 18px 50px rgba(0, 0, 0, .35);
            --report-accent: #76e2be;
            --report-accent-text: #07161c;
            --report-raw: #63baf2;
            --report-filtered: #f5b95b;
        }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 40px 20px; }
        main { max-width: 1000px; margin: 0 auto; padding: 42px; background: var(--report-surface); border-radius: 18px; box-shadow: var(--report-shadow); }
        header { padding: 28px; border-radius: 12px; background: var(--report-header); color: var(--report-header-text); }
        h1 { margin: 0 0 10px; font-size: 1.6rem; }
        header p { margin: 0; color: var(--report-header-muted); }
        h2 { margin: 32px 0 14px; font-size: 1.2rem; }
        .report-chart { display: block; width: 100%; height: auto; overflow: visible; }
        .chart-grid line { stroke: var(--report-grid); stroke-width: 1; }
        .chart-grid text { fill: var(--report-muted); font-size: 12px; }
        .chart-raw, .chart-filtered { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
        .chart-raw { stroke: var(--report-raw); }
        .chart-filtered { stroke: var(--report-filtered); stroke-dasharray: 7 4; }
        .chart-axis-label { fill: var(--report-text); font-size: 13px; }
        .legend-groups { display: grid; justify-content: center; gap: 16px; margin: 12px 0 28px; color: var(--report-secondary); }
        .legend-group { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 12px; }
        .legend-group h3 { margin: 0; color: var(--report-muted); font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; }
        .legend { display: flex; flex-wrap: wrap; gap: 10px 24px; margin: 0; }
        .legend span { display: inline-flex; align-items: center; gap: 8px; }
        .legend i { display: inline-block; flex: 0 0 26px; width: 26px; height: 0; border-top: 3px solid; }
        .legend .raw-key { border-color: var(--report-raw); }
        .legend .filtered-key { border-color: var(--report-filtered); border-top-style: dashed; }
        .actions { display: flex; justify-content: flex-end; margin-bottom: 18px; }
        button { padding: 10px 16px; border: 0; border-radius: 8px; background: var(--report-header); color: var(--report-header-text); font: inherit; font-weight: 650; cursor: pointer; }
        button:hover { background: var(--report-accent); color: var(--report-accent-text); }
        button:focus-visible { outline: 3px solid var(--report-accent); outline-offset: 3px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px 14px; border-bottom: 1px solid var(--report-border); text-align: left; }
        th { background: var(--report-table-heading); }
        .phase-legend i { flex-basis: 16px; width: 16px; height: 16px; border: 2px solid; border-radius: 3px; }
        .phase-legend i.phase-p { border-color: #208b94; background: rgba(100, 203, 213, .35); }
        .phase-legend i.phase-qrs { border-color: #b94734; background: rgba(238, 116, 95, .3); }
        .phase-legend i.phase-t { border-color: #9a6810; background: rgba(242, 184, 75, .35); }
        .measurement-note { color: var(--report-muted); font-size: .9rem; }
        @media print {
            @page { margin: 0; }
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            :root,
            :root[data-theme="dark"] {
                color-scheme: light;
                --report-page: #ffffff;
                --report-surface: #ffffff;
                --report-text: #16324f;
                --report-secondary: #304852;
                --report-muted: #62747b;
                --report-header: #16324f;
                --report-header-text: #ffffff;
                --report-header-muted: #e5eef4;
                --report-grid: #e6eeeb;
                --report-border: #e1e8e6;
                --report-table-heading: #eaf5f3;
                --report-shadow: none;
                --report-accent: #087c64;
                --report-accent-text: #ffffff;
                --report-raw: #2878b5;
                --report-filtered: #d97706;
            }
            body { padding: 12mm; }
            main { max-width: none; padding: 0; border-radius: 0; box-shadow: none; }
            .actions { display: none; }
            .p-wave-measurements, .p-wave-measurements table { break-inside: avoid; page-break-inside: avoid; }
            .p-wave-measurements thead { display: table-header-group; }
            .p-wave-measurements tr { break-inside: avoid; page-break-inside: avoid; }
            .report-chart, .legend, .legend i, .phase-regions rect { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .legend-groups { break-inside: avoid; }
        }
        @media (max-width: 600px) { body { padding: 12px; } main { padding: 20px 14px; } header { padding: 20px; } .legend { gap: 14px; font-size: .88rem; } }
    </style>
</head>
<body>
    <main>
        <div class="actions"><button id="print-report" type="button">Print / Save as PDF</button></div>
        <header>
            <h1>ECG processing report</h1>
            <p>${recordName} · Butterworth band-pass filter: ${FILTER_LOW_HZ}–${FILTER_HIGH_HZ} Hz · Order ${FILTER_ORDER}</p>
        </header>
        <section aria-labelledby="comparison-title">
            <h2 id="comparison-title">Signal comparison</h2>
            ${plot}
            <div class="legend-groups">
                <div class="legend-group" aria-label="Signal legend">
                    <h3>Signals</h3>
                    <div class="legend">
                        <span><i class="raw-key"></i>Raw ECG</span>
                        <span><i class="filtered-key"></i>Filtered ECG</span>
                    </div>
                </div>
                <div class="legend-group" aria-label="ECG phase background colors">
                    <h3>Phases</h3>
                    <div class="legend phase-legend">
                        <span><i class="phase-p"></i>P wave</span>
                        <span><i class="phase-qrs"></i>QRS complex</span>
                        <span><i class="phase-t"></i>T wave</span>
                    </div>
                </div>
            </div>
        </section>
        <section aria-labelledby="parameters-title">
            <h2 id="parameters-title">Analysis parameters</h2>
            <table>
                <tbody>
                    <tr><th scope="row">Sampling rate</th><td>${record.fs} Hz</td></tr>
                    ${record.detection ? `<tr><th scope="row">Annotations</th><td>${describeAnnotations(record)}. Automatically estimated intervals are experimental and require review.</td></tr>` : ''}
                    <tr><th scope="row">Number of samples</th><td>${record.ecg.length}</td></tr>
                    <tr><th scope="row">Butterworth filter order</th><td>${FILTER_ORDER}</td></tr>
                    <tr><th scope="row">Pass band</th><td>${FILTER_LOW_HZ}–${FILTER_HIGH_HZ} Hz</td></tr>
                </tbody>
            </table>
        </section>
        <section class="p-wave-measurements" aria-labelledby="p-wave-measurements-title">
            <h2 id="p-wave-measurements-title">P-wave onset to QRS maximum peak</h2>
            <p class="measurement-note">Each annotated P wave is paired with the next annotated QRS complex. The onset is the P interval start, and the peak is the highest filtered ECG sample within that QRS interval. The distance is the elapsed time from P onset to QRS peak.</p>
            <table>
                <thead>
                    <tr><th scope="col">P → QRS</th><th scope="col">P onset</th><th scope="col">QRS peak time</th><th scope="col">Onset-to-peak</th><th scope="col">Peak amplitude</th></tr>
                </thead>
                <tbody>${pWaveRows}</tbody>
            </table>
        </section>
    </main>
</body>
</html>`;
}

function openReportPreview() {
    if (!currentRecord || !filteredSignal) {
        return;
    }

    reportPreview.srcdoc = generateReportPreview(currentRecord);
    reportDialog.showModal();
}

function getCanvasTime(event) {
    if (!currentRecord || playbackDuration <= 0) {
        return null;
    }

    const bounds = ecgCanvas.getBoundingClientRect();
    const plot = getEcgPlot(bounds.width, bounds.height);
    const canvasX = event.clientX - bounds.left;

    if (
        plot.width <= 0
        || canvasX < plot.left
        || canvasX > plot.left + plot.width
    ) {
        return null;
    }

    // Pointer coordinates are CSS pixels; the current time viewport supplies the scale.
    return canvasXToTime(canvasX, plot);
}

function handleEcgPointerMove(event) {
    if (ecgPointerGesture && event.pointerId === ecgPointerGesture.pointerId) {
        const totalDeltaX = event.clientX - ecgPointerGesture.startClientX;
        const totalDeltaY = event.clientY - ecgPointerGesture.startClientY;
        const passedThreshold = Math.hypot(totalDeltaX, totalDeltaY)
            >= PAN_MOVEMENT_THRESHOLD;

        if (!isPanning && !isScrubbing && passedThreshold) {
            ecgPointerGesture.moved = true;
            if (
                ecgPointerGesture.startedZoomed
                && Math.abs(totalDeltaX) >= Math.abs(totalDeltaY)
            ) {
                isPanning = true;
                hoveredTime = null;
                drawEcg();
            } else if (!ecgPointerGesture.startedZoomed) {
                isScrubbing = true;
                stopAnimation();
            }
        }

        if (isPanning) {
            event.preventDefault();
            const bounds = ecgCanvas.getBoundingClientRect();
            const plot = getEcgPlot(bounds.width, bounds.height);
            const deltaX = event.clientX - ecgPointerGesture.lastClientX;
            ecgPointerGesture.lastClientX = event.clientX;

            if (plot.width > 0) {
                // Dragging left reveals later time; dragging right reveals earlier time.
                panViewport(-(deltaX / plot.width) * getViewportDuration());
                updateControls();
                drawEcg();
            }
            return;
        }
    }

    if (isScrubbing) {
        updateEcgScrub(event);
        return;
    }

    hoveredTime = getCanvasTime(event);
    drawEcg();
}

function handleEcgPointerLeave() {
    if (ecgPointerGesture || isScrubbing || isPanning) {
        return;
    }

    hoveredTime = null;
    drawEcg();
}

function updateEcgScrub(event) {
    const selectedTime = getCanvasTime(event);
    if (selectedTime === null) {
        return;
    }

    currentTime = selectedTime;
    hoveredTime = selectedTime;
    updateInterface();
}

function startEcgPointerGesture(event) {
    if (event.button !== 0 || getCanvasTime(event) === null) {
        return;
    }

    ecgPointerGesture = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastClientX: event.clientX,
        moved: false,
        startedZoomed: isViewportZoomed()
    };
    ecgCanvas.setPointerCapture(event.pointerId);
}

function finishEcgPointerGesture(event) {
    if (!ecgPointerGesture || event.pointerId !== ecgPointerGesture.pointerId) {
        return;
    }

    const shouldPositionPlayback = isScrubbing
        || (!isPanning && !ecgPointerGesture.moved);
    ecgPointerGesture = null;
    isPanning = false;
    isScrubbing = false;

    if (ecgCanvas.hasPointerCapture(event.pointerId)) {
        ecgCanvas.releasePointerCapture(event.pointerId);
    }

    if (shouldPositionPlayback) {
        stopAnimation();
        updateEcgScrub(event);
        return;
    }

    hoveredTime = getCanvasTime(event);
    updateControls();
    drawEcg();
}

function cancelEcgPointerGesture() {
    ecgPointerGesture = null;
    isScrubbing = false;
    isPanning = false;
    hoveredTime = null;
    drawEcg();
}

function handleEcgWheel(event) {
    const pointerTime = getCanvasTime(event);
    if (pointerTime === null || event.deltaY === 0) {
        return;
    }

    const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? window.innerHeight
            : 1;
    const zoomFactor = Math.min(
        2,
        Math.max(
            0.5,
            Math.exp(event.deltaY * deltaScale * WHEEL_ZOOM_SENSITIVITY)
        )
    );

    if (zoomViewportAroundTime(pointerTime, zoomFactor)) {
        event.preventDefault();
        hoveredTime = pointerTime;
        updateControls();
        drawEcg();
    }
}

function zoomViewportFromCenter(factor) {
    const viewportCenter = viewportStartTime + getViewportDuration() / 2;
    if (zoomViewportAroundTime(viewportCenter, factor)) {
        hoveredTime = null;
        updateControls();
        drawEcg();
    }
}

function resetEcgViewport() {
    resetViewport();
    updateControls();
    drawEcg();
}

function showGuidePage(pageName) {
    guidePageButtons.forEach((button) => {
        const isActive = button.dataset.guidePage === pageName;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });

    guidePages.forEach((page) => {
        page.hidden = page.id !== `guide-page-${pageName}`;
    });
}

function getPWavePeakMeasurements(record, signal) {
    const pIntervals = record.intervals && Array.isArray(record.intervals.P)
        ? record.intervals.P
        : [];
    const qrsIntervals = record.intervals && Array.isArray(record.intervals.QRS)
        ? record.intervals.QRS
        : [];

    return pIntervals.flatMap((interval, intervalIndex) => {
        if (
            !Array.isArray(interval)
            || interval.length !== 2
            || !interval.every(Number.isFinite)
            || interval[1] < interval[0]
            || !Number.isFinite(record.fs)
            || record.fs <= 0
            || !Array.isArray(signal)
        ) {
            return [];
        }

        const start = Math.max(0, interval[0]);
        const qrsIndex = qrsIntervals.findIndex((qrsInterval) => (
            Array.isArray(qrsInterval)
            && qrsInterval.length === 2
            && qrsInterval.every(Number.isFinite)
            && qrsInterval[1] >= qrsInterval[0]
            && qrsInterval[0] >= start
        ));

        if (qrsIndex === -1) {
            return [];
        }

        const qrsInterval = qrsIntervals[qrsIndex];
        const qrsStart = Math.max(0, qrsInterval[0]);
        const qrsEnd = Math.min(qrsInterval[1], signal.length / record.fs);
        const firstSample = Math.ceil(qrsStart * record.fs);
        const lastSample = Math.min(
            signal.length - 1,
            Math.floor(qrsEnd * record.fs)
        );

        if (qrsEnd < qrsStart || firstSample > lastSample) {
            return [];
        }

        let peakSampleIndex = -1;
        let peakAmplitude = -Infinity;

        for (let sampleIndex = firstSample; sampleIndex <= lastSample; sampleIndex += 1) {
            const amplitude = Number(signal[sampleIndex]);
            if (Number.isFinite(amplitude) && amplitude > peakAmplitude) {
                peakSampleIndex = sampleIndex;
                peakAmplitude = amplitude;
            }
        }

        if (peakSampleIndex === -1) {
            return [];
        }

        const peakTime = peakSampleIndex / record.fs;

        return [{
            number: intervalIndex + 1,
            qrsNumber: qrsIndex + 1,
            onset: start,
            peakTime,
            delay: peakTime - start,
            amplitude: peakAmplitude
        }];
    });
}

async function fetchJson(path) {

    const response = await fetch(path);



    if (!response.ok) {

        throw new Error(`HTTP error ${response.status}`);

    }



    return response.json();

}



function describeAnnotations(record) {
    const detection = record.detection;
    const estimated = Array.isArray(detection?.estimatedPhases)
        ? detection.estimatedPhases : [];
    return ["P", "QRS", "T"].map(phase => {
        const isEstimated = estimated.includes(phase)
            || (phase === "QRS" && detection?.estimatedQrsBounds === true);
        return `${record.intervals[phase].length} ${phase} ${isEstimated ? "estimated" : "provided"}`;
    }).join(", ");
}

function activateRecord(record, isLocal = false) {
    if (!Array.isArray(record.ecg) || !record.ecg.every(Number.isFinite)
        || !Number.isFinite(record.fs) || record.fs <= 0) {
        throw new Error("Invalid ECG format");
    }
    const nextFiltered = filterEcg(record.ecg, record.fs);
    const nextProfile = buildQrsAmplitudeProfile(record, nextFiltered);
    const range = calculateSignalRange(record.ecg.concat(nextFiltered));
    if (!isLocal) {
        // Keep the usual scale, expanding it only when a record would be clipped.
        range.minimum = Math.min(ECG_Y_MINIMUM, range.minimum);
        range.maximum = Math.max(ECG_Y_MAXIMUM, range.maximum);
    }
    stopAnimation();
    currentRecord = record;
    filteredSignal = nextFiltered;
    qrsAmplitudeProfile = nextProfile;
    showingFilteredSignal = false;
    playbackDuration = record.ecg.length / record.fs;
    resetViewport();
    signalMinimum = range.minimum;
    signalMaximum = range.maximum;
    currentTime = 0;
    hoveredTime = null;
    isScrubbing = false;
    loadError = null;
    ecgSourceLabel.textContent = isLocal ? "Local ECG" : "LUDB Data";
    importStatus.hidden = !isLocal;
    if (isLocal) {
        importStatus.textContent = `Local ECG: ${describeAnnotations(record)}. `
            + (record.detection ? "Automatic estimates are experimental; review the intervals. " : "")
            + "Data is kept only for this session.";
    }
}

async function loadRecord(recordId) {
    const requestId = ++recordLoadRequestId;
    stopAnimation();
    currentTime = 0;
    currentRecord = null;
    filteredSignal = null;
    qrsAmplitudeProfile = [];
    showingFilteredSignal = false;
    playbackDuration = 0;
    resetViewport();
    ecgSourceLabel.textContent = "ECG";
    importStatus.hidden = true;

    loadError = null;
    isLoading = true;
    updateInterface();
    try {
        const local = localRecords.get(String(recordId));
        const record = local || await fetchJson(`data/ludb/records/record-${recordId}.json`);
        if (requestId !== recordLoadRequestId) return;
        activateRecord(record, Boolean(local));
    } catch (error) {
        if (requestId !== recordLoadRequestId) return;
        loadError = `Unable to load record ${recordId}.`;
        console.error(error);
    } finally {
        if (requestId === recordLoadRequestId) {
            isLoading = false;
            updateInterface();
        }
    }
}

function stepRecord(direction) {
    if (isLoading) return;
    const index = recordSelect.selectedIndex + direction;
    if (index < 0 || index >= recordSelect.options.length) return;
    recordSelect.selectedIndex = index;
    loadRecord(recordSelect.value);
}

let importPreviewId = 0;
async function updateImportFields() {
    const previewId = ++importPreviewId;
    const json = /\.json$/i.test(importFileInput.files[0]?.name || "");
    const options = document.getElementById("csv-import-options");
    options.hidden = json;
    options.querySelectorAll("input, select").forEach(input => { input.disabled = json; });
    importError.hidden = true;
    const summary = document.getElementById("csv-file-summary");
    summary.hidden = true;
    const file = importFileInput.files[0];
    if (json || !file || file.size > 10 * 1024 * 1024) return;
    try {
        const separator = document.getElementById("ecg-import-delimiter").value;
        const info = ECGLocalImport.inspectCsv(await file.text(), {
            delimiter: separator === "tab" ? "\t" : separator,
            skipHeader: document.getElementById("ecg-import-header").checked
        });
        if (previewId !== importPreviewId) return;
        summary.textContent = `${info.rows.toLocaleString("en-US")} rows × ${info.columns} columns${info.consistentColumns ? "" : " (uneven rows)"}. One column is read from top to bottom as consecutive samples. `
            + (info.columns > 16 ? "If each row is a separate recording, export one recording as a single column first. " : "")
            + "Use the sampling rate from the source; it cannot be inferred from these values.";
        summary.hidden = false;
    } catch (error) {
        if (previewId !== importPreviewId) return;
        summary.textContent = error.message;
        summary.hidden = false;
    }
}

async function importLocalEcg(event) {
    event.preventDefault();
    if (isImporting) return;
    const file = importFileInput.files[0];
    if (!file) return;
    const submit = document.getElementById("submit-ecg-import");
    isImporting = true;
    submit.disabled = true;
    submit.textContent = "Loading...";
    importError.hidden = true;
    updateControls();
    try {
        if (file.size > 10 * 1024 * 1024) throw new Error("Choose a file smaller than 10 MB.");
        const text = await file.text();
        if (!importDialog.open) return;
        const separator = document.getElementById("ecg-import-delimiter").value;
        const record = ECGLocalImport.parseRecord(text, file.name, {
            fs: Number(document.getElementById("ecg-import-fs").value),
            column: Number(document.getElementById("ecg-import-column").value) - 1,
            delimiter: separator === "tab" ? "\t" : separator,
            skipHeader: document.getElementById("ecg-import-header").checked
        });
        // Validate/filter before changing the selection, so failed imports keep the current ECG.
        activateRecord(record, true);
        recordLoadRequestId++;
        isLoading = false;
        const id = `local-${++localRecordCount}`;
        localRecords.set(id, record);
        const option = document.createElement("option");
        option.value = id;
        option.textContent = `${record.label} (local)`;
        recordSelect.appendChild(option);
        recordSelect.value = id;
        importDialog.close();
        updateInterface();
    } catch (error) {
        importError.textContent = error instanceof SyntaxError
            ? "The JSON file is not valid JSON." : error.message;
        importError.hidden = false;
    } finally {
        isImporting = false;
        submit.disabled = false;
        submit.textContent = "Load ECG";
        updateControls();
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
        recordSelect.replaceChildren();

        console.error(error);

        updateInterface();

    }

}



previousRecordButton.addEventListener("click", () => stepRecord(-1));
nextRecordButton.addEventListener("click", () => stepRecord(1));
importEcgButton.addEventListener("click", () => { updateImportFields(); importDialog.showModal(); });
document.getElementById("close-import-ecg").addEventListener("click", () => importDialog.close());
importDialog.addEventListener("click", event => { if (event.target === importDialog) importDialog.close(); });
importFileInput.addEventListener("change", updateImportFields);
document.getElementById("ecg-import-delimiter").addEventListener("change", updateImportFields);
document.getElementById("ecg-import-header").addEventListener("change", updateImportFields);
importForm.addEventListener("submit", importLocalEcg);

playButton.addEventListener("click", playPlayback);
pauseButton.addEventListener("click", pausePlayback);
signalOptionsButton.addEventListener("click", () => {
    signalOptions.hidden = !signalOptions.hidden;
    signalOptionsButton.setAttribute("aria-expanded", String(!signalOptions.hidden));
});

restartButton.addEventListener("click", restartPlayback);
switchSignalButton.addEventListener("click", () => {
    if (!currentRecord) {
        return;
    }

    showingFilteredSignal = !showingFilteredSignal;
    updateInterface();
});
viewReportButton.addEventListener("click", openReportPreview);
reportPreview.addEventListener("load", () => {
    const printButton = reportPreview.contentDocument.getElementById("print-report");
    if (printButton) {
        printButton.addEventListener("click", () => reportPreview.contentWindow.print());
    }
});
closeReportButton.addEventListener("click", () => reportDialog.close());
reportDialog.addEventListener("click", (event) => {
    if (event.target === reportDialog) {
        reportDialog.close();
    }
});
userGuideButton.addEventListener("click", () => {
    showGuidePage("use");
    guideDialog.showModal();
});
closeGuideButton.addEventListener("click", () => guideDialog.close());
guideDialog.addEventListener("click", (event) => {
    if (event.target === guideDialog) {
        guideDialog.close();
    }
});
guidePageButtons.forEach((button) => {
    button.addEventListener("click", () => {
        showGuidePage(button.dataset.guidePage);
    });
});
ecgCanvas.addEventListener("pointerdown", startEcgPointerGesture);
ecgCanvas.addEventListener("pointermove", handleEcgPointerMove);
ecgCanvas.addEventListener("pointerleave", handleEcgPointerLeave);
ecgCanvas.addEventListener("pointerup", finishEcgPointerGesture);
ecgCanvas.addEventListener("pointercancel", cancelEcgPointerGesture);
ecgCanvas.addEventListener("lostpointercapture", () => {
    if (ecgPointerGesture) {
        cancelEcgPointerGesture();
    }
});
ecgCanvas.addEventListener("wheel", handleEcgWheel, {passive: false});
zoomInButton.addEventListener("click", () => {
    zoomViewportFromCenter(BUTTON_ZOOM_FACTOR);
});
zoomOutButton.addEventListener("click", () => {
    zoomViewportFromCenter(1 / BUTTON_ZOOM_FACTOR);
});
resetZoomButton.addEventListener("click", resetEcgViewport);
recordSelect.addEventListener("change", () => loadRecord(recordSelect.value));

speedSelect.addEventListener("change", changePlaybackSpeed);

window.addEventListener("resize", drawEcg);

document.addEventListener("visibilitychange", () => {

    // Safari pauses requestAnimationFrame in background tabs. Start with a

    // fresh frame timestamp when the page becomes active again.

    lastTimestamp = null;

});




const THEME_STORAGE_KEY = "ecg-heart-theme";
const themeToggle = document.getElementById("theme-toggle");
const systemDarkMode = window.matchMedia("(prefers-color-scheme: dark)");

function getSavedTheme() {
    try {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        return savedTheme === "dark" || savedTheme === "light"
            ? savedTheme
            : null;
    } catch {
        return null;
    }
}

function saveTheme(theme) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // localStorage may be unavailable in private/restricted contexts.
    }
}

function getInitialTheme() {
    const savedTheme = getSavedTheme();
    return savedTheme || (systemDarkMode.matches ? "dark" : "light");
}

function applyTheme(theme, persist = false) {
    const darkMode = theme === "dark";

    document.documentElement.dataset.theme = darkMode
        ? "dark"
        : "light";

    if (themeToggle) {
        themeToggle.setAttribute("aria-pressed", String(darkMode));
        themeToggle.setAttribute(
            "aria-label",
            darkMode
                ? "Switch to light mode"
                : "Switch to dark mode"
        );

        const icon = themeToggle.querySelector(".theme-toggle__icon");
        const label = themeToggle.querySelector(".theme-toggle__label");

        if (icon) {
            icon.textContent = darkMode ? "☀️" : "🌙";
        }

        if (label) {
            label.textContent = darkMode
                ? "Light mode"
                : "Dark mode";
        }
    }

    if (persist) {
        saveTheme(darkMode ? "dark" : "light");
    }

    drawEcg();
}

if (themeToggle) {
    themeToggle.addEventListener("click", () => {
        const currentTheme = document.documentElement.dataset.theme;

        applyTheme(
            currentTheme === "dark" ? "light" : "dark",
            true
        );
    });
}

systemDarkMode.addEventListener("change", (event) => {
    if (getSavedTheme() === null) {
        applyTheme(event.matches ? "dark" : "light");
    }
});

applyTheme(getInitialTheme());


initializeRecords();
