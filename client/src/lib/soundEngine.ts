/**
 * soundEngine.ts — Procedural Web Audio API sound synthesizer for the agentic pipeline activity console.
 *
 * All sounds are generated mathematically (no audio files). Each sound is designed to be
 * subtle and non-intrusive, appropriate for a SOC analyst environment.
 *
 * Sounds:
 *   stepComplete  — Short click/tick (sine burst, 800Hz, 40ms)
 *   agentActivate — Soft rising tone (frequency sweep 400→800Hz, 120ms)
 *   analysisDone  — Pleasant two-tone chime (C5→E5 major third, 300ms)
 *   errorTone     — Low descending buzz (sawtooth 300→150Hz, 200ms)
 *   safetyConfirm — Quick double-beep confirmation (1000Hz × 2, 150ms)
 */

// ── Singleton AudioContext (lazy init to comply with autoplay policy) ────────

let _ctx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!_ctx || _ctx.state === "closed") {
    _ctx = new AudioContext();
  }
  // Resume if suspended (browser autoplay policy)
  if (_ctx.state === "suspended") {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

// ── Mute state (persisted to localStorage) ──────────────────────────────────

const MUTE_KEY = "dang-sound-muted";

function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "true";
  } catch {
    return false;
  }
}

function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
  } catch {
    // localStorage unavailable
  }
}

function toggleMute(): boolean {
  const next = !isMuted();
  setMuted(next);
  return next;
}

// ── Master volume (keep sounds subtle) ──────────────────────────────────────

const MASTER_VOLUME = 0.12;

// ── Sound generators ────────────────────────────────────────────────────────

/**
 * Short click/tick when a pipeline step completes.
 * Sine wave burst at 800Hz, 40ms duration with fast attack/decay.
 */
function playStepComplete(): void {
  if (isMuted()) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.02);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(MASTER_VOLUME * 0.8, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  } catch {
    // Web Audio not available
  }
}

/**
 * Soft rising tone when an agent becomes active.
 * Sine sweep from 400Hz to 800Hz over 120ms.
 */
function playAgentActivate(): void {
  if (isMuted()) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.12);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(MASTER_VOLUME * 0.6, now + 0.02);
    gain.gain.setValueAtTime(MASTER_VOLUME * 0.6, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  } catch {
    // Web Audio not available
  }
}

/**
 * Pleasant two-tone chime when full analysis completes.
 * C5 (523Hz) then E5 (659Hz) — a major third interval, 300ms total.
 */
function playAnalysisDone(): void {
  if (isMuted()) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // First tone: C5
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(MASTER_VOLUME, now + 0.01);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.26);

    // Second tone: E5 (delayed 100ms)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(659.25, now + 0.1);

    gain2.gain.setValueAtTime(0, now + 0.1);
    gain2.gain.linearRampToValueAtTime(MASTER_VOLUME * 1.1, now + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.41);

    // Subtle harmonic overlay for richness
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = "sine";
    osc3.frequency.setValueAtTime(1318.5, now + 0.1); // E6 (octave above)

    gain3.gain.setValueAtTime(0, now + 0.1);
    gain3.gain.linearRampToValueAtTime(MASTER_VOLUME * 0.3, now + 0.12);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.1);
    osc3.stop(now + 0.36);
  } catch {
    // Web Audio not available
  }
}

/**
 * Low descending buzz for error states.
 * Sawtooth wave sweeping from 300Hz to 150Hz over 200ms.
 */
function playErrorTone(): void {
  if (isMuted()) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.2);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(MASTER_VOLUME * 0.5, now + 0.01);
    gain.gain.setValueAtTime(MASTER_VOLUME * 0.5, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.23);
  } catch {
    // Web Audio not available
  }
}

/**
 * Quick double-beep for safety validation confirmation.
 * Two short 1000Hz sine beeps, 60ms each, 40ms gap.
 */
function playSafetyConfirm(): void {
  if (isMuted()) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // First beep
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(1000, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(MASTER_VOLUME * 0.6, now + 0.005);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.07);

    // Second beep (higher pitch)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1200, now + 0.1);

    gain2.gain.setValueAtTime(0, now + 0.1);
    gain2.gain.linearRampToValueAtTime(MASTER_VOLUME * 0.7, now + 0.105);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.17);
  } catch {
    // Web Audio not available
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export const SoundEngine = {
  /** Play the step-complete click */
  stepComplete: playStepComplete,
  /** Play the agent-activate rising tone */
  agentActivate: playAgentActivate,
  /** Play the analysis-done chime */
  analysisDone: playAnalysisDone,
  /** Play the error buzz */
  errorTone: playErrorTone,
  /** Play the safety-confirm double-beep */
  safetyConfirm: playSafetyConfirm,

  /** Check if sounds are muted */
  isMuted,
  /** Set mute state */
  setMuted,
  /** Toggle mute and return new state */
  toggleMute,

  /** Play appropriate sound for an agent step status change */
  playForStep(agent: string, status: string): void {
    switch (status) {
      case "running":
        playAgentActivate();
        break;
      case "complete":
        if (agent === "safety_validator") {
          playSafetyConfirm();
        } else {
          playStepComplete();
        }
        break;
      case "error":
      case "blocked":
        playErrorTone();
        break;
    }
  },
} as const;

export type SoundEngineType = typeof SoundEngine;
