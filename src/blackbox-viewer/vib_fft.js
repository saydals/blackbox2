/**
 * FFT vibration analysis engine — ported from the vibanalyse project
 * (Cooley-Tukey radix-2 FFT + Hanning windowing + Welch PSD averaging).
 *
 * Used by the FFT panel (FftPanel.vue) that overlays the graph area. The
 * header parsing / sample files / timeline of vibanalyse are NOT ported:
 * samples are extracted from the flight log the viewer already has open.
 */

/** Fast in-place radix-2 FFT */
export function complexFft(real, imag) {
    const n = real.length;
    if ((n & (n - 1)) !== 0) {
        throw new Error("FFT length must be a power of 2");
    }

    // Bit reversal permutation
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
        if (i < j) {
            const tempR = real[i];
            real[i] = real[j];
            real[j] = tempR;

            const tempI = imag[i];
            imag[i] = imag[j];
            imag[j] = tempI;
        }
        let k = n >> 1;
        while (k <= j) {
            j -= k;
            k >>= 1;
        }
        j += k;
    }

    // Butterfly updates
    for (let len = 2; len <= n; len <<= 1) {
        const halfLen = len >> 1;
        const angle = (-2 * Math.PI) / len;
        const wStepR = Math.cos(angle);
        const wStepI = Math.sin(angle);

        for (let i = 0; i < n; i += len) {
            let wR = 1.0;
            let wI = 0.0;

            for (let k = 0; k < halfLen; k++) {
                const uR = real[i + k];
                const uI = imag[i + k];
                const vIdx = i + k + halfLen;
                const vR = real[vIdx] * wR - imag[vIdx] * wI;
                const vI = real[vIdx] * wI + imag[vIdx] * wR;

                real[i + k] = uR + vR;
                imag[i + k] = uI + vI;
                real[vIdx] = uR - vR;
                imag[vIdx] = uI - vI;

                const nextWR = wR * wStepR - wI * wStepI;
                wI = wR * wStepI + wI * wStepR;
                wR = nextWR;
            }
        }
    }
}

/**
 * Welch's Method for smooth Power Spectral Density (PSD).
 * Splits data into overlapping segments, windows them, and averages the magnitudes.
 */
export function computeWelchPsd(data, sampleRate, windowSize = 1024, overlap = 0.5) {
    if (data.length < windowSize) {
        // Pad to window size if shorter
        const padded = new Float32Array(windowSize);
        padded.set(data);
        data = padded;
    }

    const step = Math.floor(windowSize * (1 - overlap));
    const numSegments = Math.max(1, Math.floor((data.length - windowSize) / step) + 1);

    const halfSize = windowSize / 2;
    const accumulatedPower = new Float32Array(halfSize);

    const real = new Float32Array(windowSize);
    const imag = new Float32Array(windowSize);

    // Pre-calculate Hanning window factors
    const windowFactors = new Float32Array(windowSize);
    let windowPowerSum = 0;
    for (let i = 0; i < windowSize; i++) {
        const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
        windowFactors[i] = w;
        windowPowerSum += w * w;
    }

    for (let seg = 0; seg < numSegments; seg++) {
        const offset = seg * step;

        // Remove DC offset (mean) for each segment
        let mean = 0;
        for (let i = 0; i < windowSize; i++) {
            mean += data[offset + i];
        }
        mean /= windowSize;

        // Apply window and remove DC
        for (let i = 0; i < windowSize; i++) {
            real[i] = (data[offset + i] - mean) * windowFactors[i];
            imag[i] = 0;
        }

        complexFft(real, imag);

        // Accumulate power (magnitude squared / window normalization)
        for (let i = 0; i < halfSize; i++) {
            const magSq = (real[i] * real[i] + imag[i] * imag[i]) / windowPowerSum;
            accumulatedPower[i] += magSq;
        }
    }

    const frequencies = new Float32Array(halfSize);
    const magnitudes = new Float32Array(halfSize);
    const freqStep = sampleRate / windowSize;

    for (let i = 0; i < halfSize; i++) {
        frequencies[i] = i * freqStep;
        // Amplitude spectral density (sqrt of averaged power, normalized)
        const avgPower = accumulatedPower[i] / numSegments;
        magnitudes[i] = (Math.sqrt(avgPower) * 2) / windowSize;
    }

    return { frequencies, magnitudes };
}

/**
 * Compute the gyro FFT (Roll/Pitch/Yaw) for the given sample arrays.
 * Arrays must already be converted to °/s by the caller.
 */
export function computeGyroFft(roll, pitch, yaw, sampleRate, windowSize = 1024) {
    const psdRoll = computeWelchPsd(roll, sampleRate, windowSize);
    const psdPitch = computeWelchPsd(pitch, sampleRate, windowSize);
    const psdYaw = computeWelchPsd(yaw, sampleRate, windowSize);

    return {
        frequencies: psdRoll.frequencies,
        roll: psdRoll.magnitudes,
        pitch: psdPitch.magnitudes,
        yaw: psdYaw.magnitudes,
        sampleRate,
    };
}
