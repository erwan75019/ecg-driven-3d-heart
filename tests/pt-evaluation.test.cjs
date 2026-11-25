const {test} = require('node:test');
const assert = require('node:assert/strict');
const {matchIntervals, summarize} = require('../signal-processing/evaluate_pt_waves.cjs');

test('evaluation matches each reference once and counts duplicate predictions as false positives', () => {
    const score = matchIntervals([[1.01, 1.11], [1.02, 1.12], [3, 3.1]], [[1, 1.1], [2, 2.1]]);
    assert.equal(score.tp, 1);
    assert.equal(score.fp, 2);
    assert.equal(score.fn, 1);
    assert.ok(Math.abs(score.onsetErrorsMs[0] - 10) < 1e-10);
    assert.ok(Math.abs(score.offsetErrorsMs[0] - 10) < 1e-10);
    const stats = summarize(score);
    assert.equal(stats.sensitivityPercent, 50);
    assert.equal(stats.precisionPercent, 33.33);
    assert.equal(stats.onsetMaeMs, 10);
});

test('close but disjoint intervals and overlapping intervals with distant centers do not match', () => {
    assert.equal(matchIntervals([[1.06, 1.1]], [[1, 1.05]]).tp, 0);
    assert.equal(matchIntervals([[1.19, 1.4]], [[1, 1.2]]).tp, 0);
    const empty = summarize(matchIntervals([], []));
    assert.equal(empty.precisionPercent, null);
    assert.equal(empty.sensitivityPercent, null);
    assert.equal(empty.onsetMaeMs, null);
});

test('the midpoint cutoff includes exactly 100 ms even with floating-point rounding', () => {
    const reference = [[8.004, 8.158]];
    assert.equal(matchIntervals([[8.146, 8.216]], reference).tp, 1);
    assert.equal(matchIntervals([[8.146, 8.218]], reference).tp, 0);
});
