"""Convert a single-channel CSV ECG into the website's JSON record format."""

import argparse
import csv
import json
import math
from pathlib import Path
from typing import Any


MINIMUM_SAMPLE_COUNT = 28
MINIMUM_SAMPLING_FREQUENCY = 80
PHASES = ("P", "QRS", "T")


def read_csv_signal(
    input_path: Path,
    column: int,
    delimiter: str,
    skip_header: bool,
) -> list[float]:
    signal: list[float] = []

    with input_path.open(encoding="utf-8-sig", newline="") as csv_file:
        rows = csv.reader(csv_file, delimiter=delimiter)
        if skip_header:
            next(rows, None)

        for line_number, row in enumerate(rows, start=2 if skip_header else 1):
            if not row or all(not cell.strip() for cell in row):
                continue
            if column >= len(row):
                raise ValueError(
                    f"CSV line {line_number} has no column {column}."
                )

            try:
                sample = float(row[column].strip())
            except ValueError as error:
                raise ValueError(
                    f"CSV line {line_number}, column {column} is not numeric."
                ) from error

            if not math.isfinite(sample):
                raise ValueError(
                    f"CSV line {line_number}, column {column} is not finite."
                )
            signal.append(sample)

    if len(signal) < MINIMUM_SAMPLE_COUNT:
        raise ValueError(
            f"The CSV must contain at least {MINIMUM_SAMPLE_COUNT} numeric samples."
        )

    return signal


def read_intervals(
    annotations_path: Path | None,
    duration: float,
) -> dict[str, list[list[float]]]:
    if annotations_path is None:
        return {phase: [] for phase in PHASES}

    with annotations_path.open(encoding="utf-8") as annotations_file:
        annotations: Any = json.load(annotations_file)

    if not isinstance(annotations, dict):
        raise ValueError("The annotations JSON must contain an object.")
    if "intervals" in annotations:
        annotations = annotations["intervals"]
    if not isinstance(annotations, dict):
        raise ValueError("The annotations must be an intervals object.")

    intervals: dict[str, list[list[float]]] = {}
    for phase, phase_intervals in annotations.items():
        if not isinstance(phase, str) or not isinstance(phase_intervals, list):
            raise ValueError("Each intervals entry must be a list of time pairs.")

        validated_intervals: list[list[float]] = []
        for index, interval in enumerate(phase_intervals, start=1):
            if not isinstance(interval, list) or len(interval) != 2:
                raise ValueError(
                    f"Interval {index} for {phase!r} must contain start and end times."
                )
            if any(
                isinstance(value, bool) or not isinstance(value, (int, float))
                for value in interval
            ):
                raise ValueError(
                    f"Interval {index} for {phase!r} must contain numeric times."
                )

            start, end = interval
            if (
                not math.isfinite(start)
                or not math.isfinite(end)
                or start < 0
                or end < start
                or end > duration
            ):
                raise ValueError(
                    f"Interval {index} for {phase!r} must satisfy "
                    f"0 <= start <= end <= {duration:.6g} seconds."
                )
            validated_intervals.append([start, end])

        intervals[phase] = validated_intervals

    for phase in PHASES:
        intervals.setdefault(phase, [])
    return intervals


def convert_csv(
    input_path: Path,
    output_path: Path,
    sampling_frequency: float,
    label: str,
    column: int = 0,
    delimiter: str = ",",
    skip_header: bool = False,
    annotations_path: Path | None = None,
    overwrite: bool = False,
) -> None:
    if not math.isfinite(sampling_frequency) or sampling_frequency <= MINIMUM_SAMPLING_FREQUENCY:
        raise ValueError(
            f"Sampling frequency must be greater than {MINIMUM_SAMPLING_FREQUENCY} Hz "
            "for the website's current filter."
        )
    if column < 0:
        raise ValueError("Column index must be zero or greater.")
    if len(delimiter) != 1:
        raise ValueError("Delimiter must be exactly one character.")
    if not label.strip():
        raise ValueError("Label must not be empty.")
    if input_path.resolve() == output_path.resolve():
        raise ValueError("Input and output paths must be different.")
    if annotations_path is not None and (
        annotations_path.resolve() == output_path.resolve()
    ):
        raise ValueError("Annotations and output paths must be different.")

    signal = read_csv_signal(input_path, column, delimiter, skip_header)
    duration = len(signal) / sampling_frequency
    intervals = read_intervals(annotations_path, duration)
    record = {
        "label": label,
        "fs": sampling_frequency,
        "ecg": signal,
        "intervals": intervals,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    mode = "w" if overwrite else "x"
    with output_path.open(mode, encoding="utf-8", newline="\n") as output_file:
        json.dump(record, output_file, ensure_ascii=False, allow_nan=False)
        output_file.write("\n")


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Convert a single-channel CSV ECG into the JSON format used by the "
            "static website. Existing annotations can be supplied separately."
        )
    )
    parser.add_argument("input_csv", type=Path, help="Input CSV file.")
    parser.add_argument("output_json", type=Path, help="Output JSON file.")
    parser.add_argument(
        "--fs",
        type=float,
        required=True,
        help="Sampling frequency in Hz (must be greater than 80 Hz).",
    )
    parser.add_argument(
        "--label",
        help="Record label (defaults to the input filename without extension).",
    )
    parser.add_argument(
        "--column",
        type=int,
        default=0,
        help="Zero-based CSV column containing the ECG samples (default: 0).",
    )
    parser.add_argument(
        "--delimiter",
        default=",",
        help="Single-character CSV delimiter (default: comma).",
    )
    parser.add_argument(
        "--skip-header",
        action="store_true",
        help="Skip the first CSV row.",
    )
    parser.add_argument(
        "--annotations",
        type=Path,
        help=(
            "Optional JSON file containing existing intervals, either as the "
            "top-level object or under an 'intervals' key."
        ),
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace the output file if it already exists.",
    )
    return parser


def main() -> int:
    parser = build_argument_parser()
    args = parser.parse_args()

    try:
        convert_csv(
            input_path=args.input_csv,
            output_path=args.output_json,
            sampling_frequency=args.fs,
            label=args.label or args.input_csv.stem,
            column=args.column,
            delimiter=args.delimiter,
            skip_header=args.skip_header,
            annotations_path=args.annotations,
            overwrite=args.overwrite,
        )
    except (OSError, UnicodeError, csv.Error, json.JSONDecodeError, ValueError) as error:
        parser.error(str(error))

    print(f"Converted ECG written to {args.output_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
