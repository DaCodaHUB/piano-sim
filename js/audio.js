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
  // v in [0..1]
  const clamped = Math.max(0.0001, Math.min(1, v));
  return 20 * Math.log10(clamped);
}

export class AudioEngine {
  constructor(ui, getState) {
    this.ui = ui;
    this.getState = getState;
    this.ctx = null;
    this.master = null;
    this.activeNotes = new Map(); // midi -> voice
    this.voicePool = [];

    // Tone.js sampled piano
    this.sampler = null;
    this.samplerReady = false;
    this._samplerReadyPromise = null;
    this._samplerChain = null;
  }

  async enable() {
    // Enable whichever engine is currently selected.
    if (this.ui.wave.value === 'piano_samples') {
      await this.ensureSampledPiano();
      return;
    }
    await this.ensureSynth();
  }

  disable() {
    // Force the user to re-enable audio after mode changes.
    // Stop ringing notes (both synth + sampler).
    try { this.stopAll(); } catch (e) {}

    // Suspend WebAudio context (synth modes).
    try {
      if (this.ctx && this.ctx.state === 'running') {
        this.ctx.suspend();
      }
    } catch (e) {
      console.warn('WebAudio suspend failed:', e);
    }

    // Suspend Tone.js context (sampled piano).
    try {
      const Tone = window.Tone;
      const tctx = Tone?.getContext ? Tone.getContext() : Tone?.context;
      const raw = tctx?.rawContext ?? tctx;
      if (raw?.state === 'running' && raw?.suspend) {
        raw.suspend();
      }
    } catch (e) {
      console.warn('Tone suspend failed:', e);
    }
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
    // Tone.js is loaded globally via a script tag.
    const Tone = window.Tone;
    if (!Tone) {
      console.warn('Tone.js not found. Did you include Tone.js before main.js?');
      return;
    }

    // Always make sure Tone's AudioContext is running (user gesture required).
    try {
      const tctx = Tone.getContext ? Tone.getContext() : Tone.context;
      if (tctx && tctx.state !== 'running') {
        await Tone.start();
      }
    } catch (e) {
      console.warn('Tone.start() failed:', e);
    }

    if (this.samplerReady) return;
    if (this._samplerReadyPromise) return this._samplerReadyPromise;

    this._samplerReadyPromise = (async () => {
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
      // Tone.Sampler has a `loaded` boolean in many versions.
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

    o1.type =
      (this.ui.wave.value === 'sine') ? 'sine' :
        (this.ui.wave.value === 'square') ? 'square' :
          (this.ui.wave.value === 'sawtooth') ? 'sawtooth' :
            (this.ui.wave.value === 'triangle') ? 'triangle' : 'sine';

    o2.type = o1.type;
    o3.type = o1.type;

    o1.detune.value = 0;
    o2.detune.value = 0;
    o3.detune.value = 0;

    // Simple "piano-ish" detune stack for thickness.
    const g1 = this.ctx.createGain(); g1.gain.value = 0.60;
    const g2 = this.ctx.createGain(); g2.gain.value = 0.30;
    const g3 = this.ctx.createGain(); g3.gain.value = 0.10;

    o1.connect(g1);
    o2.connect(g2);
    o3.connect(g3);

    g1.connect(g);
    g2.connect(g);
    g3.connect(g);

    // ADSR envelope on g.gain
    g.connect(this.master);

    o1.start();
    o2.start();
    o3.start();

    return { g, o1, o2, o3, on: false, midi: null, hz: null };
  }

  pickVoice(midi) {
    // If already active, reuse
    if (this.activeNotes.has(midi)) return this.activeNotes.get(midi);

    // Find free voice
    let v = this.voicePool.find(x => !x.on);
    if (!v) {
      // Create new voice if under poly limit, else steal oldest
      if (this.voicePool.length < this.polyLimit()) {
        v = this.makeVoice();
        this.voicePool.push(v);
      } else {
        // steal first active
        v = this.voicePool.find(x => x.on) || this.voicePool[0];
        this.envelopeOff(v);
        this.activeNotes.delete(v.midi);
      }
    }

    v.on = true;
    v.midi = midi;
    this.activeNotes.set(midi, v);
    return v;
  }

  envelopeOn(v) {
    const now = this.ctx.currentTime;
    v.g.gain.cancelScheduledValues(now);
    v.g.gain.setValueAtTime(v.g.gain.value, now);
    v.g.gain.linearRampToValueAtTime(1.0, now + 0.005);
    v.g.gain.exponentialRampToValueAtTime(0.35, now + 0.08);
  }

  envelopeOff(v) {
    const now = this.ctx.currentTime;
    v.g.gain.cancelScheduledValues(now);
    v.g.gain.setValueAtTime(v.g.gain.value, now);
    v.g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    v.on = false;
  }

  setVoiceHz(v, hz) {
    v.hz = hz;
    v.o1.frequency.setValueAtTime(hz, this.ctx.currentTime);
    v.o2.frequency.setValueAtTime(hz * 2, this.ctx.currentTime);
    v.o3.frequency.setValueAtTime(hz * 3, this.ctx.currentTime);
  }

  press(midi) {
    if (this.ui.wave.value === 'piano_samples') {
      this.pressSampled(midi);
      return;
    }

    if (!this.ctx) return;
    const s = this.getState();
    const a4 = s.importedCurve?.a4 ?? null;
    const hz = getOutputHz(a4 ?? 440, midi, s.importedCurve, s.detuneMap);

    const v = this.pickVoice(midi);
    this.setVoiceHz(v, hz);
    this.envelopeOn(v);
  }

  pressSampled(midi) {
    const Tone = window.Tone;
    if (!Tone || !this.sampler) return;

    const s = this.getState();
    const a4 = s.importedCurve?.a4 ?? null;
    const outHz = getOutputHz(a4 ?? 440, midi, s.importedCurve, s.detuneMap);

    // Tone.Sampler plays by note name; we want exact Hz.
    // Use sampler.triggerAttackRelease with frequency directly.
    const dur = 2.5; // seconds; release tail controlled by sampler.release
    this.sampler.triggerAttackRelease(outHz, dur);
  }

  release(midi) {
    if (this.ui.wave.value === 'piano_samples') {
      this.releaseSampled(midi);
      return;
    }
    if (!this.ctx) return;
    if (!this.activeNotes.has(midi)) return;
    const v = this.activeNotes.get(midi);
    this.envelopeOff(v);
    this.activeNotes.delete(midi);
  }

  releaseSampled(_midi) {
    // For simple sampled piano mode we use triggerAttackRelease, so release is implicit.
  }

  stopAll() {
    // Synth voices
    if (this.ctx) {
      for (const v of this.voicePool) {
        try { this.envelopeOff(v); } catch (e) {}
      }
      this.activeNotes.clear();
    }

    // Sampled
    if (this.sampler && this.sampler.releaseAll) {
      try { this.sampler.releaseAll(); } catch (e) {}
    }
  }

  trimVoices() {
    const limit = this.polyLimit();
    if (this.voicePool.length <= limit) return;
    // Turn off extra voices
    for (let i = limit; i < this.voicePool.length; i++) {
      const v = this.voicePool[i];
      try { this.envelopeOff(v); } catch (e) {}
      if (v.midi != null) this.activeNotes.delete(v.midi);
    }
    this.voicePool.length = limit;
  }

  retuneAll() {
    const s = this.getState();
    const a4 = s.importedCurve?.a4 ?? null;

    // Update synth voices
    if (this.ctx) {
      for (const [midi, v] of this.activeNotes.entries()) {
        const hz = getOutputHz(a4 ?? 440, midi, s.importedCurve, s.detuneMap);
        this.setVoiceHz(v, hz);
      }
    }

    // Sampled: we trigger one-shots, so no continuous retune needed.
  }
}
