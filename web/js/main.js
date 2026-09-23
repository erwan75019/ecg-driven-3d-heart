const ecgCanvas = document.getElementById("ecg-canvas");
const ecgContext = ecgCanvas.getContext("2d");

function drawGrid(context, width, height) {
    const smallGridSize = 10;
    const largeGridSize = smallGridSize * 5;

    context.lineWidth = 1;

    for (let x = smallGridSize; x < width; x += smallGridSize) {
        const isLargeLine = x % largeGridSize === 0;
        context.strokeStyle = isLargeLine ? "#fecaca" : "#fee2e2";
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
    }

    for (let y = smallGridSize; y < height; y += smallGridSize) {
        const isLargeLine = y % largeGridSize === 0;
        context.strokeStyle = isLargeLine ? "#fecaca" : "#fee2e2";
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
    }
}

function drawHeartbeat(context, startX, baselineY, beatWidth, amplitude) {
    context.moveTo(startX, baselineY);

    // Baseline and P wave
    context.lineTo(startX + beatWidth * 0.10, baselineY);
    context.bezierCurveTo(
        startX + beatWidth * 0.13,
        baselineY,
        startX + beatWidth * 0.14,
        baselineY - amplitude * 0.13,
        startX + beatWidth * 0.18,
        baselineY - amplitude * 0.13
    );
    context.bezierCurveTo(
        startX + beatWidth * 0.22,
        baselineY - amplitude * 0.13,
        startX + beatWidth * 0.23,
        baselineY,
        startX + beatWidth * 0.27,
        baselineY
    );

    // QRS complex
    context.lineTo(startX + beatWidth * 0.34, baselineY);
    context.lineTo(startX + beatWidth * 0.37, baselineY + amplitude * 0.16);
    context.lineTo(startX + beatWidth * 0.40, baselineY - amplitude);
    context.lineTo(startX + beatWidth * 0.43, baselineY + amplitude * 0.34);
    context.lineTo(startX + beatWidth * 0.47, baselineY);

    // ST segment and T wave
    context.lineTo(startX + beatWidth * 0.58, baselineY);
    context.bezierCurveTo(
        startX + beatWidth * 0.63,
        baselineY,
        startX + beatWidth * 0.66,
        baselineY - amplitude * 0.32,
        startX + beatWidth * 0.72,
        baselineY - amplitude * 0.32
    );
    context.bezierCurveTo(
        startX + beatWidth * 0.78,
        baselineY - amplitude * 0.32,
        startX + beatWidth * 0.80,
        baselineY,
        startX + beatWidth * 0.86,
        baselineY
    );
    context.lineTo(startX + beatWidth, baselineY);
}

function drawEcg() {
    const bounds = ecgCanvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;

    ecgCanvas.width = Math.round(bounds.width * pixelRatio);
    ecgCanvas.height = Math.round(bounds.height * pixelRatio);

    ecgContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ecgContext.fillStyle = "#ffffff";
    ecgContext.fillRect(0, 0, bounds.width, bounds.height);

    drawGrid(ecgContext, bounds.width, bounds.height);

    const horizontalPadding = 20;
    const baselineY = bounds.height * 0.55;
    const beatWidth = (bounds.width - horizontalPadding * 2) / 2;
    const amplitude = Math.min(bounds.height * 0.38, beatWidth * 0.42);

    ecgContext.strokeStyle = "#dc2626";
    ecgContext.lineWidth = 2.5;
    ecgContext.lineCap = "round";
    ecgContext.lineJoin = "round";
    ecgContext.beginPath();
    drawHeartbeat(ecgContext, horizontalPadding, baselineY, beatWidth, amplitude);
    drawHeartbeat(
        ecgContext,
        horizontalPadding + beatWidth,
        baselineY,
        beatWidth,
        amplitude
    );
    ecgContext.stroke();
}

drawEcg();
window.addEventListener("resize", drawEcg);
