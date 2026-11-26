/* Run with Node; no scientific package or backend is required.
 * Detection is blind to LUDB annotations. Reference intervals enter scoring only.
 */
const fs = require('node:fs');
const path = require('node:path');
const {detectQrs} = require('../web/js/qrs-detection.js');
const {detectPt} = require('../web/js/pt-wave-detection.js');

const CENTER_TOLERANCE_SECONDS = 0.1;
// Keep the inclusive 100 ms cutoff despite floating-point subtraction error.
const CENTER_ROUNDING_TOLERANCE_SECONDS = 1e-12;

function matchIntervals(predicted, reference) {
    const candidates = [];
    for (let p = 0; p < predicted.length; p++) {
        for (let r = 0; r < reference.length; r++) {
            const centerError = Math.abs((predicted[p][0] + predicted[p][1]
                - reference[r][0] - reference[r][1]) / 2);
            const overlap = Math.min(predicted[p][1], reference[r][1])
                - Math.max(predicted[p][0], reference[r][0]);
            if (centerError <= CENTER_TOLERANCE_SECONDS + CENTER_ROUNDING_TOLERANCE_SECONDS
                && overlap > 0) {
                candidates.push({p, r, centerError});
            }
        }
    }
    candidates.sort((a, b) => a.centerError - b.centerError || a.p - b.p || a.r - b.r);
    const usedPredictions = new Set();
    const usedReferences = new Set();
    const onsetErrorsMs = [];
    const offsetErrorsMs = [];
    for (const {p, r} of candidates) {
        if (usedPredictions.has(p) || usedReferences.has(r)) continue;
        usedPredictions.add(p);
        usedReferences.add(r);
        onsetErrorsMs.push(1000 * (predicted[p][0] - reference[r][0]));
        offsetErrorsMs.push(1000 * (predicted[p][1] - reference[r][1]));
    }
    return {tp: usedPredictions.size, fp: predicted.length - usedPredictions.size,
        fn: reference.length - usedReferences.size, onsetErrorsMs, offsetErrorsMs};
}

function summarize(score) {
    const mean = values => values.length ? values.reduce((sum, x) => sum + x, 0) / values.length : null;
    const rounded = value => value === null ? null : Math.round(value * 100) / 100;
    const sensitivity = score.tp + score.fn ? score.tp / (score.tp + score.fn) : null;
    const precision = score.tp + score.fp ? score.tp / (score.tp + score.fp) : null;
    return {tp: score.tp, fp: score.fp, fn: score.fn,
        sensitivityPercent: rounded(sensitivity === null ? null : 100 * sensitivity),
        precisionPercent: rounded(precision === null ? null : 100 * precision),
        onsetBiasMs: rounded(mean(score.onsetErrorsMs)),
        onsetMaeMs: rounded(mean(score.onsetErrorsMs.map(Math.abs))),
        offsetBiasMs: rounded(mean(score.offsetErrorsMs)),
        offsetMaeMs: rounded(mean(score.offsetErrorsMs.map(Math.abs)))};
}

function evaluateRecords(ids) {
    const directory = path.resolve(__dirname, '../web/data/ludb/records');
    const totals = {};
    for (const phase of ['P', 'T']) totals[phase] = {tp: 0, fp: 0, fn: 0, onsetErrorsMs: [], offsetErrorsMs: []};
    const records = [];
    const skipped = [];
    for (const id of ids) {
        const record = JSON.parse(fs.readFileSync(path.join(directory, `record-${id}.json`), 'utf8'));
        // No reference QRS/P/T locations are passed to either detection step.
        const qrs = detectQrs(record.ecg, record.fs);
        const detected = detectPt(record.ecg, record.fs, qrs.intervals.QRS);

        const references = Object.values(record.intervals).flat();
        if (!references.length) {
            skipped.push(id);
            continue;
        }
        const coverage = [Math.min(...references.map(pair => pair[0])),
            Math.max(...references.map(pair => pair[1]))];
        const row = {id, coverageSeconds: coverage, detectedQrs: qrs.intervals.QRS.length};
        for (const phase of ['P', 'T']) {
            // End segments outside the annotated span cannot be scored reliably.
            const predictions = detected.intervals[phase].filter(pair => {
                const center = (pair[0] + pair[1]) / 2;
                return center >= coverage[0] && center <= coverage[1];
            });
            const score = matchIntervals(predictions, record.intervals[phase]);
            for (const key of ['tp', 'fp', 'fn']) totals[phase][key] += score[key];
            totals[phase].onsetErrorsMs.push(...score.onsetErrorsMs);
            totals[phase].offsetErrorsMs.push(...score.offsetErrorsMs);
            row[phase] = summarize(score);
            row[phase].ignoredOutsideCoverage = detected.intervals[phase].length - predictions.length;
        }
        records.push(row);
    }
    return {criteria: {centerToleranceSeconds: CENTER_TOLERANCE_SECONDS, requirePositiveOverlap: true,
        matching: 'one-to-one, ascending center distance',
        coverage: 'first to last reference interval across all phases; predicted centers outside excluded',
        timingErrors: 'prediction minus reference, matched waves only'},
    requestedRecords: ids.length, evaluatedRecords: records.length, skipped,
    summary: {P: summarize(totals.P), T: summarize(totals.T)}, records};
}

if (require.main === module) {
    const ids = process.argv.slice(2).map(Number);
    if (ids.some(id => !Number.isInteger(id) || id < 1 || id > 200)) {
        throw new Error('Choose LUDB record IDs from 1 to 200; synthetic demos are excluded.');
    }
    const selected = ids.length ? [...new Set(ids)] : Array.from({length: 200}, (_, i) => i + 1);
    process.stdout.write(JSON.stringify(evaluateRecords(selected), null, 2) + '\n');
}

module.exports = {matchIntervals, summarize, evaluateRecords};
