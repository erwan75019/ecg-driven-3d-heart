"""Offline Pan-Tompkins adaptation, matched to web/js/qrs-detection.js.

Pan & Tompkins (1985), doi:10.1109/TBME.1985.325532. Uses 5-15 Hz
floating-point biquads and centered integration instead of the original
200 Hz integer filters. QRS bounds are estimated R-centered windows;
this is not P/T detection or a clinically validated delineator.
"""

import math


def _mean(values):
    return sum(values) / len(values) if values else 0.0


def _round(value):
    return math.floor(value + 0.5)


def _biquad(signal, fs, frequency, highpass):
    w = 2 * math.pi * frequency / fs
    c, alpha = math.cos(w), math.sin(w) / math.sqrt(2)
    a0 = 1 + alpha
    b0 = (1 + c if highpass else 1 - c) / (2 * a0)
    b1 = (-(1 + c) if highpass else 1 - c) / a0
    a1, a2 = -2 * c / a0, (1 - alpha) / a0

    def run(values):
        output = []
        x1 = x2 = values[0]
        y1 = y2 = 0.0 if highpass else values[0]
        for value in values:
            y = b0 * value + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2
            output.append(y)
            x2, x1, y2, y1 = x1, value, y1, y
        return output

    return list(reversed(run(list(reversed(run(signal))))))


def detect_qrs(signal, sampling_rate):
    """Return detected R times, estimated QRS windows and detector metadata."""
    fs = sampling_rate
    if (not isinstance(signal, list) or len(signal) < 28
            or any(isinstance(x, bool) or not isinstance(x, (int, float))
                   or not math.isfinite(x) for x in signal)
            or isinstance(fs, bool) or not isinstance(fs, (int, float))
            or not math.isfinite(fs) or not 80 < fs <= 10000):
        raise ValueError("QRS detection needs finite samples and 80 < fs <= 10,000 Hz.")
    result = {"method": "Pan-Tompkins (offline adaptation)", "rPeaks": [],
              "intervals": {"P": [], "QRS": [], "T": []},
              "parameters": {"bandpassHz": [5, 15], "integrationSeconds": 0.15,
                             "refractorySeconds": 0.2,
                             "estimatedWindowSeconds": [-0.06, 0.08]}}
    ordered = sorted(signal)
    baseline = ordered[len(ordered) // 2]
    magnitude = max(abs(value - baseline) for value in signal)
    if magnitude == 0:
        return result
    normalized = [(value - baseline) / magnitude for value in signal]
    padding = min(len(signal) - 1, math.ceil(fs))
    extended = [2 * normalized[0] - normalized[i] for i in range(padding, 0, -1)]
    extended += normalized
    extended += [2 * normalized[-1] - normalized[-1 - i] for i in range(1, padding + 1)]
    band = _biquad(_biquad(extended, fs, 5, True), fs, 15, False)[padding:padding + len(signal)]
    derivative = []
    for i in range(len(band)):
        def at(j):
            return band[max(0, min(len(band) - 1, j))]
        derivative.append((-at(i - 2) - 2 * at(i - 1) + 2 * at(i + 1) + at(i + 2)) / 8)
    prefix = [0.0]
    for value in derivative:
        prefix.append(prefix[-1] + value * value)
    half = max(1, _round(0.075 * fs))
    integrated = []
    for i in range(len(band)):
        start, end = max(0, i - half), min(len(band), i + half + 1)
        integrated.append((prefix[end] - prefix[start]) / (end - start))
    refractory, slope_radius = _round(0.2 * fs), max(1, _round(0.035 * fs))
    candidates = []
    for i in range(1, len(integrated) - 1):
        if integrated[i] <= integrated[i - 1] or integrated[i] < integrated[i + 1]:
            continue
        r, radius = i, _round(0.15 * fs)
        for j in range(max(0, i - radius), min(len(band) - 1, i + radius) + 1):
            if abs(band[j]) > abs(band[r]):
                r = j
        if r < _round(0.15 * fs) or r >= len(band) - _round(0.15 * fs):
            continue
        candidate = {"r": r, "energy": integrated[i], "amplitude": abs(band[r]),
                     "slope": _mean([abs(v) for v in derivative[max(0, r - slope_radius):r + slope_radius + 1]])}
        if candidates and r - candidates[-1]["r"] < refractory:
            if candidate["energy"] > candidates[-1]["energy"]:
                candidates[-1] = candidate
        else:
            candidates.append(candidate)
    candidates.sort(key=lambda c: c["r"])
    if not candidates:
        return result
    initial_energy = integrated[:min(len(integrated), _round(2 * fs))]
    initial_band = [abs(v) for v in band[:min(len(band), _round(2 * fs))]]
    signal_i, noise_i = max(initial_energy) / 3, _mean(initial_energy) / 2
    signal_f, noise_f = max(initial_band) / 3, _mean(initial_band) / 2
    beats, rejected, rr = [], [], []

    def threshold(s, n):
        return n + 0.25 * max(0, s - n)

    def rr_mean():
        if not rr:
            return fs
        average = _mean(rr[-8:])
        regular = [v for v in rr[-8:] if 0.92 * average <= v <= 1.16 * average]
        return _mean(regular) if regular else average

    def is_t_wave(candidate):
        return bool(beats and candidate["r"] - beats[-1]["r"] < 0.36 * fs
                    and candidate["slope"] < 0.5 * beats[-1]["slope"])

    def accept(candidate, searchback):
        nonlocal signal_i, signal_f
        if beats:
            rr.append(candidate["r"] - beats[-1]["r"])
        beats.append(candidate)
        alpha = 0.25 if searchback else 0.125
        signal_i = alpha * candidate["energy"] + (1 - alpha) * signal_i
        signal_f = alpha * candidate["amplitude"] + (1 - alpha) * signal_f

    def search_back(before):
        while beats and before - beats[-1]["r"] > 1.66 * rr_mean():
            eligible = [c for c in rejected
                        if beats[-1]["r"] + refractory <= c["r"] <= before - refractory
                        and not is_t_wave(c)
                        and c["energy"] > 0.5 * threshold(signal_i, noise_i)
                        and c["amplitude"] > 0.5 * threshold(signal_f, noise_f)]
            if not eligible:
                break
            accept(max(eligible, key=lambda c: c["energy"]), True)

    for candidate in candidates:
        search_back(candidate["r"])
        if beats and candidate["r"] - beats[-1]["r"] < refractory:
            continue
        if (not is_t_wave(candidate) and candidate["energy"] > threshold(signal_i, noise_i)
                and candidate["amplitude"] > threshold(signal_f, noise_f)):
            accept(candidate, False)
        else:
            rejected.append(candidate)
            noise_i = 0.125 * candidate["energy"] + 0.875 * noise_i
            noise_f = 0.125 * candidate["amplitude"] + 0.875 * noise_f
    search_back(len(signal) - 1)
    times = [beat["r"] / fs for beat in beats]
    result["rPeaks"] = times
    result["intervals"]["QRS"] = [
        [max(0, t - 0.06, (times[i - 1] + t) / 2 if i else 0),
         min((len(signal) - 1) / fs, t + 0.08,
             (t + times[i + 1]) / 2 if i + 1 < len(times) else math.inf)]
        for i, t in enumerate(times)]
    return result
