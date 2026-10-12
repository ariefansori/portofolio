/**
 * ============================================================================
 * PROCEDURAL WEB AUDIO SYNTHESIZER
 * ============================================================================
 *
 * Semua suara digenerate langsung via Web Audio API tanpa file audio.
 */

let audioCtx = null;
let soundEnabled = false;
let engineOsc = null;
let engineGain = null;

/** Inisialisasi AudioContext dan node oscillator mesin. */
export function initAudio() {
    if (audioCtx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    engineOsc = audioCtx.createOscillator();
    engineGain = audioCtx.createGain();

    engineOsc.type = 'sawtooth';
    engineOsc.frequency.setValueAtTime(40, audioCtx.currentTime);
    engineGain.gain.setValueAtTime(0, audioCtx.currentTime);

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, audioCtx.currentTime);

    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineOsc.start();
}

/** Mengaktifkan / mematikan suara game. */
export function toggleSound() {
    if (!audioCtx) initAudio();
    soundEnabled = !soundEnabled;

    const soundIcon = document.getElementById('soundIcon');
    if (soundEnabled) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        if (soundIcon) soundIcon.className = "fa-solid fa-volume-high text-green-400";
    } else {
        if (engineGain) engineGain.gain.setValueAtTime(0, audioCtx.currentTime);
        if (soundIcon) soundIcon.className = "fa-solid fa-volume-xmark text-gray-400";
    }
}

/** Mengubah pitch & volume mesin berdasarkan persentase kecepatan. */
export function updateEngineAudio(speedPercent) {
    if (!soundEnabled || !engineOsc || !audioCtx) return;
    const pitch = 40 + (speedPercent * 160);
    const volume = 0.05 + (speedPercent * 0.1);
    engineOsc.frequency.setTargetAtTime(pitch, audioCtx.currentTime, 0.05);
    engineGain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.05);
}

/** Beep UI / checkpoint. */
export function playBeepSound(freq = 600, duration = 0.15) {
    if (!soundEnabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

/** Efek tabrakan / crash. */
export function playCrashSound() {
    if (!soundEnabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
}

/** Impact pneumatik pit crew. */
export function playImpactPneumaticSound() {
    if (!soundEnabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800 + Math.random() * 400, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
}

export function isSoundEnabled() {
    return soundEnabled;
}
