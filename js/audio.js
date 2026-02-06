import { getOutputHz } from './tuning.js';
import { midiToName } from './midi.js';

// High-quality sampled piano pack stored locally in /samples/piano (MP3).
// Files are pitched notes; Tone.Sampler repitches between them.
const PIANO_BASE_URL = './samples/piano/';
const PIANO_URLS = {
  C1: 'C1.mp3', 'C#1': 'Cs1.mp3', D1: 'D1.mp3', 'D#1': 'Ds1.mp3', E1: 'E1.mp3',
  F1: 'F1.mp3', 'F#1': 'Fs1.mp3', G1: 'G1.mp3', 'G#1': 'Gs1.mp3', A1: 'A1.mp3', 'A#1': 'As1.mp3', B1: 'B1.mp3',

  C2: 'C2.mp3', 'C#2': 'Cs2.mp3', D2: 'D2.mp3', 'D#2': 'Ds2.mp3', E2: 'E2.mp3',
  F2: 'F2.mp3', 'F#2': 'Fs2.mp3', G2: 'G2.mp3', 'G#2': 'Gs2.mp3', A2: 'A2.mp3', 'A#2': 'As2.mp3', B2: 'B2.mp3',

  C3: 'C3.mp3', 'C#3': 'Cs3.mp3', D3: 'D3.mp3', 'D#3': 'Ds3.mp3', E3: 'E3.mp3',
  F3: 'F3.mp3', 'F#3': 'Fs3.mp3', G3: 'G3.mp3', 'G#3': 'Gs3.mp3', A3: 'A3.mp3', 'A#3': 'As3.mp3', B3: 'B3.mp3',

  C4: 'C4.mp3', 'C#4': 'Cs4.mp3', D4: 'D4.mp3', 'D#4': 'Ds4.mp3', E4: 'E4.mp3',
  F4: 'F4.mp3', 'F#4': 'Fs4.mp3', G4: 'G4.mp3', 'G#4': 'Gs4.mp3', A4: 'A4.mp3', 'A#4': 'As4.mp3', B4: 'B4.mp3',

  C5: 'C5.mp3', 'C#5': 'Cs5.mp3', D5: 'D5.mp3', 'D#5': 'Ds5.mp3', E5: 'E5.mp3',
  F5: 'F5.mp3', 'F#5': 'Fs5.mp3', G5: 'G5.mp3', 'G#5': 'Gs5.mp3', A5: 'A5.mp3', 'A#5': 'As5.mp3', B5: 'B5.mp3',

  C6: 'C6.mp3', 'C#6': 'Cs6.mp3', D6: 'D6.mp3', 'D#6': 'Ds6.mp3', E6: 'E6.mp3',
  F6: 'F6.mp3', 'F#6': 'Fs6.mp3', G6: 'G6.mp3', 'G#6': 'Gs6.mp3', A6: 'A6.mp3', 'A#6': 'As6.mp3', B6: 'B6.mp3',

  C7: 'C7.mp3', 'C#7': 'Cs7.mp3', D7: 'D7.mp3', 'D#7': 'Ds7.mp3', E7: 'E7.mp3',
  F7: 'F7.mp3', 'F#7': 'Fs7.mp3', G7: 'G7.mp3', 'G#7': 'Gs7.mp3', A7: 'A7.mp3', 'A#7': 'As7.mp3', B7: 'B7.mp3',

  C8: 'C8.mp3',
};

function linearToDb(v) {
  // Tone.Sampler.volume is in dB. Map a small linear slider into a useful dB range.
  const x = Math.max(0.0005, v);
  return 20 * Math.log10(x) + 12; // +12dB calibration for laptop/phone speakers
}

export class AudioEngine {
  constructor(ui, getState) {
    this.ui = ui;
    this.getState = getState;

    // WebAudio (synth)
    this.ctx = null;
    this.master = null;

    // Currently-held notes (both synth + sampler)
    this.activeNotes = new Map(); // midi -> voice

    // Synth voice pool
    this.voicePool = [];

    // Tone.js sampled piano
    this.sampler = null;
    this.samplerReady = false;
    this._samplerReadyPromise = null;
    this._samplerChain = null;

    // True when user has explicitly enabled audio for the *current* sound mode.
    this.enabled = false;
  }

  isEnabled() {
    return this.enabled;
  }

  async enable() {
    // Explicit user action enables whichever engine is currently selected.
    if (this.ui.wave.value === 'piano_samples') {
      await this.ensureSampledPiano();
      this.enabled = true;
      return;
    }
    await this.ensureSynth();
    this.enabled = true;
  }

  async disable() {
    // Called when switching sound modes to avoid glitches (old graph still connected, tails, etc.)
    this.stopAll();
    this.enabled = false;

    // Tear down Tone sampler chain (piano samples)
    try {
      if (this.sampler) {
        try { this.sampler.releaseAll?.(); } catch {}
        try { this.sampler.disconnect?.(); } catch {}
        try { this.sampler.dispose?.(); } catch {}
      }
    } catch {}
    this.sampler = null;
    this.samplerReady = false;
    this._samplerReadyPromise = null;

    try {
      if (this._samplerChain) {
        const { comp, rev } = this._samplerChain;
        try { comp?.disconnect?.(); } catch {}
        try { comp?.dispose?.(); } catch {}
        try { rev?.disconnect?.(); } catch {}
        try { rev?.dispose?.(); } catch {}
      }
    } catch {}
    this._samplerChain = null;

    // Tear down WebAudio ctx (synth)
    if (this.ctx) {
      try { await this.ctx.suspend(); } catch {}
      try { await this.ctx.close(); } catch {}
    }
    this.ctx = null;
    this.master = null;
    this.voicePool = [];
  }

  async ensureSynth() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = parseFloat(this.ui.vol.value);
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  async ensureSampledPiano() {
    if (this.samplerReady) return;
    if (this._samplerReadyPromise) return this._samplerReadyPromise;

    // Tone.js is loaded globally via a script tag.
    const Tone = window.Tone;
    if (!Tone) {
      console.warn('Tone.js not found. Did you include Tone.js before main.js?');
      return;
    }

    this._samplerReadyPromise = (async () => {
      // Must be called from a user gesture.
      await Tone.start();

      // Build a nicer chain: Sampler -> Compressor -> Reverb -> Destination
      const comp = new Tone.Compressor(-18, 3);
      const rev = new Tone.Reverb({ decay: 3.2, preDelay: 0.01, wet: 0.22 });
      await rev.generate();

      const sampler = new Tone.Sampler({
        urls: PIANO_URLS,
        baseUrl: PIANO_BASE_URL,
        release: 1.2,
        onload: () => {
          this.samplerReady = true;
        },
      });

      sampler.connect(comp);
      comp.connect(rev);
      rev.toDestination();

      // Volume
      sampler.volume.value = linearToDb(parseFloat(this.ui.vol.value));

      this.sampler = sampler;
      this._samplerChain = { comp, rev };

      // If onload didn't fire (rare), mark ready once Tone reports loaded.
      const start = performance.now();
      while (!this.samplerReady) {
        if (sampler.loaded) { this.samplerReady = true; break; }
        if (performance.now() - start > 15000) break;
        await new Promise(r => setTimeout(r, 50));
      }
    })();

    return this._samplerReadyPromise;
  }

  setVolume(v) {
    if (this.master) this.master.gain.value = v;
    if (this.sampler) this.sampler.volume.value = linearToDb(v);
  }
  polyLimit() { return parseInt(this.ui.poly.value, 10); }

  makeVoice() {
    const g = this.ctx.createGain();
    g.gain.value = 0.0;

    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const o3 = this.ctx.createOscillator();

    o1.type = 'sine'; o2.type = 'sine'; o3.type = 'sine';

    const g1 = this.ctx.createGain(); g1.gain.value = 1.00;
    const g2 = this.ctx.createGain(); g2.gain.value = 0.30;
    const g3 = this.ctx.createGain(); g3.gain.value = 0.12;

    o1.connect(g1).connect(g);
    o2.connect(g2).connect(g);
    o3.connect(g3).connect(g);
    g.connect(this.master);

    o1.start(); o2.start(); o3.start();
    return { g, o1, o2, o3, g1, g2, g3, midi: null, startedAt: 0 };
  }

  pickVoice() {
    const limit = this.polyLimit();
    if (this.voicePool.length < limit) {
      const v = this.makeVoice();
      this.voicePool.push(v);
      return v;
    }
    let oldest = null;
    for (const v of this.voicePool) if (!oldest || v.startedAt < oldest.startedAt) oldest = v;
    if (oldest && oldest.midi !== null) this.activeNotes.delete(oldest.midi);
    return oldest;
  }

  envelopeOn(gainNode) {
    const t = this.ctx.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setValueAtTime(gainNode.gain.value, t);
    gainNode.gain.setTargetAtTime(1.0, t, 0.008);
    gainNode.gain.setTargetAtTime(0.55, t + 0.06, 0.10);
  }

  envelopeOff(gainNode, hard=false) {
    const t = this.ctx.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    if (hard) { gainNode.gain.setValueAtTime(0.0, t); return; }
    gainNode.gain.setTargetAtTime(0.0, t, 0.06);
  }

  setVoiceHz(voice, hz) {
    const t = this.ctx.currentTime;
    const mode = this.ui.wave.value;
    if (mode === 'pianoish') {
      voice.o1.frequency.setTargetAtTime(hz, t, 0.01);
      voice.o2.frequency.setTargetAtTime(hz * 2, t, 0.01);
      voice.o3.frequency.setTargetAtTime(hz * 3, t, 0.01);
      voice.o1.type = 'sine'; voice.o2.type = 'sine'; voice.o3.type = 'sine';
      voice.g1.gain.value = 1.00; voice.g2.gain.value = 0.30; voice.g3.gain.value = 0.12;
    } else {
      voice.o1.type = mode; voice.o2.type = mode; voice.o3.type = mode;
      voice.g1.gain.value = 1.0; voice.g2.gain.value = 0.0; voice.g3.gain.value = 0.0;
      voice.o1.frequency.setTargetAtTime(hz, t, 0.01);
      voice.o2.frequency.setTargetAtTime(hz, t, 0.01);
      voice.o3.frequency.setTargetAtTime(hz, t, 0.01);
    }
  }

  press(midi) {
    const mode = this.ui.wave.value;

    // Require explicit enable (prevents glitchy mode switching + user-gesture headaches).
    if (!this.enabled) return;

    if (mode === 'piano_samples') {
      this.pressSampled(midi);
      return;
    }

    if (!this.ctx) return;
    if (this.activeNotes.has(midi)) return;

    const v = this.pickVoice();
    v.midi = midi;
    v.startedAt = performance.now();

    const { importedCurve, detuneMap } = this.getState();
    const { outHz } = getOutputHz(this.ui, importedCurve, detuneMap, midi);
    this.setVoiceHz(v, outHz);
    this.envelopeOn(v.g);

    this.activeNotes.set(midi, v);
  }

  async pressSampled(midi) {
    if (this.activeNotes.has(midi)) return;
    await this.ensureSampledPiano();
    if (!this.sampler || !this.samplerReady) return;

    // Best-sounding mode: play as a normal piano note (ignore hidden stretch/detune).
    const note = midiToName(midi);
    try {
      this.sampler.triggerAttack(note, undefined, 0.95);
      this.activeNotes.set(midi, { kind: 'sample', note });
    } catch (e) {
      console.warn('Sampler trigger failed', e);
    }
  }

  release(midi, hard=false) {
    const mode = this.ui.wave.value;
    if (mode === 'piano_samples') {
      this.releaseSampled(midi, hard);
      return;
    }

    const v = this.activeNotes.get(midi);
    if (!v) return;
    const { sustainOn } = this.getState();
    if (sustainOn && !hard) {
      this.envelopeOff(v.g, false);
      this.activeNotes.delete(midi);
      return;
    }
    this.envelopeOff(v.g, hard);
    this.activeNotes.delete(midi);
  }

  releaseSampled(midi, hard=false) {
    const v = this.activeNotes.get(midi);
    if (!v || !this.sampler) return;
    const { sustainOn } = this.getState();
    if (sustainOn && !hard) {
      try { this.sampler.triggerRelease(v.note); } catch {}
      this.activeNotes.delete(midi);
      return;
    }
    try { this.sampler.triggerRelease(v.note); } catch {}
    this.activeNotes.delete(midi);
  }

  stopAll() {
    const mode = this.ui.wave.value;
    if (mode === 'piano_samples') {
      for (const midi of Array.from(this.activeNotes.keys())) this.releaseSampled(midi, true);
      this.activeNotes.clear();
      return;
    }
    for (const midi of Array.from(this.activeNotes.keys())) this.release(midi, true);
    this.activeNotes.clear();
  }

  retuneAll() {
    // Sampled piano is musical-only (not used for tuning), so we don't live-retune it.
    if (this.ui.wave.value === 'piano_samples') return;
    if (!this.ctx) return;
    const { importedCurve, detuneMap } = this.getState();
    for (const [midi, v] of this.activeNotes) {
      const { outHz } = getOutputHz(this.ui, importedCurve, detuneMap, midi);
      this.setVoiceHz(v, outHz);
    }
  }

  trimVoices() {
    const limit = this.polyLimit();
    while (this.voicePool.length > limit) {
      const v = this.voicePool.pop();
      if (!v) continue;
      try { v.o1.stop(); v.o2.stop(); v.o3.stop(); } catch {}
      try { v.g.disconnect(); } catch {}
    }
  }
}
