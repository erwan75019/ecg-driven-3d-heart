const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {detectQrs} = require('../web/js/qrs-detection.js');
const {parseCsv, inspectCsv, parseRecord, validateRecord} = require('../web/js/ecg-import.js');

test('explicit empty CSV rows fail rather than shifting samples in time', () => {
    const csv = '0,0.1\r\n,\r\n2,0.2';
    assert.deepEqual(inspectCsv(csv), {rows: 3, columns: 2, consistentColumns: true});
    assert.throws(() => parseCsv(csv, {column: 1}), /Row 2: column 2/);
    assert.throws(() => parseCsv('0.1\n""\n0.2'), /Row 2: column 1/);
});

function synthetic(fs, sign = 1) {
    return Array.from({length: fs * 9}, (_, i) => {
        const t = i / fs;
        let value = 0.005 * Math.sin(2 * Math.PI * 23 * t);
        for (let r = 1; r <= 8; r++) {
            value += (Math.exp(-0.5 * ((t - r) / 0.012) ** 2)
                + 0.25 * Math.exp(-0.5 * ((t - r - 0.28) / 0.055) ** 2));
        }
        return sign * value;
    });
}

test('CSV handles selected columns, BOM, headers, quotes, CRLF and scientific notation', () => {
    assert.deepEqual(parseCsv('\uFEFFtime;ecg\r\n0;"1.2e-3"\r\n\r\n1;"-0.2"\r\n', {
        delimiter: ';', column: 1, skipHeader: true
    }), [0.0012, -0.2]);
    assert.deepEqual(parseCsv('"quoted, label",0.5\n"two ""quotes""",0.75', {column: 1}), [0.5, 0.75]);
    for (const csv of ['0,\n', '0,Infinity', '0,0xff', '0,"0.2', '0,"0.2"bad']) {
        assert.throws(() => parseCsv(csv, {column: 1}));
    }
});

test('invalid records are rejected before display', () => {
    const base = {fs: 500, ecg: new Array(40).fill(0), intervals: {}};
    for (const fs of [80, NaN, Infinity, 10001, '500']) assert.throws(() => validateRecord({...base, fs}));
    assert.throws(() => validateRecord({...base, ecg: []}));
    assert.throws(() => validateRecord({...base, ecg: new Array(100001).fill(0)}));
    assert.throws(() => validateRecord({...base, intervals: {QRS: [[0.05, 0.2]]}}));
    assert.throws(() => validateRecord({...base, intervals: {QRS: [[0.01, 0.04], [0.03, 0.05]]}}));
    assert.throws(() => parseRecord('oops', 'file.txt'));
});

test('CSV preview describes the table without treating rows as a continuous recording', () => {
    const csv = '\uFEFFsignal,label\r\n"0.1",1\r\n\r\n"0.2",0\r\n';
    assert.deepEqual(inspectCsv(csv, {skipHeader: true}), {
        rows: 2, columns: 2, consistentColumns: true
    });
    assert.deepEqual(parseCsv(csv, {skipHeader: true, column: 0}), [0.1, 0.2]);
    assert.equal(inspectCsv('1;2\n3', {delimiter: ';'}).consistentColumns, false);
    assert.deepEqual(inspectCsv(''), {rows: 0, columns: 0, consistentColumns: true});
    assert.throws(() => inspectCsv('"unclosed'));
    assert.throws(() => inspectCsv('1', {delimiter: '::'}));
});

test('annotated JSON preserves samples and annotations without running detection', () => {
    const original = {label: 'Annotated', fs: 500, ecg: new Array(500).fill(0),
        intervals: {P: [[0.1, 0.2]], QRS: [[0.3, 0.4]], T: [[0.5, 0.7]]}};
    const record = parseRecord(JSON.stringify(original), 'record.json');
    assert.deepEqual(record, original);
    assert.equal(record.detection, undefined);
});

test('CSV preserves samples and detects QRS/T while leaving absent P waves empty', () => {
    const raw = synthetic(500);
    const record = parseRecord(raw.join('\n'), 'synthetic.csv', {fs: 500});
    assert.deepEqual(record.ecg, raw);
    assert.equal(record.intervals.QRS.length, 8);
    assert.deepEqual(record.intervals.P, []);
    assert.equal(record.intervals.T.length, 8);
    record.intervals.T.forEach(([start, end], i) => {
        assert.ok(start < i + 1.28 && end > i + 1.28);
    });
    assert.equal(record.detection.estimatedQrsBounds, true);
});

test('Pan-Tompkins finds positive/inverted QRS at multiple sampling rates and gains', () => {
    for (const fs of [100, 200, 250, 500, 1000]) {
        for (const sign of [1, -1, 0.01]) {
            const result = detectQrs(synthetic(fs, sign), fs);
            assert.equal(result.rPeaks.length, 8, `fs=${fs}, sign=${sign}`);
            result.rPeaks.forEach((t, i) => assert.ok(Math.abs(t - (i + 1)) <= 0.04));
            result.intervals.QRS.forEach(([a, b], i) => {
                assert.ok(a < result.rPeaks[i] && b > result.rPeaks[i]);
                if (i) assert.ok(a >= result.intervals.QRS[i - 1][1]);
            });
        }
    }
});

test('flat signals and constant baselines have no detected QRS', () => {
    for (const value of [0, 10, -2]) assert.deepEqual(detectQrs(new Array(5000).fill(value), 500).rPeaks, []);
    assert.throws(() => detectQrs([], 500));
    assert.throws(() => detectQrs([NaN, ...new Array(40).fill(0)], 500));
});

test('Python and browser detectors produce the same peaks', () => {
    const script = 'import sys,json;sys.path.insert(0,sys.argv[1]);from qrs_detection import detect_qrs;p=json.load(sys.stdin);print(json.dumps(detect_qrs(p["ecg"],p["fs"])["rPeaks"]))';
    for (const fs of [100, 250, 500]) {
        const ecg = synthetic(fs);
        const python = JSON.parse(execFileSync('python', ['-B', '-c', script,
            path.resolve(__dirname, '../signal-processing')], {input: JSON.stringify({ecg, fs}), encoding: 'utf8'}));
        assert.deepEqual(detectQrs(ecg, fs).rPeaks, python);
    }
});
