const ecgCanvas = document.getElementById("ecg-canvas");

const ecgContext = ecgCanvas.getContext("2d");



const playButton = document.getElementById("play-button");

const pauseButton = document.getElementById("pause-button");

const restartButton = document.getElementById("restart-button");
const recordSelect = document.getElementById("record-select");
const speedSelect = document.getElementById("speed-select");
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

const phaseDisplay = document.getElementById("phase-display");

const phaseCode = document.getElementById("phase-code");

const phaseDescription = document.getElementById("phase-description");

const heartContainer = document.getElementById("heart-container");

const HEART_SYNC_EVENT = "ecg-heart-sync";
const FILTER_LOW_HZ = 0.5;
const FILTER_HIGH_HZ = 40;
const FILTER_ORDER = 4;

let currentRecord = null;
let filteredSignal = null;
let showingFilteredSignal = false;
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
let hoveredTime = null;
let isScrubbing = false;



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

function drawPhaseRegions(context, plot, duration) {
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

            const start = Math.max(0, interval[0]);
            const end = Math.min(duration, interval[1]);
            if (end <= start) {
                continue;
            }

            const x = plot.left + (start / duration) * plot.width;
            const width = ((end - start) / duration) * plot.width;
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

    drawPhaseRegions(ecgContext, plot, playbackDuration);

    const signalName = showingFilteredSignal ? "Filtered ECG" : "Raw ECG";
    const signalColor = showingFilteredSignal ? "#d97706" : "#087c64";
    const backgroundSignalColor = showingFilteredSignal
        ? "rgba(217, 119, 6, 0.42)"
        : "#b9c9c5";
    traceSignal(ecgContext, plot, backgroundSignalColor, 1.3);



    const currentSampleIndex = getCurrentSampleIndex();
    const progress = Math.min(currentTime / playbackDuration, 1);
    const cursorX = plot.left + progress * plot.width;
    const selectedSignal = getDisplayedSignal();
    const selectedValue = Number(selectedSignal[currentSampleIndex]);
    const amplitudeRange = signalMaximum - signalMinimum || 1;
    const cursorY = plot.top + (
        1 - (selectedValue - signalMinimum) / amplitudeRange
    ) * plot.height;

    traceSignal(
        ecgContext,
        plot,
        signalColor,
        2.2,
        currentSampleIndex
    );

    ecgContext.strokeStyle = showingFilteredSignal
        ? "rgba(217, 119, 6, 0.42)"
        : "rgba(8, 124, 100, 0.42)";
    ecgContext.lineWidth = 1;
    ecgContext.beginPath();
    ecgContext.moveTo(cursorX, plot.top);
    ecgContext.lineTo(cursorX, plot.top + plot.height);
    ecgContext.stroke();

    ecgContext.fillStyle = signalColor;
    ecgContext.beginPath();
    ecgContext.arc(cursorX, cursorY, 4, 0, Math.PI * 2);
    ecgContext.fill();

    if (hoveredTime !== null) {
        const hoverSampleIndex = Math.min(
            Math.floor(hoveredTime * currentRecord.fs),
            selectedSignal.length - 1
        );
        const hoverValue = Number(selectedSignal[hoverSampleIndex]);
        const hoverX = plot.left + (hoveredTime / playbackDuration) * plot.width;
        const hoverY = plot.top + (
            1 - (hoverValue - signalMinimum) / amplitudeRange
        ) * plot.height;

        ecgContext.strokeStyle = "rgba(19, 37, 46, 0.55)";
        ecgContext.setLineDash([4, 4]);
        ecgContext.beginPath();
        ecgContext.moveTo(hoverX, plot.top);
        ecgContext.lineTo(hoverX, plot.top + plot.height);
        ecgContext.stroke();
        ecgContext.setLineDash([]);

        if (Number.isFinite(hoverValue)) {
            ecgContext.fillStyle = "#13252e";
            ecgContext.beginPath();
            ecgContext.arc(hoverX, hoverY, 4, 0, Math.PI * 2);
            ecgContext.fill();
        }
    }

    ecgCanvas.setAttribute(
        "aria-label",
        `${signalName} for ${currentRecord.label}, duration ${playbackDuration.toFixed(1)} seconds.`
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

    playButton.disabled = recordUnavailable || isPlaying;

    pauseButton.disabled = recordUnavailable || !isPlaying;

    restartButton.disabled = recordUnavailable;
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
    extended.push(...signal);
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
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ECG report - ${recordName}</title>
    <style>
        :root { color-scheme: light; font-family: "Segoe UI", Arial, sans-serif; color: #16324f; background: #f3f6f3; }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 40px 20px; }
        main { max-width: 1000px; margin: 0 auto; padding: 42px; background: #fff; border-radius: 18px; box-shadow: 0 18px 50px rgba(18, 55, 67, .12); }
        header { padding: 28px; border-radius: 12px; background: #16324f; color: #fff; }
        h1 { margin: 0 0 10px; font-size: 1.6rem; }
        header p { margin: 0; color: #e5eef4; }
        h2 { margin: 32px 0 14px; font-size: 1.2rem; }
        .report-chart { display: block; width: 100%; height: auto; overflow: visible; }
        .chart-grid line { stroke: #e6eeeb; stroke-width: 1; }
        .chart-grid text { fill: #62747b; font-size: 12px; }
        .chart-raw, .chart-filtered { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
        .chart-raw { stroke: #2878b5; }
        .chart-filtered { stroke: #d97706; stroke-dasharray: 7 4; }
        .chart-axis-label { fill: #16324f; font-size: 13px; }
        .legend-groups { display: grid; justify-content: center; gap: 16px; margin: 12px 0 28px; color: #304852; }
        .legend-group { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 12px; }
        .legend-group h3 { margin: 0; color: #62747b; font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; }
        .legend { display: flex; flex-wrap: wrap; gap: 10px 24px; margin: 0; }
        .legend span { display: inline-flex; align-items: center; gap: 8px; }
        .legend i { display: inline-block; flex: 0 0 26px; width: 26px; height: 0; border-top: 3px solid; }
        .legend .raw-key { border-color: #2878b5; }
        .legend .filtered-key { border-color: #d97706; border-top-style: dashed; }
        .actions { display: flex; justify-content: flex-end; margin-bottom: 18px; }
        button { padding: 10px 16px; border: 0; border-radius: 8px; background: #16324f; color: white; font: inherit; font-weight: 650; cursor: pointer; }
        button:hover { background: #087c64; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px 14px; border-bottom: 1px solid #e1e8e6; text-align: left; }
        th { background: #eaf5f3; }
        .phase-legend i { flex-basis: 16px; width: 16px; height: 16px; border: 2px solid; border-radius: 3px; }
        .phase-legend i.phase-p { border-color: #208b94; background: rgba(100, 203, 213, .35); }
        .phase-legend i.phase-qrs { border-color: #b94734; background: rgba(238, 116, 95, .3); }
        .phase-legend i.phase-t { border-color: #9a6810; background: rgba(242, 184, 75, .35); }
        .measurement-note { color: #62747b; font-size: .9rem; }
        @media print {
            @page { margin: 0; }
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            :root { background: #fff; }
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
    const plotLeft = 28;
    const plotWidth = bounds.width - 56;
    const canvasX = event.clientX - bounds.left;

    if (plotWidth <= 0 || canvasX < plotLeft || canvasX > plotLeft + plotWidth) {
        return null;
    }

    return ((canvasX - plotLeft) / plotWidth) * playbackDuration;
}

function handleEcgPointerMove(event) {
    if (isScrubbing) {
        updateEcgScrub(event);
        return;
    }

    hoveredTime = getCanvasTime(event);
    drawEcg();
}

function handleEcgPointerLeave() {
    if (isScrubbing) {
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

function startEcgScrub(event) {
    if (event.button !== 0 || getCanvasTime(event) === null) {
        return;
    }

    isScrubbing = true;
    stopAnimation();
    ecgCanvas.setPointerCapture(event.pointerId);
    updateEcgScrub(event);
}

function finishEcgScrub(event) {
    if (!isScrubbing) {
        return;
    }

    updateEcgScrub(event);
    isScrubbing = false;

    if (ecgCanvas.hasPointerCapture(event.pointerId)) {
        ecgCanvas.releasePointerCapture(event.pointerId);
    }
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



async function loadRecord(recordId) {

    stopAnimation();

    currentTime = 0;

    currentRecord = null;
    filteredSignal = null;
    showingFilteredSignal = false;
    playbackDuration = 0;

    loadError = null;

    isLoading = true;

    updateInterface();



    try {

        const record = await fetchJson(`data/ludb/records/record-${recordId}.json`);



        if (!Array.isArray(record.ecg) || !Number.isFinite(record.fs) || record.fs <= 0) {

            throw new Error("Invalid ECG format");

        }

        const recordFilteredSignal = filterEcg(record.ecg, record.fs);
        currentRecord = record;
        filteredSignal = recordFilteredSignal;
        playbackDuration = record.ecg.length / record.fs;

        const range = calculateSignalRange(getDisplayedSignal());
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
switchSignalButton.addEventListener("click", () => {
    if (!currentRecord) {
        return;
    }

    showingFilteredSignal = !showingFilteredSignal;
    const range = calculateSignalRange(getDisplayedSignal());
    signalMinimum = range.minimum;
    signalMaximum = range.maximum;
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
ecgCanvas.addEventListener("pointerdown", startEcgScrub);
ecgCanvas.addEventListener("pointermove", handleEcgPointerMove);
ecgCanvas.addEventListener("pointerleave", handleEcgPointerLeave);
ecgCanvas.addEventListener("pointerup", finishEcgScrub);
ecgCanvas.addEventListener("pointercancel", () => {
    isScrubbing = false;
    hoveredTime = null;
    drawEcg();
});
ecgCanvas.addEventListener("lostpointercapture", () => {
    isScrubbing = false;
});
recordSelect.addEventListener("change", () => loadRecord(recordSelect.value));

speedSelect.addEventListener("change", changePlaybackSpeed);

window.addEventListener("resize", drawEcg);

document.addEventListener("visibilitychange", () => {

    // Safari pauses requestAnimationFrame in background tabs. Start with a

    // fresh frame timestamp when the page becomes active again.

    lastTimestamp = null;

});



initializeRecords();
