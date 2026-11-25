const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {detectPt} = require('../web/js/pt-wave-detection.js');
const {detectQrs} = require('../web/js/qrs-detection.js');
const {parseRecord, validateRecord} = require('../web/js/ecg-import.js');
const {evaluateRecords} = require('../signal-processing/evaluate_pt_waves.cjs');

function synthetic(fs, {p = 0.14, t = 0.3, gain = 1, noise = 0.002,
    doubleT = false, tDelay = 0.29, tWidth = 0.24, pDelay = 0.2, pWidth = 0.12} = {}) {
    let seed = 123456;
    const pulse = (time, center, width, amplitude) => {
        const distance = (time - center) / width;
        return Math.abs(distance) < 0.5 ? amplitude * (1 + Math.cos(2 * Math.PI * distance)) / 2 : 0;
    };
    const ecg = Array.from({length: fs * 9}, (_, i) => {
        seed = (1664525 * seed + 1013904223) >>> 0;
        const time = i / fs;
        let value = noise * (seed / 2 ** 32 - 0.5) * 2 + 0.04 * Math.sin(2 * Math.PI * 0.15 * time);
        for (let r = 1; r <= 8; r++) {
            value += pulse(time, r - pDelay, pWidth, p) + pulse(time, r, 0.04, 1)
                + pulse(time, r - 0.025, 0.02, -0.2) + pulse(time, r + 0.026, 0.024, -0.3);
            if (doubleT) value += pulse(time, r + 0.22, 0.1, t) + pulse(time, r + 0.4, 0.1, t);
            else value += pulse(time, r + tDelay, tWidth, t);
        }
        return gain * value;
    });
    const qrs = Array.from({length: 8}, (_, i) => [i + 0.94, i + 1.08]);
    return {ecg, fs, qrs};
}

test('finite-width P/T waves are delineated from samples at different rates, gains and polarities', () => {
    for (const fs of [100, 200, 250, 500, 1000]) {
        for (const gain of [1, -1, 0.01]) {
            const {ecg, qrs} = synthetic(fs, {gain});
            const result = detectPt(ecg, fs, qrs);
            assert.equal(result.intervals.P.length, 8, `P at ${fs} Hz, gain ${gain}`);
            assert.equal(result.intervals.T.length, 8, `T at ${fs} Hz, gain ${gain}`);
            result.intervals.P.forEach(([start, end], i) => {
                assert.ok(Math.abs(start - (i + 0.74)) <= 0.025);
                assert.ok(Math.abs(end - (i + 0.86)) <= 0.025);
            });
            result.intervals.T.forEach(([start, end], i) => {
                assert.ok(Math.abs(start - (i + 1.17)) <= 0.035);
                assert.ok(Math.abs(end - (i + 1.41)) <= 0.035);
            });
        }
    }
});

test('CSV end-to-end detection receives samples and fs only, and returns valid P/QRS/T intervals', () => {
    const {ecg, fs} = synthetic(500);
    const record = parseRecord(ecg.join('\n'), 'pqt.csv', {fs});
    assert.deepEqual(record.ecg, ecg);
    for (const phase of ['P', 'QRS', 'T']) assert.equal(record.intervals[phase].length, 8, phase);
    assert.deepEqual(record.detection.estimatedPhases, ['QRS', 'P', 'T']);
    assert.doesNotThrow(() => validateRecord(record));
});

test('P waves ending near the estimated QRS onset are retained with signal-derived boundaries', () => {
    for (const fs of [100, 250, 500, 1000]) {
        const {ecg, qrs} = synthetic(fs, {pDelay: 0.12, pWidth: 0.08});
        const detected = detectPt(ecg, fs, qrs).intervals.P;
        assert.equal(detected.length, 8, `P near QRS at ${fs} Hz`);
        detected.forEach(([start, end], i) => {
            assert.ok(Math.abs(start - (i + 0.84)) < 0.025);
            assert.ok(Math.abs(end - (i + 0.92)) < 0.025);
            assert.ok(end < qrs[i][0]);
        });
    }
});

test('a boundary too close to QRS at coarse resolution is still rejected', () => {
    const {ecg, qrs} = synthetic(100, {pDelay: 0.105, pWidth: 0.07});
    assert.deepEqual(detectPt(ecg, 100, qrs).intervals.P, []);
});

test('LUDB 4/100 recover P waves while keeping the original T intervals exactly', () => {
    // Frozen T predictions from v1, including its false positives on record 4.
    const originalT = {
        4: [[3.288, 3.514], [6.294, 6.56]],
        100: [[0.546, 0.722], [1.452, 1.638], [2.354, 2.54], [3.274, 3.436],
            [4.142, 4.31], [5.05, 5.224], [5.924, 6.106], [6.826, 6.99],
            [7.716, 7.882], [8.586, 8.768], [9.486, 9.67]]
    };
    for (const id of [4, 100]) {
        const record = JSON.parse(fs.readFileSync(path.resolve(__dirname,
            `../web/data/ludb/records/record-${id}.json`), 'utf8'));
        const qrs = detectQrs(record.ecg, record.fs);
        const detected = detectPt(record.ecg, record.fs, qrs.intervals.QRS);
        assert.deepEqual(detected.intervals.T, originalT[id]);
    }
    // evaluateRecords passes samples/fs only to detection, then scores references.
    for (const row of evaluateRecords([4, 100]).records) {
        assert.equal(row.P.tp, 8);
        assert.equal(row.P.fp, 0);
        assert.equal(row.P.fn, 0);
    }
});

test('zero/constant signals stay unannotated even with supplied QRS anchors', () => {
    const {qrs} = synthetic(500);
    for (const value of [0, 10, -100]) {
        const ecg = new Array(4500).fill(value);
        assert.deepEqual(detectPt(ecg, 500, qrs).intervals, {P: [], T: []});
        assert.deepEqual(parseRecord(ecg.join('\n'), 'flat.csv', {fs: 500}).intervals,
            {P: [], QRS: [], T: []});
    }
});

test('missing and noise-obscured waves are not fabricated', () => {
    for (const options of [{p: 0, t: 0}, {p: 0.003, t: 0.004, noise: 0.08}]) {
        const {ecg, fs, qrs} = synthetic(500, options);
        assert.deepEqual(detectPt(ecg, fs, qrs).intervals, {P: [], T: []});
    }
    const {ecg, fs, qrs} = synthetic(500, {doubleT: true});
    assert.deepEqual(detectPt(ecg, fs, qrs).intervals.T, []);
});

test('moving a wave moves its detected interval rather than assigning a fixed QRS-relative interval', () => {
    const {ecg, fs, qrs} = synthetic(500, {p: 0});
    const shifted = [...ecg.slice(25), ...new Array(25).fill(0)];
    const shiftedQrs = qrs.map(pair => pair.map(t => t - 0.05));
    const original = detectPt(ecg, fs, qrs).intervals.T;
    const moved = detectPt(shifted, fs, shiftedQrs).intervals.T;
    assert.equal(moved.length, original.length);
    moved.forEach(([start, end], i) => {
        assert.ok(Math.abs(start - original[i][0] + 0.05) <= 0.004);
        assert.ok(Math.abs(end - original[i][1] + 0.05) <= 0.004);
    });
    // Same QRS anchors and different signal morphology must change the result.
    assert.deepEqual(detectPt(new Array(ecg.length).fill(0), fs, qrs).intervals.T, []);
    const delayed = synthetic(500, {p: 0, tDelay: 0.34});
    const later = detectPt(delayed.ecg, fs, qrs).intervals.T;
    assert.equal(later.length, original.length);
    later.forEach(([start, end], i) => {
        assert.ok(Math.abs(start - original[i][0] - 0.05) <= 0.006);
        assert.ok(Math.abs(end - original[i][1] - 0.05) <= 0.006);
    });
    const narrower = synthetic(500, {p: 0, tWidth: 0.16});
    const narrow = detectPt(narrower.ecg, fs, qrs).intervals.T;
    assert.equal(narrow.length, original.length);
    assert.ok(narrow.every(([start, end], i) => end - start < original[i][1] - original[i][0] - 0.04));
});

test('independently inverted P/T waves, partial edges and high sampling rates remain valid', () => {
    const {ecg, fs, qrs} = synthetic(10000, {p: -0.14, t: 0.3});
    const result = detectPt(ecg, fs, qrs);
    assert.equal(result.waves.P.length, 8);
    assert.ok(result.waves.P.every(wave => wave.polarity === -1));
    assert.ok(result.waves.T.every(wave => wave.polarity === 1));
    const sliced = ecg.slice(9000, 12500);
    const edgeResult = detectPt(sliced, fs, [[0.04, 0.18]]);
    assert.deepEqual(edgeResult.intervals, {P: [], T: []});
});

test('raw JSON missing all phase keys is detected, but legacy explicit P/T arrays stay empty', () => {
    const {ecg, fs} = synthetic(500);
    const record = parseRecord(JSON.stringify({ecg, fs}), 'raw.json');
    for (const phase of ['P', 'QRS', 'T']) assert.equal(record.intervals[phase].length, 8);
    const explicit = parseRecord(JSON.stringify({ecg, fs, intervals: {P: [], QRS: [], T: []}}), 'raw.json');
    assert.equal(explicit.intervals.QRS.length, 8);
    assert.deepEqual(explicit.intervals.P, []);
    assert.deepEqual(explicit.intervals.T, []);
    assert.deepEqual(explicit.detection.estimatedPhases, ['QRS']);
});

test('JSON supplied phases including explicit empty arrays are authoritative', () => {
    const {ecg, fs, qrs} = synthetic(500);
    const supplied = {fs, ecg, intervals: {P: [], QRS: qrs, T: [[1.2, 1.3]]}};
    const record = parseRecord(JSON.stringify(supplied), 'annotated.json');
    assert.deepEqual(record.intervals, supplied.intervals);
    assert.equal(record.detection, undefined);
});

test('partial JSON fills omitted phases only and avoids supplied intervals', () => {
    const {ecg, fs, qrs} = synthetic(500);
    const suppliedP = [[0.74, 0.86]];
    const record = parseRecord(JSON.stringify({fs, ecg, intervals: {QRS: qrs, P: suppliedP}}), 'partial.json');
    assert.deepEqual(record.intervals.QRS, qrs);
    assert.deepEqual(record.intervals.P, suppliedP);
    assert.equal(record.intervals.T.length, 8);
    assert.deepEqual(record.detection.estimatedPhases, ['T']);
    const blocked = parseRecord(JSON.stringify({fs, ecg, intervals: {QRS: qrs, P: [[1.1, 1.5]]}}), 'partial.json');
    assert.equal(blocked.intervals.T.length, 7);
    assert.doesNotThrow(() => validateRecord(blocked));
});

test('invalid sampling rates, samples and QRS anchors are rejected', () => {
    const {ecg, fs, qrs} = synthetic(500);
    for (const rate of [80, NaN, 10001]) assert.throws(() => detectPt(ecg, rate, qrs));
    assert.throws(() => detectPt([NaN, ...ecg], fs, qrs));
    for (const anchors of [null, [[2, 1]], [[0, 20]], [[2, 3], [1, 2]], [[0.5, Infinity]]]) {
        assert.throws(() => detectPt(ecg, fs, anchors));
    }
    assert.deepEqual(detectPt(ecg, fs, []).intervals, {P: [], T: []});
});
