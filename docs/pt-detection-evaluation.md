# Experimental P/T detection and LUDB evaluation

[Back to the project README](../README.md)

CSV imports now estimate P, QRS and T intervals from the samples. The existing
Pan-Tompkins adaptation supplies QRS anchors. The [P/T detector](../web/js/pt-wave-detection.js)
receives samples, sampling rate and QRS intervals. It searches for P/T
morphology around those anchors. A CSV has no annotation input, while a JSON
file can supply its own QRS intervals. Bundled LUDB records use their dataset
annotations directly in the viewer. The evaluator runs detection on the
signal before reading the reference intervals for scoring.
No backend, new package, Python service or reference lookup is involved in
browser detection. The Python converter's `--detect-qrs` option still estimates
QRS only.

## Algorithm and abstention

1. Subtract the signal median and divide by its maximum absolute deviation
   for numerical scale invariance. The imported samples remain unchanged.
2. Apply two centered moving averages, each approximately 20 ms wide. This
   triangular smoothing reduces rapid fluctuations without a causal time lag
   in the interior. It is a lightweight smoothing heuristic, not the 0.5-40 Hz
   display filter and not a reproduction of a published wavelet delineator.
3. Estimate residual noise using 1.4826 times median absolute deviation of
   raw-minus-smoothed samples, excluding QRS intervals expanded by 40 ms.
   Each candidate also uses its local residual-noise estimate, taking the
   larger noise scale.
4. Search before each QRS for P and after it for T. P looks back at most
   350 ms or 45% of the preceding RR interval, ending 5 ms before QRS onset.
   T begins 40 ms after QRS end and looks ahead at most 500 ms or 65% of the
   following RR interval, or uses the preceding RR for the last beat. Adjacent
   beats share a partition at 65% of the inter-QRS gap. The first beat uses a
   1 s fallback for the preceding RR. The P search starts at or after 50 ms
   and the T search ends at or before 50 ms from the recording end.
5. Subtract a local linear baseline joining the median of the first and last
   12 ms (P) or 25 ms (T) of each search window, with at least two samples.
   Find extrema of either polarity. Their
   amplitude must exceed five times residual noise and at least 2.5% (P) or
   4% (T) of the local QRS peak-to-peak amplitude.
6. Follow the selected lobe left and right to the first crossings of the
   larger of 15% of its peak and twice the residual-noise scale. These
   sample-derived crossings define the interval in seconds. Accept widths
   of 40-180 ms for P and 80-380 ms for T. A competing peak at least 40 ms
   away and at least 65% as strong makes the window ambiguous and rejected.
   Edge-truncated candidates are also rejected: a crossing must remain at
   least 4 ms (P) or 25 ms (T) from the window edge, rounded to samples with
   a minimum of one sample. Baseline sampling and crossing safety margins
   are separate parameters.

Search windows constrain where to look. They are never exported as the P/T
intervals themselves. A zero/constant signal produces no P/T intervals, even
if QRS anchors are supplied. An unannotated segment means that this method
could not identify a wave; it does not establish physiological absence.

## Existing and partial JSON annotations

- A supplied non-empty QRS array is preserved. An omitted or empty QRS array
  retains the previous import behavior: QRS are estimated automatically.
- A supplied P or T array is preserved, including an explicit `[]`. Partial
  arrays are treated as authoritative; the importer does not invent missing
  beats within them.
- Only omitted P/T keys are completed. To request T detection with known QRS
  and P, use `intervals: {"QRS": [...], "P": [...]}` and omit `T`.
- A raw JSON without `intervals`, or with `intervals: {}`, estimates all three
  phases. Legacy raw JSON containing `{"P":[],"QRS":[],"T":[]}` continues
  to estimate QRS while retaining the explicit empty P/T arrays. Omit those
  P/T keys to request the new estimates.
- New P/T estimates that overlap existing intervals are discarded. Estimated
  QRS can still overlap supplied P/T in a partial JSON file. A check using the
  200 LUDB files as sample inputs, with P/T explicitly supplied and QRS omitted,
  found 9 overlaps across 5 records (7, 110, 130, 159 and 190). The phase display
  gives P priority over QRS, then QRS over T. Resolving these conflicts would
  require an explicit policy for keeping, trimming or flagging the intervals.

The importer stores estimation provenance in `record.detection.estimatedPhases`
and `record.detection.pt`. The local-import message and report identify the
counts supplied and estimated for each phase. The existing graph, phase
readout and heart event synchronization consume `intervals.P/QRS/T` directly.
The heart maps the ECG playback time to the animation clip using QRS/P/T as
timing anchors. Estimated P can also change which samples are used to measure the
local QRS baseline and thus affect per-beat animation weights. With the same
filtered signals and QRS intervals on LUDB, switching from v1 to v2 P changed
the active/inactive flag for 10 of 2,166 QRS complexes. The viewer requires at
least two QRS starts to construct a cycle, so a recording with a single active
QRS can display the phase without animating the heart.

## Reproducible LUDB comparison

Run the [evaluator](../signal-processing/evaluate_pt_waves.cjs) with the same
QRS and P/T detection modules as the browser, or select record IDs explicitly:

```text
node signal-processing/evaluate_pt_waves.cjs
node signal-processing/evaluate_pt_waves.cjs 1 2 3 4 8 10 25 50 100 150 200
```

The evaluator detects QRS from `record.ecg` and `record.fs`, then detects P/T
using those estimated QRS. Only after detection does it read reference
intervals for scoring. The 200 bundled single-channel LUDB exports each have
5,000 samples at 500 Hz. The run scored all 200 files with no skipped record.
Synthetic demo records 202-205 are outside the evaluation. A separate check
re-imported all 200 signals as raw CSV and obtained exactly the same P, QRS and
T intervals as the evaluator's direct detection.

Predicted and reference waves are matched within the same phase, with
positive interval overlap and midpoint separation at most 100 ms. The midpoint
comparison allows 1e-12 s for floating-point rounding at the inclusive limit.
Candidate pairs are processed by increasing midpoint distance, using each
prediction and reference at most once. This greedy rule can miss a globally
optimal pairing in ambiguous cases. Its match counts agree with maximum
cardinality for every scored phase and record in both versions. Unmatched
predictions count as FP and unmatched references count as FN. Sensitivity is
TP/(TP+FN) and precision is TP/(TP+FP), computed from totals across records.

The scoring span extends from the first to last supplied reference interval
across all phases of each record. Predictions whose midpoint lies outside
that span are excluded and counted separately in the per-record output,
because recording edges may lack annotations. The span ranges from 0.242 to
8.820 s per record, with a median of 7.278 s. Internal missing-wave regions
are included. A phase without any reference wave can still contribute false
positives within the span. Metrics with a zero denominator are undefined and
shown as `null`. Onset/offset errors are prediction minus reference, measured
in milliseconds on matched waves only. Boundary MAE describes these matches,
while sensitivity describes how many reference waves were matched.

Initial version (v1), measured on 25 November 2026:

| Phase | Reference waves | TP | FP | FN | Sensitivity | Precision | Onset MAE | Offset MAE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P | 1,401 | 519 | 47 | 882 | 37.04% | 91.70% | 11.85 ms | 9.42 ms |
| T | 1,629 | 1,356 | 30 | 273 | 83.24% | 97.84% | 24.01 ms | 25.31 ms |

All 200 records were scored. Mean signed onset/offset errors are +1.93/-6.16 ms
for P and +20.72/+2.88 ms for T. Errors on missed waves are not represented in
these boundary statistics. The parameters were written before an initial
inspection of records 1-10 and kept unchanged for the 200-record comparison.
This remains an exploratory evaluation on the repository's exported
single-channel signals, rather than the full original 12-lead database or
an independent clinical validation.

Some initial v1 per-record outcomes, including failures:

| Record | P TP/FP/FN | T TP/FP/FN |
| --- | --- | --- |
| 1 | 0 / 0 / 5 | 5 / 0 / 0 |
| 2 | 8 / 0 / 0 | 8 / 0 / 0 |
| 3 | 8 / 0 / 0 | 2 / 2 / 6 |
| 4 | 2 / 0 / 6 | 0 / 2 / 8 |
| 8 | 0 / 4 / 0 | 5 / 0 / 4 |
| 10 | 7 / 0 / 0 | 7 / 0 / 0 |
| 25 | 0 / 0 / 6 | 6 / 0 / 0 |
| 50 | 0 / 0 / 8 | 8 / 0 / 0 |
| 100 | 0 / 0 / 8 | 8 / 0 / 0 |
| 150 | 2 / 0 / 5 | 7 / 0 / 0 |
| 200 | 0 / 0 / 8 | 8 / 0 / 0 |

LUDB provides specialist P/QRS/T annotations, described on its
[PhysioNet dataset page](https://physionet.org/content/ludb/1.0.1/).
Our JSON exports contain intervals, not reference peak locations, so this
comparison uses interval midpoints for matching.

## P sensitivity correction (v2)

Diagnostic instrumentation of v1 classified its 882 missed reference P waves
after blind detection: 638 edge rejections, 175 below the amplitude gate,
48 ambiguous windows, 15 overly wide candidates, 2 outside the search window,
and 4 accepted candidates that did not match those references. These are
first rejection reasons, not independent physiological diagnoses.

The same 25 ms parameter served both baseline sampling and boundary safety.
It rejected many identifiable P waves near QRS onset. For example, in record
4 a candidate with sample-derived bounds [1.824, 1.944] s was rejected near
the end of its [1.6988, 1.970] s search window despite exceeding the amplitude
threshold. In record 100, the first P search ended at 2.058 s, before the
reference P offset of 2.066 s (reference used for this diagnosis only).
Its contaminated right baseline produced an opposite-polarity lobe at
1.940 s exceeding 65% of the selected peak, triggering ambiguity rejection.

Only P geometry changes: the pre-QRS guard goes from 20 to 5 ms, baseline
edge sampling from 25 to 12 ms, and crossing safety from 25 to 4 ms. The
lookback, interbeat partition, smoothing, five-times-noise threshold, 2.5%
QRS-amplitude floor, ambiguity test and accepted widths stay unchanged.
Intervals still come from signal crossings; no QRS-relative replacement
intervals or reference-driven detections are generated.

The same evaluator and matching/scoring rules above were used for both
versions on all 200 records:

| Phase / version | TP | FP | FN | Sensitivity | Precision | Onset MAE | Offset MAE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P / v1 | 519 | 47 | 882 | 37.04% | 91.70% | 11.85 ms | 9.42 ms |
| P / v2 | 1,228 | 105 | 173 | 87.65% | 92.12% | 11.99 ms | 8.34 ms |
| T / both | 1,356 | 30 | 273 | 83.24% | 97.84% | 24.01 ms | 25.31 ms |

P signed onset/offset bias becomes +3.59/-3.66 ms. Boundary errors concern
matched waves only and the matched populations differ between versions.
Direct output comparison confirmed identical QRS and T intervals on all
200 records, also through the CSV importer.

The original v2 score was 1,227 TP, 106 FP and 174 FN (87.58% sensitivity,
92.05% precision). One prediction on record 60 overlapped its reference and
had a midpoint difference of exactly 100 ms, which binary arithmetic put
just above the cutoff. The rounding allowance restores that match. Both
versions were rescored, and all v1 and T metrics stayed the same.

| Phase / version | All predictions | Excluded by midpoint coverage |
| --- | ---: | ---: |
| P / v1 | 750 | 184 (24.5%) |
| P / v2 | 1,754 | 421 (24.0%) |
| T / both | 1,804 | 418 (23.2%) |

The browser still displays these predictions when importing the full signal.
Their exclusion from scoring leaves their accuracy unknown.

| Record | P v1 TP/FP/FN | P v2 TP/FP/FN |
| --- | --- | --- |
| 4 | 2 / 0 / 6 | 8 / 0 / 0 |
| 100 | 0 / 0 / 8 | 8 / 0 / 0 |
| 10 | 7 / 0 / 0 | 6 / 0 / 1 |
| 150 | 2 / 0 / 5 | 4 / 0 / 3 |
| 200 | 0 / 0 / 8 | 7 / 0 / 1 |

The complete imports produce 9 P intervals for record 4 and 11 for record
100. Respectively 1 and 3 predictions fall outside the scoring span and
are excluded under the unchanged protocol; their correctness is not
established by the reported zero FP within the annotated span.

The improvement is not uniform: 724 previously missed reference waves are
matched, while 15 previously matched waves are lost (records 10, 13, 17,
24, 56, 60 and 125). Net TP gain is 709 for 58 additional FP. The absolute
false-positive count more than doubles, even though aggregate precision
slightly improves. Record 8 still has four false P detections and record 4
still has poor T detection. These failures are not hidden by the averages.

Parameters were adjusted after inspecting records 1-10 and 100, then
evaluated on the same 200 records as v1. This is exploratory retuning on
reused data, not an independent validation or evidence of generalization.

## Limits and next improvements

With v2, 173 of 1,401 reference P waves remain missed and 105 predictions
are unmatched within the scoring spans. The 5 ms P guard is shorter than
the roughly 20 ms support on either side of a sample in the centered smoother.
Nearby QRS activity can therefore influence the candidate even when the
estimated QRS onset is accurate. At low sampling rates, sample rounding can
still reject a wave too close to QRS, leaving a gap in the annotations.

The heuristic assumes a distinguishable single lobe before/after a detected
QRS. Low-amplitude, biphasic/notched, merged or unusually timed waves,
arrhythmias, pacing, substantial drift and artifacts can be rejected or
misidentified. Inaccurate R-centered QRS bounds can also bias the searches
and especially the T onset. Five times residual noise is an engineering gate,
not a calibrated confidence probability. Experimental intervals require
visual review and are not suitable for diagnosis.

Next improvements should examine the missed P waves and QRS boundary errors,
use better baseline/noise estimates and model biphasic morphology. A
multiscale wavelet method such as
[Martinez et al., 2004](https://pubmed.ncbi.nlm.nih.gov/15072211/)
is a research direction, not the algorithm implemented here. Future tuning
needs a separate development subset and an untouched validation dataset,
with expert review, per-morphology analysis and explicit uncertainty handling.

The automated tests cover finite-width synthetic waves, noise, ambiguous
peaks, different rates/gains/polarities, flat ECGs, edge truncation, annotation
preservation, evaluation matching and QRS/import regression. They verify
software behavior. The LUDB figures describe the dataset comparison above.
