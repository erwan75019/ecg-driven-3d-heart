import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.signal import butter, sosfiltfilt


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = PROJECT_ROOT / "data" / "ludb" / "data.json"
OUTPUT_DIRECTORY = PROJECT_ROOT / "data" / "processed"


def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Filter one LUDB ECG record and save a comparison plot."
    )
    parser.add_argument(
        "--record",
        type=int,
        default=1,
        help="1-based record number in data.json (default: 1)",
    )
    parser.add_argument(
        "--low",
        type=float,
        default=0.5,
        help="High-pass cutoff in Hz (default: 0.5)",
    )
    parser.add_argument(
        "--high",
        type=float,
        default=40.0,
        help="Low-pass cutoff in Hz (default: 40)",
    )
    parser.add_argument(
        "--order",
        type=int,
        default=4,
        help="Butterworth filter order (default: 4)",
    )
    return parser.parse_args()


def load_record(record_number):
    if not DATA_PATH.is_file():
        raise FileNotFoundError(f"ECG dataset not found: {DATA_PATH}")

    with DATA_PATH.open(encoding="utf-8") as data_file:
        records = json.load(data_file)

    if not isinstance(records, list) or not 1 <= record_number <= len(records):
        raise ValueError(
            f"Record number must be between 1 and {len(records)}."
        )

    record = records[record_number - 1]
    if "fs" not in record or "ecg" not in record:
        raise ValueError(f"Record {record_number} has no fs or ecg field.")

    sampling_rate = float(record["fs"])
    signal = np.asarray(record["ecg"], dtype=float)

    if not np.isfinite(sampling_rate) or sampling_rate <= 0:
        raise ValueError(f"Invalid sampling rate in record {record_number}.")
    if signal.ndim != 1 or signal.size == 0:
        raise ValueError(f"Record {record_number} has an empty or invalid ECG.")
    if not np.isfinite(signal).all():
        raise ValueError(f"Record {record_number} contains non-finite ECG values.")

    return record, signal, sampling_rate


def filter_signal(signal, sampling_rate, low_cutoff, high_cutoff, order):
    nyquist_frequency = sampling_rate / 2
    if not 0 < low_cutoff < high_cutoff < nyquist_frequency:
        raise ValueError(
            "Cutoffs must satisfy 0 < low < high < Nyquist "
            f"({nyquist_frequency:g} Hz for this record)."
        )
    if order < 1:
        raise ValueError("Filter order must be at least 1.")

    filter_sos = butter(
        order,
        (low_cutoff, high_cutoff),
        btype="bandpass",
        fs=sampling_rate,
        output="sos",
    )
    return sosfiltfilt(filter_sos, signal)


def save_comparison_plot(
    record, raw_signal, filtered_signal, sampling_rate, output_path
):
    times = np.arange(raw_signal.size) / sampling_rate

    figure, axes = plt.subplots(2, 1, figsize=(12, 7), sharex=True)
    axes[0].plot(times, raw_signal, color="#82918f", linewidth=0.8)
    axes[0].set_title("Raw ECG")
    axes[1].plot(times, filtered_signal, color="#087c64", linewidth=0.8)
    axes[1].set_title("Filtered ECG (0.5–40 Hz)")

    for axis in axes:
        axis.set_ylabel("Amplitude")
        axis.grid(True, alpha=0.3)

    axes[-1].set_xlabel("Time (s)")
    figure.suptitle(f"{record.get('label', 'ECG record')} — raw vs filtered")
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)


def main():
    arguments = parse_arguments()
    record, raw_signal, sampling_rate = load_record(arguments.record)
    filtered_signal = filter_signal(
        raw_signal,
        sampling_rate,
        arguments.low,
        arguments.high,
        arguments.order,
    )

    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    signal_path = OUTPUT_DIRECTORY / f"record-{arguments.record}-filtered.json"
    plot_path = OUTPUT_DIRECTORY / f"record-{arguments.record}-comparison.png"

    filtered_record = {
        "label": record.get("label", f"Record {arguments.record}"),
        "fs": sampling_rate,
        "ecg_filtered": filtered_signal.tolist(),
        "intervals": record.get("intervals", {}),
        "filter": {
            "type": "Butterworth bandpass",
            "low_cutoff_hz": arguments.low,
            "high_cutoff_hz": arguments.high,
            "order": arguments.order,
            "zero_phase": True,
            "implementation": "scipy.signal.sosfiltfilt",
        },
    }

    with signal_path.open("w", encoding="utf-8") as output_file:
        json.dump(filtered_record, output_file, ensure_ascii=False, indent=2)

    save_comparison_plot(
        record, raw_signal, filtered_signal, sampling_rate, plot_path
    )

    print(f"Filtered signal saved to: {signal_path}")
    print(f"Comparison plot saved to: {plot_path}")
    print(
        f"Record: {filtered_record['label']} | "
        f"sampling rate: {sampling_rate:g} Hz | "
        f"samples: {raw_signal.size}"
    )


if __name__ == "__main__":
    main()
