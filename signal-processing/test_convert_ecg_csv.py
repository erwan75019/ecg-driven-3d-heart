import json
import tempfile
import unittest
from pathlib import Path

from convert_ecg_csv import convert_csv


class ConvertCsvTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary_directory.name)
        self.csv_path = self.directory / "signal.csv"
        self.csv_path.write_text(
            "time,ecg\n"
            + "".join(f"{index / 500},{index / 1000}\n" for index in range(40)),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_converts_selected_column_and_leaves_annotations_empty(self) -> None:
        output_path = self.directory / "converted.json"
        convert_csv(
            input_path=self.csv_path,
            output_path=output_path,
            sampling_frequency=500,
            label="Test record",
            column=1,
            skip_header=True,
        )

        record = json.loads(output_path.read_text(encoding="utf-8"))
        self.assertEqual(record["label"], "Test record")
        self.assertEqual(record["fs"], 500)
        self.assertEqual(record["ecg"], [index / 1000 for index in range(40)])
        self.assertEqual(record["intervals"], {"P": [], "QRS": [], "T": []})

    def test_preserves_provided_intervals(self) -> None:
        annotations_path = self.directory / "annotations.json"
        annotations_path.write_text(
            json.dumps({"intervals": {"P": [[0.01, 0.02]], "QRS": [[0.03, 0.04]]}}),
            encoding="utf-8",
        )
        output_path = self.directory / "with-annotations.json"

        convert_csv(
            input_path=self.csv_path,
            output_path=output_path,
            sampling_frequency=500,
            label="Annotated record",
            skip_header=True,
            annotations_path=annotations_path,
        )

        record = json.loads(output_path.read_text(encoding="utf-8"))
        self.assertEqual(record["intervals"]["P"], [[0.01, 0.02]])
        self.assertEqual(record["intervals"]["QRS"], [[0.03, 0.04]])
        self.assertEqual(record["intervals"]["T"], [])

    def test_rejects_non_numeric_samples_and_low_sampling_rate(self) -> None:
        self.csv_path.write_text("bad\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "not numeric"):
            convert_csv(
                input_path=self.csv_path,
                output_path=self.directory / "invalid.json",
                sampling_frequency=500,
                label="Invalid",
            )

        with self.assertRaisesRegex(ValueError, "greater than 80 Hz"):
            convert_csv(
                input_path=self.csv_path,
                output_path=self.directory / "low-fs.json",
                sampling_frequency=80,
                label="Invalid",
            )

    def test_rejects_out_of_range_annotations(self) -> None:
        annotations_path = self.directory / "invalid-annotations.json"
        annotations_path.write_text(
            json.dumps({"P": [[0.0, 100.0]]}),
            encoding="utf-8",
        )
        with self.assertRaisesRegex(ValueError, "must satisfy"):
            convert_csv(
                input_path=self.csv_path,
                output_path=self.directory / "invalid-intervals.json",
                sampling_frequency=500,
                label="Invalid",
                skip_header=True,
                annotations_path=annotations_path,
            )

    def test_does_not_overwrite_existing_output_by_default(self) -> None:
        output_path = self.directory / "existing.json"
        output_path.write_text("keep", encoding="utf-8")
        with self.assertRaises(FileExistsError):
            convert_csv(
                input_path=self.csv_path,
                output_path=output_path,
                sampling_frequency=500,
                label="Record",
                skip_header=True,
            )
        self.assertEqual(output_path.read_text(encoding="utf-8"), "keep")


if __name__ == "__main__":
    unittest.main()
