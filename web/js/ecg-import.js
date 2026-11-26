(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory(require("./qrs-detection.js"), require("./pt-wave-detection.js"));
    } else root.ECGLocalImport = factory(root.ECGQRS, root.ECGPT);
})(typeof globalThis !== "undefined" ? globalThis : this, function (detector, ptDetector) {
    "use strict";
    const MAX_SAMPLES = 100000;

    function readCsvRows(text, delimiter, skipHeader) {
        if (delimiter.length !== 1) throw new Error("Choose a valid separator.");
        const rows = []; let row = [], value = "", quoted = false, closed = false;
        const finishRow = () => {
            row.push(value);
            if (row.length > 1 || closed || row.some(cell => cell.trim() !== "")) rows.push(row);
            row = []; value = ""; closed = false;
            if (rows.length > MAX_SAMPLES + 1) throw new Error(`Import at most ${MAX_SAMPLES.toLocaleString("en-US")} samples.`);
        };
        text = text.replace(/^\uFEFF/, "");
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (quoted) {
                if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
                else if (c === '"') { quoted = false; closed = true; }
                else value += c;
            } else if (c === '"' && value === "" && !closed) quoted = true;
            else if (c === delimiter) { row.push(value); value = ""; closed = false; }
            else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; finishRow(); }
            else if (closed && c.trim() !== "") throw new Error("Invalid CSV quoting.");
            else if (c === '"') throw new Error("Invalid CSV quoting.");
            else if (!closed) value += c;
        }
        if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
        finishRow();
        if (skipHeader) rows.shift();
        return rows;
    }

    function inspectCsv(text, {delimiter = ",", skipHeader = false} = {}) {
        const rows = readCsvRows(text, delimiter, skipHeader);
        const widths = rows.map(row => row.length);
        return {rows: rows.length, columns: widths.length ? widths[0] : 0,
            consistentColumns: widths.every(width => width === widths[0])};
    }

    function parseCsv(text, {delimiter = ",", column = 0, skipHeader = false} = {}) {
        if (!Number.isInteger(column) || column < 0) throw new Error("Choose a valid signal column.");
        const rows = readCsvRows(text, delimiter, skipHeader);
        return rows.map((cells, i) => {
            const cell = cells[column]?.trim();
            if (!cell || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(cell) || !Number.isFinite(Number(cell))) {
                throw new Error(`Row ${i + 1 + Number(skipHeader)}: column ${column + 1} must contain a finite number. Check the header, separator and column.`);
            }
            return Number(cell);
        });
    }

    function validateRecord(record) {
        if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("The JSON must contain one ECG record.");
        if (!Number.isFinite(record.fs) || record.fs <= 80 || record.fs > 10000) throw new Error("Sampling rate must be above 80 Hz and at most 10,000 Hz.");
        if (!Array.isArray(record.ecg) || record.ecg.length < 28 || record.ecg.length > MAX_SAMPLES || !record.ecg.every(Number.isFinite)) {
            throw new Error("The signal must contain 28 to 100,000 finite numeric samples.");
        }
        const duration = record.ecg.length / record.fs;
        const source = record.intervals === undefined ? {} : record.intervals;
        if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Intervals must be an object with P, QRS and T arrays.");
        const intervals = {};
        for (const phase of ["P", "QRS", "T"]) {
            const values = source[phase] === undefined ? [] : source[phase];
            if (!Array.isArray(values)) throw new Error(`${phase} intervals must be an array.`);
            intervals[phase] = values.map(pair => {
                if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite)
                    || pair[0] < 0 || pair[1] <= pair[0] || pair[1] > duration) {
                    throw new Error(`${phase} intervals must satisfy 0 <= start < end <= signal duration, in seconds.`);
                }
                return [...pair];
            }).sort((a, b) => a[0] - b[0]);
            if (intervals[phase].some((pair, i) => i && pair[0] < intervals[phase][i - 1][1])) throw new Error(`${phase} intervals must not overlap.`);
        }
        return {label: typeof record.label === "string" && record.label.trim() ? record.label.trim() : "Imported ECG",
            fs: record.fs, ecg: record.ecg, intervals};
    }

    function parseRecord(text, filename, options = {}) {
        const json = /\.json$/i.test(filename);
        if (!json && !/\.csv$/i.test(filename)) throw new Error("Choose a .csv or .json file.");
        const source = json ? JSON.parse(text.replace(/^\uFEFF/, "")) : {
            label: filename.replace(/\.csv$/i, ""), fs: options.fs,
            ecg: parseCsv(text, options), intervals: {}
        };
        const record = validateRecord(source);
        const estimatedPhases = [];
        if (!record.intervals.QRS.length) {
            const detection = detector.detectQrs(record.ecg, record.fs);
            record.intervals.QRS = detection.intervals.QRS;
            record.detection = {method: detection.method, rPeaks: detection.rPeaks,
                parameters: detection.parameters, estimatedQrsBounds: true};
            estimatedPhases.push("QRS");
        }

        const missingPt = ["P", "T"].filter(phase =>
            !Object.prototype.hasOwnProperty.call(source.intervals || {}, phase));
        if (missingPt.length) {
            const pt = ptDetector.detectPt(record.ecg, record.fs, record.intervals.QRS);
            const occupied = Object.values(record.intervals).flat();
            for (const phase of missingPt) {
                record.intervals[phase] = pt.intervals[phase].filter(pair =>
                    !occupied.some(([start, end]) => pair[0] < end && pair[1] > start));
                occupied.push(...record.intervals[phase]);
            }
            record.detection = {...record.detection,
                pt: {method: pt.method, parameters: pt.parameters, estimatedPhases: missingPt}};
            estimatedPhases.push(...missingPt);
        }
        if (estimatedPhases.length) record.detection.estimatedPhases = estimatedPhases;
        return record;
    }
    return {parseCsv, inspectCsv, validateRecord, parseRecord, MAX_SAMPLES};
});
