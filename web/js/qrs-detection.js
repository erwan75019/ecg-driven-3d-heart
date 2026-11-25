(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.ECGQRS = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    function mean(values) {
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    }

    function biquad(signal, fs, frequency, highpass) {
        const w = 2 * Math.PI * frequency / fs;
        const c = Math.cos(w), alpha = Math.sin(w) / Math.SQRT2, a0 = 1 + alpha;
        const b0 = (highpass ? 1 + c : 1 - c) / (2 * a0);
        const b1 = (highpass ? -(1 + c) : 1 - c) / a0;
        const a1 = -2 * c / a0, a2 = (1 - alpha) / a0;
        const run = input => {
            const output = new Array(input.length);
            let x1 = input[0], x2 = input[0];
            let y1 = highpass ? 0 : input[0], y2 = y1;
            for (let i = 0; i < input.length; i++) {
                const y = b0 * input[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
                output[i] = y; x2 = x1; x1 = input[i]; y2 = y1; y1 = y;
            }
            return output;
        };
        return run(run(signal).reverse()).reverse();
    }

    function detectQrs(signal, fs) {
        if (!Array.isArray(signal) || signal.length < 28 || !signal.every(Number.isFinite)
            || !Number.isFinite(fs) || fs <= 80 || fs > 10000) {
            throw new Error("QRS detection needs finite samples and a sampling rate above 80 Hz and at most 10,000 Hz.");
        }
        const result = {
            method: "Pan-Tompkins (offline adaptation)", rPeaks: [],
            intervals: {P: [], QRS: [], T: []},
            parameters: {bandpassHz: [5, 15], integrationSeconds: 0.15,
                refractorySeconds: 0.2, estimatedWindowSeconds: [-0.06, 0.08]}
        };
        const sorted = [...signal].sort((a, b) => a - b);
        const baseline = sorted[Math.floor(sorted.length / 2)];
        let magnitude = 0;
        for (const value of signal) magnitude = Math.max(magnitude, Math.abs(value - baseline));
        if (magnitude === 0) return result;
        const normalized = signal.map(value => (value - baseline) / magnitude);
        const padding = Math.min(signal.length - 1, Math.ceil(fs));
        const extended = [];
        for (let i = padding; i > 0; i--) extended.push(2 * normalized[0] - normalized[i]);
        for (const value of normalized) extended.push(value);
        for (let i = 1; i <= padding; i++) extended.push(2 * normalized.at(-1) - normalized[normalized.length - 1 - i]);
        const band = biquad(biquad(extended, fs, 5, true), fs, 15, false).slice(padding, padding + signal.length);
        const derivative = band.map((_, i) => {
            const at = j => band[Math.max(0, Math.min(band.length - 1, j))];
            return (-at(i - 2) - 2 * at(i - 1) + 2 * at(i + 1) + at(i + 2)) / 8;
        });
        const prefix = [0];
        for (const value of derivative) prefix.push(prefix.at(-1) + value * value);
        const half = Math.max(1, Math.round(0.075 * fs));
        const integrated = band.map((_, i) => {
            const start = Math.max(0, i - half), end = Math.min(band.length, i + half + 1);
            return (prefix[end] - prefix[start]) / (end - start);
        });
        const refractory = Math.round(0.2 * fs), slopeRadius = Math.max(1, Math.round(0.035 * fs));
        const candidates = [];
        let lastCandidate = -1;
        for (let i = 1; i < integrated.length - 1; i++) {
            if (integrated[i] <= integrated[i - 1] || integrated[i] < integrated[i + 1]) continue;
            let r = i;
            const radius = Math.round(0.15 * fs);
            for (let j = Math.max(0, i - radius); j <= Math.min(band.length - 1, i + radius); j++) {
                if (Math.abs(band[j]) > Math.abs(band[r])) r = j;
            }
            if (r < Math.round(0.15 * fs) || r >= band.length - Math.round(0.15 * fs)) continue;
            const candidate = {r, energy: integrated[i], amplitude: Math.abs(band[r]),
                slope: mean(derivative.slice(Math.max(0, r - slopeRadius), r + slopeRadius + 1).map(Math.abs))};
            if (lastCandidate >= 0 && r - candidates[lastCandidate].r < refractory) {
                if (candidate.energy > candidates[lastCandidate].energy) candidates[lastCandidate] = candidate;
            } else { candidates.push(candidate); lastCandidate++; }
        }
        candidates.sort((a, b) => a.r - b.r);
        if (!candidates.length) return result;
        const initialEnergy = integrated.slice(0, Math.min(integrated.length, Math.round(2 * fs)));
        const initialBand = band.slice(0, Math.min(band.length, Math.round(2 * fs))).map(Math.abs);
        let signalI = Math.max(...initialEnergy) / 3, noiseI = mean(initialEnergy) / 2;
        let signalF = Math.max(...initialBand) / 3, noiseF = mean(initialBand) / 2;
        const beats = [], rejected = [], rr = [];
        const threshold = (s, n) => n + 0.25 * Math.max(0, s - n);
        const rrMean = () => {
            if (!rr.length) return fs;
            const average = mean(rr.slice(-8));
            const regular = rr.slice(-8).filter(value => value >= 0.92 * average && value <= 1.16 * average);
            return regular.length ? mean(regular) : average;
        };
        const isTWave = candidate => beats.length && candidate.r - beats.at(-1).r < 0.36 * fs
            && candidate.slope < 0.5 * beats.at(-1).slope;
        const accept = (candidate, searchback) => {
            if (beats.length) rr.push(candidate.r - beats.at(-1).r);
            beats.push(candidate);
            const alpha = searchback ? 0.25 : 0.125;
            signalI = alpha * candidate.energy + (1 - alpha) * signalI;
            signalF = alpha * candidate.amplitude + (1 - alpha) * signalF;
        };
        const searchBack = before => {
            while (beats.length && before - beats.at(-1).r > 1.66 * rrMean()) {
                const eligible = rejected.filter(candidate => candidate.r >= beats.at(-1).r + refractory
                    && candidate.r <= before - refractory && !isTWave(candidate)
                    && candidate.energy > 0.5 * threshold(signalI, noiseI)
                    && candidate.amplitude > 0.5 * threshold(signalF, noiseF));
                if (!eligible.length) break;
                eligible.sort((a, b) => b.energy - a.energy);
                accept(eligible[0], true);
            }
        };
        for (const candidate of candidates) {
            searchBack(candidate.r);
            if (beats.length && candidate.r - beats.at(-1).r < refractory) continue;
            if (!isTWave(candidate) && candidate.energy > threshold(signalI, noiseI)
                && candidate.amplitude > threshold(signalF, noiseF)) accept(candidate, false);
            else {
                rejected.push(candidate);
                noiseI = 0.125 * candidate.energy + 0.875 * noiseI;
                noiseF = 0.125 * candidate.amplitude + 0.875 * noiseF;
            }
        }
        searchBack(signal.length - 1);
        result.rPeaks = beats.map(beat => beat.r / fs);
        result.intervals.QRS = result.rPeaks.map((time, i, times) => [
            Math.max(0, time - 0.06, i ? (times[i - 1] + time) / 2 : 0),
            Math.min((signal.length - 1) / fs, time + 0.08, i + 1 < times.length ? (time + times[i + 1]) / 2 : Infinity)
        ]);
        return result;
    }
    return {detectQrs};
});
