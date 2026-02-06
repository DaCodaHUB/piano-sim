import { getOutputHz } from './tuning.js';

export class AudioEngine {
  constructor(ui, getState) {
    this.ui = ui;
    this.getState = getState;
    this._unlocked = false;
    this.ctx = null;
    this.master = null;
    this.activeNotes = new Map(); // midi -> voice
    this.voicePool = [];
  }

  async enable() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = parseFloat(this.ui.vol.value);
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  async unlock() {
    await this.enable();

    // iOS unlock: play a tiny (nearly silent) buffer once
    const ctx = this.ctx;
    if (!ctx || this._unlocked) return;

    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master);
    source.start(0);
    source.stop(0);

    this._unlocked = true;
  }


  setVolume(v) { if (this.master) this.master.gain.value = v; }
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
    gainNode.gain.setTargetAtTime(0.75, t + 0.06, 0.10);
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

  release(midi, hard=false) {
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

  stopAll() {
    for (const midi of Array.from(this.activeNotes.keys())) this.release(midi, true);
    this.activeNotes.clear();
  }

  retuneAll() {
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
