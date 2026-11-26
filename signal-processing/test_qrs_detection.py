import json
import math
import tempfile
import unittest
from pathlib import Path

from convert_ecg_csv import convert_csv
from qrs_detection import detect_qrs


class QrsDetectionTests(unittest.TestCase):
    def test_known_peaks_and_inverted_ecg(self):
        for fs in (100, 250, 500):
            signal = [sum(math.exp(-0.5 * ((i / fs - r) / 0.012) ** 2)
                          for r in range(1, 8)) for i in range(fs * 8)]
            for sign in (1, -1):
                result = detect_qrs([sign * v for v in signal], fs)
                self.assertEqual(len(result['rPeaks']), 7)
                for i, t in enumerate(result['rPeaks']):
                    self.assertLessEqual(abs(t - i - 1), 0.04)
                self.assertEqual(result['intervals']['P'], [])
                self.assertEqual(result['intervals']['T'], [])

    def test_zero_constant_and_invalid_signals(self):
        for value in (0, 10, -2):
            self.assertEqual(detect_qrs([value] * 5000, 500)['rPeaks'], [])
        for signal, fs in (([], 500), ([0] * 40, 80), ([math.nan] * 40, 500)):
            with self.assertRaises(ValueError):
                detect_qrs(signal, fs)

    def test_converter_detects_qrs_and_preserves_raw_samples(self):
        fs = 250
        signal = [sum(math.exp(-0.5 * ((i / fs - r) / 0.012) ** 2)
                      for r in range(1, 5)) for i in range(fs * 5)]
        with tempfile.TemporaryDirectory() as folder:
            source, output = Path(folder) / 'input.csv', Path(folder) / 'out.json'
            source.write_text('\n'.join(map(str, signal)), encoding='utf-8')
            convert_csv(source, output, fs, 'Detected', detect_qrs_automatically=True)
            record = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(record['ecg'], signal)
            self.assertEqual(len(record['intervals']['QRS']), 4)
            self.assertTrue(record['detection']['estimatedQrsBounds'])
            self.assertEqual(record['intervals']['P'], [])
            self.assertEqual(record['intervals']['T'], [])

    def test_converter_rejects_conflicting_annotation_options(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'either'):
                convert_csv(Path(folder) / 'input.csv', Path(folder) / 'out.json',
                            500, 'Conflict', annotations_path=Path(folder) / 'annotations.json',
                            detect_qrs_automatically=True)


if __name__ == '__main__':
    unittest.main()
