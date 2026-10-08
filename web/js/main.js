const ecgCanvas = document.getElementById("ecg-canvas");
const ecgContext = ecgCanvas.getContext("2d");

const playButton = document.getElementById("play-button");
const pauseButton = document.getElementById("pause-button");
const restartButton = document.getElementById("restart-button");
const recordSelect = document.getElementById("record-select");
const speedSelect = document.getElementById("speed-select");
const switchSignalButton = document.getElementById("switch-signal-button");
const downloadReportButton = document.getElementById("download-report-button");
const timeDisplay = document.getElementById("time-display");
const phaseDisplay = document.getElementById("phase-display");
const phaseCode = document.getElementById("phase-code");
const phaseDescription = document.getElementById("phase-description");
const heartContainer = document.getElementById("heart-container");

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

    const signalName = showingFilteredSignal ? "Filtered ECG" : "Raw ECG";
    traceSignal(ecgContext, plot, "#b9c9c5", 1.3);

    const progress = Math.min(currentTime / playbackDuration, 1);
    const currentSampleIndex = getCurrentSampleIndex();

    if (progress > 0) {
        const cursorX = plot.left + progress * plot.width;

        traceSignal(
            ecgContext,
            plot,
            "#087c78",
            2.2,
            currentSampleIndex
        );

        ecgContext.strokeStyle = "rgba(8, 124, 120, 0.42)";
        ecgContext.lineWidth = 1;
        ecgContext.beginPath();
        ecgContext.moveTo(cursorX, plot.top);
        ecgContext.lineTo(cursorX, plot.top + plot.height);
        ecgContext.stroke();

        ecgContext.fillStyle = "#087c78";
        ecgContext.beginPath();
        ecgContext.arc(cursorX, plot.top, 4, 0, Math.PI * 2);
        ecgContext.fill();
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
    const seconds = (time % 60).toFixed(1).padStart(4, "0");

    return `${minutes}:${seconds}`;
}

function updateControls() {
    const recordUnavailable = isLoading || currentRecord === null;

    recordSelect.disabled = isLoading;
    playButton.disabled = recordUnavailable || isPlaying;
    pauseButton.disabled = recordUnavailable || !isPlaying;
    restartButton.disabled = recordUnavailable;
    switchSignalButton.disabled = recordUnavailable;
    downloadReportButton.disabled = recordUnavailable;
    switchSignalButton.textContent = showingFilteredSignal
        ? "Show raw ECG"
        : "Show filtered ECG";
    switchSignalButton.setAttribute(
        "aria-pressed",
        String(showingFilteredSignal)
    );
}

function updateInterface() {
    const phase = getPhase(currentTime);

    timeDisplay.textContent = formatTime(currentTime);
    phaseDisplay.textContent = phase.name;
    phaseCode.textContent = phase.code;
    phaseCode.dataset.phase = phase.key;
    phaseDescription.textContent = phase.description;
    heartContainer.dataset.phase = phase.key;

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

function escapeLatex(value) {
    const replacements = {
        "\\": String.raw`\textbackslash{}`,
        "&": String.raw`\&`,
        "%": String.raw`\%`,
        "$": String.raw`\$`,
        "#": String.raw`\#`,
        "_": String.raw`\_`,
        "{": String.raw`\{`,
        "}": String.raw`\}`,
        "~": String.raw`\textasciitilde{}`,
        "^": String.raw`\textasciicircum{}`
    };
    return String(value).replace(/[\\&%$#_{}~^]/g, (character) => replacements[character]);
}

function formatPlotCoordinates(signal, samplingRate) {
    const maximumPoints = 2500;
    const stride = Math.max(1, Math.ceil(signal.length / maximumPoints));
    const coordinates = [];

    for (let index = 0; index < signal.length; index += stride) {
        coordinates.push(`(${(index / samplingRate).toFixed(4)},${signal[index].toFixed(6)})`);
    }

    const finalIndex = signal.length - 1;
    if (finalIndex % stride !== 0) {
        coordinates.push(`(${(finalIndex / samplingRate).toFixed(4)},${signal[finalIndex].toFixed(6)})`);
    }

    return coordinates.join(" ");
}

function generateLatexReport(record) {
    const recordName = escapeLatex(record.label || `Record ${recordSelect.value}`);
    const rawCoordinates = formatPlotCoordinates(record.ecg, record.fs);
    const filteredCoordinates = formatPlotCoordinates(filteredSignal, record.fs);

    return String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[french]{babel}
\usepackage[margin=2.2cm]{geometry}
\usepackage[table]{xcolor}
\usepackage{booktabs}
\usepackage{pgfplots}
\usepackage{lmodern}
\pgfplotsset{compat=1.18}
\definecolor{HeartTeal}{HTML}{087C78}
\definecolor{HeartNavy}{HTML}{16324F}
\definecolor{HeartCoral}{HTML}{EF6A55}
\definecolor{SoftMint}{HTML}{EAF5F3}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0.7em}
\begin{document}
\begin{center}
\colorbox{HeartNavy}{\parbox{0.92\linewidth}{\centering
\vspace{0.45cm}{\color{white}\Large\bfseries RAPPORT DE TRAITEMENT ECG}\\[0.2cm]
{\color{white}\LARGE\bfseries ${recordName}}\\[0.2cm]
{\color{white!80}\large Filtre Butterworth passe-bande
{\color{HeartCoral}\bfseries ${FILTER_LOW_HZ}--${FILTER_HIGH_HZ} Hz}
\quad|\quad ordre ${FILTER_ORDER}}\vspace{0.45cm}}}
\end{center}
\section*{\textcolor{HeartNavy}{Comparaison du signal}}
\begin{center}
\begin{tikzpicture}
\begin{axis}[
    width=\linewidth,
    height=8cm,
    grid=major,
    grid style={draw=SoftMint},
    xlabel={Temps (s)},
    ylabel={Amplitude},
    axis line style={HeartNavy},
    tick label style={font=\small},
    label style={font=\small},
    legend style={at={(0.5,-0.2)},anchor=north,legend columns=2,draw=none},
    line width=0.8pt
]
\addplot[color=HeartCoral,opacity=0.72] coordinates { ${rawCoordinates} };
\addlegendentry{ECG brut}
\addplot[color=HeartTeal] coordinates { ${filteredCoordinates} };
\addlegendentry{ECG filtré}
\end{axis}
\end{tikzpicture}
\end{center}
\section*{\textcolor{HeartNavy}{Paramètres de l'analyse}}
\rowcolors{2}{SoftMint}{white}
\begin{tabular}{lr}
\rowcolor{SoftMint}\textbf{Métrique} & \textbf{Valeur}\\
Fréquence d'échantillonnage & ${record.fs} Hz\\
Nombre d'échantillons & ${record.ecg.length}\\
Ordre du filtre Butterworth & ${FILTER_ORDER}\\
Bande passante & ${FILTER_LOW_HZ}--${FILTER_HIGH_HZ} Hz\\
\bottomrule
\end{tabular}
\vfill
{\small\color{HeartNavy}Rapport généré localement à partir des données statiques
de l'enregistrement. Aucun serveur dynamique n'est nécessaire.}
\end{document}
`;
}

function downloadLatexReport() {
    if (!currentRecord || !filteredSignal) {
        return;
    }

    const report = generateLatexReport(currentRecord);
    const blob = new Blob([report], {type: "application/x-tex;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `record-${recordSelect.value}-report.tex`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
downloadReportButton.addEventListener("click", downloadLatexReport);
recordSelect.addEventListener("change", () => loadRecord(recordSelect.value));
speedSelect.addEventListener("change", changePlaybackSpeed);
window.addEventListener("resize", drawEcg);
document.addEventListener("visibilitychange", () => {
    // Safari pauses requestAnimationFrame in background tabs. Start with a
    // fresh frame timestamp when the page becomes active again.
    lastTimestamp = null;
});

initializeRecords();
