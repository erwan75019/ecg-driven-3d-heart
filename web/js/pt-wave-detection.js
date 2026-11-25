/* Experimental single-lead P/T delineation. QRS intervals delimit search
 * regions; accepted wave boundaries come from the detrended signal itself.
 * This heuristic has no clinical validation. See README for evaluation.
 */
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.ECGPT = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const PARAMETERS = {
        smoothingSeconds: 0.02,
        baselineEdgeSeconds: 0.025,
        noiseMultiplier: 5,
        boundaryFraction: 0.15,
        ambiguityRatio: 0.65,
        ambiguitySeparationSeconds: 0.04,
        interbeatSplitFraction: 0.65,
        P: {lookbackSeconds: 0.35, rrFraction: 0.45, guardSeconds: 0.005,
            baselineEdgeSeconds: 0.012, boundaryGuardSeconds: 0.004,
            minimumWidthSeconds: 0.04, maximumWidthSeconds: 0.18, qrsFraction: 0.025},
        T: {lookaheadSeconds: 0.5, rrFraction: 0.65, guardSeconds: 0.04,
            minimumWidthSeconds: 0.08, maximumWidthSeconds: 0.38, qrsFraction: 0.04}
    };

    function median(values) {
        if (!values.length) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }

    function smooth(signal, radius) {
        const prefix = [0];
        for (const value of signal) prefix.push(prefix[prefix.length - 1] + value);
        return signal.map((_, i) => {
            const start = Math.max(0, i - radius);
            const end = Math.min(signal.length, i + radius + 1);
            return (prefix[end] - prefix[start]) / (end - start);
        });
    }

    function noiseScale(values) {
        const center = median(values);
        return 1.4826 * median(values.map(value => Math.abs(value - center)));
    }

    function delineateWindow(signal, residual, fs, startTime, endTime, qrsAmplitude, noise, config) {
        const start = Math.ceil(startTime * fs);
        const end = Math.floor(endTime * fs);
        const edge = Math.max(2, Math.round((config.baselineEdgeSeconds ?? PARAMETERS.baselineEdgeSeconds) * fs));
        // Baseline samples and the safety margin around a detected crossing
        // serve different purposes. Sharing 25 ms excluded otherwise valid P waves.
        const boundaryGuard = Math.max(1, Math.round(
            (config.boundaryGuardSeconds ?? PARAMETERS.baselineEdgeSeconds) * fs));
        if (end - start < 2 * edge + config.minimumWidthSeconds * fs) return null;

        // The chord between the two edge medians removes local baseline drift.
        const leftLevel = median(signal.slice(start, start + edge));
        const rightLevel = median(signal.slice(end - edge + 1, end + 1));
        const values = signal.slice(start, end + 1).map((value, i) =>
            value - leftLevel - (rightLevel - leftLevel) * i / (end - start));
        const envelope = values.map(Math.abs);
        const localNoise = Math.max(noise, noiseScale(residual.slice(start, end + 1)), 1e-10);
        const minimumAmplitude = Math.max(
            PARAMETERS.noiseMultiplier * localNoise,
            config.qrsFraction * qrsAmplitude,
            1e-8
        );
        const peaks = [];
        for (let i = edge; i < values.length - edge; i++) {
            if (envelope[i] >= minimumAmplitude && envelope[i] > envelope[i - 1]
                && envelope[i] >= envelope[i + 1]) peaks.push(i);
        }
        peaks.sort((a, b) => envelope[b] - envelope[a]);
        if (!peaks.length) return null;
        const peak = peaks[0];
        if (peaks.some(i => Math.abs(i - peak) >= PARAMETERS.ambiguitySeparationSeconds * fs
            && envelope[i] >= PARAMETERS.ambiguityRatio * envelope[peak])) return null;

        const polarity = Math.sign(values[peak]);
        const threshold = Math.max(PARAMETERS.boundaryFraction * envelope[peak], 2 * localNoise);
        let onset = peak;
        let offset = peak;
        while (onset > 0 && polarity * values[onset] > threshold) onset--;
        while (offset < values.length - 1 && polarity * values[offset] > threshold) offset++;
        const width = (offset - onset) / fs;
        // Truncated waves and narrow noise spikes are left unannotated.
        if (onset < boundaryGuard || offset >= values.length - boundaryGuard
            || width < config.minimumWidthSeconds || width > config.maximumWidthSeconds) return null;

        return {start: (start + onset) / fs, end: (start + offset) / fs,
            peak: (start + peak) / fs, polarity, signalToNoiseRatio: envelope[peak] / localNoise};
    }

    function detectPt(signal, fs, qrsIntervals) {
        if (!Array.isArray(signal) || signal.length < 28 || !signal.every(Number.isFinite)
            || !Number.isFinite(fs) || fs <= 80 || fs > 10000) {
            throw new Error("P/T detection needs finite samples and a sampling rate above 80 Hz and at most 10,000 Hz.");
        }
        const duration = signal.length / fs;
        if (!Array.isArray(qrsIntervals) || qrsIntervals.some((pair, i) =>
            !Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite)
            || pair[0] < 0 || pair[1] <= pair[0] || pair[1] > duration
            || (i > 0 && pair[0] < qrsIntervals[i - 1][1]))) {
            throw new Error("P/T detection needs ordered, non-overlapping QRS intervals in seconds.");
        }
        const result = {method: "QRS-anchored P/T morphology heuristic (experimental)",
            parameters: JSON.parse(JSON.stringify(PARAMETERS)), intervals: {P: [], T: []},
            waves: {P: [], T: []}};
        if (!qrsIntervals.length) return result;
        const baseline = median(signal);
        let magnitude = 0;
        for (const value of signal) magnitude = Math.max(magnitude, Math.abs(value - baseline));
        if (magnitude === 0) return result;
        const normalized = signal.map(value => (value - baseline) / magnitude);
        const radius = Math.max(1, Math.round(PARAMETERS.smoothingSeconds * fs / 2));
        const filtered = smooth(smooth(normalized, radius), radius);
        const residual = normalized.map((value, i) => value - filtered[i]);
        const noiseSamples = [];
        let qrsIndex = 0;
        for (let i = 0; i < residual.length; i++) {
            const time = i / fs;
            while (qrsIndex < qrsIntervals.length && time > qrsIntervals[qrsIndex][1] + 0.04) qrsIndex++;
            if (qrsIndex === qrsIntervals.length || time < qrsIntervals[qrsIndex][0] - 0.04) {
                noiseSamples.push(residual[i]);
            }
        }
        const noise = noiseScale(noiseSamples);
        const beats = qrsIntervals.map(([start, end]) => {
            let maximum = -Infinity;
            let minimum = Infinity;
            for (let i = Math.ceil(start * fs); i <= Math.min(signal.length - 1, Math.floor(end * fs)); i++) {
                maximum = Math.max(maximum, normalized[i]);
                minimum = Math.min(minimum, normalized[i]);
            }
            return {start, end, center: (start + end) / 2, amplitude: maximum - minimum};
        });
        const split = (left, right) => left.end
            + PARAMETERS.interbeatSplitFraction * (right.start - left.end);
        for (let i = 0; i < beats.length; i++) {
            const beat = beats[i];
            if (!Number.isFinite(beat.amplitude) || beat.amplitude <= 1e-8) continue;
            const previous = beats[i - 1];
            const next = beats[i + 1];
            const previousRr = previous ? beat.center - previous.center : 1;
            const nextRr = next ? next.center - beat.center : previousRr;
            const windows = {
                P: [Math.max(0.05, beat.start - Math.min(PARAMETERS.P.lookbackSeconds,
                    PARAMETERS.P.rrFraction * previousRr), previous ? split(previous, beat) : 0),
                    beat.start - PARAMETERS.P.guardSeconds],
                T: [beat.end + PARAMETERS.T.guardSeconds,
                    Math.min(duration - 0.05, beat.end + PARAMETERS.T.lookaheadSeconds,
                        beat.end + PARAMETERS.T.rrFraction * nextRr, next ? split(beat, next) : duration)]
            };
            for (const phase of ["P", "T"]) {
                const wave = delineateWindow(filtered, residual, fs, ...windows[phase],
                    beat.amplitude, noise, PARAMETERS[phase]);
                if (wave) {
                    result.waves[phase].push(wave);
                    result.intervals[phase].push([wave.start, wave.end]);
                }
            }
        }
        return result;
    }

    return {detectPt};
});
