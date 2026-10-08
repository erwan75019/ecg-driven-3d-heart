import argparse
import json
import shutil
import subprocess
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
    parser.add_argument(
        "--compile-pdf",
        action="store_true",
        help="Compile the generated LaTeX report to PDF.",
    )
    parser.add_argument(
        "--latex-engine",
        choices=("tectonic", "pdflatex"),
        default="tectonic",
        help="LaTeX compiler to use with --compile-pdf (default: tectonic).",
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
    record,
    raw_signal,
    filtered_signal,
    sampling_rate,
    low_cutoff,
    high_cutoff,
    output_path,
):
    times = np.arange(raw_signal.size) / sampling_rate

    figure, axes = plt.subplots(2, 1, figsize=(12, 7), sharex=True)
    axes[0].plot(times, raw_signal, color="#82918f", linewidth=0.8)
    axes[0].set_title("Raw ECG")
    axes[1].plot(times, filtered_signal, color="#087c64", linewidth=0.8)
    axes[1].set_title(
        f"Filtered ECG ({low_cutoff:g}–{high_cutoff:g} Hz)"
    )

    for axis in axes:
        axis.set_ylabel("Amplitude")
        axis.grid(True, alpha=0.3)

    axes[-1].set_xlabel("Time (s)")
    figure.suptitle(f"{record.get('label', 'ECG record')} — raw vs filtered")
    figure.tight_layout()
    figure.savefig(output_path, dpi=160)
    plt.close(figure)


def escape_latex(text):
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(character, character) for character in str(text))


def generate_latex_report(
    record_name,
    record_number,
    sampling_rate,
    sample_count,
    low_cutoff,
    high_cutoff,
    order,
    plot_path,
    report_path,
):
    if not plot_path.is_file():
        raise FileNotFoundError(f"Comparison plot not found: {plot_path}")

    template = r"""\documentclass[11pt,a4paper]{article}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[french]{babel}
\usepackage{lmodern}
\usepackage[margin=2.2cm,headheight=15pt]{geometry}
\usepackage[table]{xcolor}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{tabularx}
\usepackage{fancyhdr}
\usepackage{microtype}

\definecolor{HeartTeal}{HTML}{087C78}
\definecolor{HeartNavy}{HTML}{16324F}
\definecolor{HeartCoral}{HTML}{EF6A55}
\definecolor{SoftMint}{HTML}{EAF5F3}
\definecolor{SoftGray}{HTML}{F3F5F7}

\pagestyle{fancy}
\fancyhf{}
\lhead{\textcolor{HeartTeal}{\small Rapport de traitement ECG}}
\rhead{\textcolor{HeartNavy}{\small Enregistrement \#@RECORD_NUMBER@}}
\cfoot{\textcolor{gray}{\thepage}}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\headrule}{\hbox to\headwidth{\color{HeartTeal}\leaders\hrule height \headrulewidth\hfill}}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0.65em}

\begin{document}

\begin{center}
\colorbox{HeartNavy}{%
  \begin{minipage}{0.92\textwidth}
    \vspace{0.55cm}
    \centering
    {\color{white}\Large\bfseries RAPPORT DE TRAITEMENT ECG}\\[0.3cm]
    {\color{white}\LARGE\bfseries @RECORD_NAME@}\\[0.25cm]
    {\color{white!80}\large Filtre passe-bande Butterworth
      \textcolor{HeartCoral}{\bfseries @LOW@--@HIGH@ Hz}
      \quad|\quad ordre @ORDER@}\\
    \vspace{0.55cm}
  \end{minipage}%
}
\end{center}

\vspace{0.25cm}
\color{HeartTeal}\rule{\textwidth}{1.2pt}
\color{black}

\section*{\textcolor{HeartNavy}{Comparaison du signal}}
La figure ci-dessous compare l'enregistrement ECG brut au signal après
filtrage passe-bande. Le filtrage est appliqué en phase nulle afin de
préserver l'alignement temporel des événements du signal.

\begin{figure}[ht]
  \centering
  \includegraphics[width=\textwidth,height=0.58\textheight,keepaspectratio]{@PLOT_FILE@}
  \caption{Comparaison des signaux brut et filtré pour
    \textbf{@RECORD_NAME@}.}
\end{figure}

\section*{\textcolor{HeartNavy}{Paramètres de l'analyse}}
\rowcolors{2}{SoftGray}{white}
\begin{tabularx}{\textwidth}{>{\bfseries}X r}
\rowcolor{SoftMint}
\textcolor{HeartNavy}{Métrique} & \textcolor{HeartNavy}{Valeur}\\
Fréquence d'échantillonnage & @SAMPLING_RATE@ Hz\\
Nombre d'échantillons & @SAMPLE_COUNT@\\
Ordre du filtre Butterworth & @ORDER@\\
Bande passante & @LOW@--@HIGH@ Hz\\
\bottomrule
\end{tabularx}

\vfill
{\small\color{gray}Traitement numérique réalisé avec un filtre Butterworth
à phase nulle (\texttt{scipy.signal.sosfiltfilt}).}

\end{document}
"""
    replacements = {
        "@RECORD_NUMBER@": str(record_number),
        "@RECORD_NAME@": escape_latex(record_name),
        "@LOW@": f"{low_cutoff:g}",
        "@HIGH@": f"{high_cutoff:g}",
        "@ORDER@": str(order),
        "@PLOT_FILE@": escape_latex(plot_path.name),
        "@SAMPLING_RATE@": f"{sampling_rate:g}",
        "@SAMPLE_COUNT@": str(sample_count),
    }
    for placeholder, value in replacements.items():
        template = template.replace(placeholder, value)

    report_path.write_text(template, encoding="utf-8")


def compile_latex_report(report_path, output_directory, engine):
    executable = shutil.which(engine)
    if executable is None and engine == "tectonic":
        local_app_data = Path.home() / "AppData" / "Local"
        user_install = local_app_data / "Programs" / "Tectonic" / "tectonic.exe"
        if user_install.is_file():
            executable = str(user_install)

    if executable is None:
        install_hint = (
            "Download the Windows x86_64 MSVC archive from "
            "https://github.com/tectonic-typesetting/tectonic/releases/latest, "
            "extract tectonic.exe to %LOCALAPPDATA%\\Programs\\Tectonic, "
            "then reopen PowerShell."
            if engine == "tectonic"
            else "Install pdflatex and make sure its directory is on PATH."
        )
        raise FileNotFoundError(
            f"'{engine}' was not found. {install_hint}"
        )

    if engine == "tectonic":
        command = [
            executable,
            "--keep-logs",
            "--outdir",
            str(output_directory),
            report_path.name,
        ]
    else:
        command = [
            executable,
            "-interaction=nonstopmode",
            "-halt-on-error",
            f"-output-directory={output_directory}",
            report_path.name,
        ]

    subprocess.run(command, cwd=output_directory, check=True)


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
    report_path = OUTPUT_DIRECTORY / f"record-{arguments.record}-report.tex"

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
        record,
        raw_signal,
        filtered_signal,
        sampling_rate,
        arguments.low,
        arguments.high,
        plot_path,
    )
    record_name = record.get("label", f"Record {arguments.record}")
    generate_latex_report(
        record_name,
        arguments.record,
        sampling_rate,
        raw_signal.size,
        arguments.low,
        arguments.high,
        arguments.order,
        plot_path,
        report_path,
    )

    print(f"Filtered signal saved to: {signal_path}")
    print(f"Comparison plot saved to: {plot_path}")
    print(f"LaTeX report saved to: {report_path}")
    print(
        f"Record: {filtered_record['label']} | "
        f"sampling rate: {sampling_rate:g} Hz | "
        f"samples: {raw_signal.size}"
    )
    if arguments.compile_pdf:
        compile_latex_report(report_path, OUTPUT_DIRECTORY, arguments.latex_engine)
        print(f"PDF report saved to: {report_path.with_suffix('.pdf')}")


if __name__ == "__main__":
    main()
