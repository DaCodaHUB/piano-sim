import { nameToMidi, MIDI_START, MIDI_END } from './midi.js';

export class CaptureController {
  constructor(ui, audio, setSelectedMidi, syncTuneSlider, updateDebug, updateKeyHighlights) {
    this.ui = ui;
    this.audio = audio;
    this.setSelectedMidi = setSelectedMidi;
    this.syncTuneSlider = syncTuneSlider;
    this.updateDebug = updateDebug;
    this.updateKeyHighlights = updateKeyHighlights;

    this.list = [];
    this.idx = 0;
    this.timer = null;
    this.running = false;
  }

  buildList() {
    const mode = this.ui.capPreset.value;
    const list = [];

    if (mode === "A_octaves") {
      for (let m = 21; m <= 105; m += 12) list.push(m);
    } else if (mode === "C_octaves") {
      for (let m = 24; m <= 108; m += 12) list.push(m);
    } else if (mode === "every_octave_root") {
      const anchors = ["C", "F", "A"];
      for (let oct = 1; oct <= 7; oct++) {
        for (const a of anchors) {
          const midi = nameToMidi(a + oct);
          if (midi && midi >= MIDI_START && midi <= MIDI_END) list.push(midi);
        }
      }
      list.unshift(21);
      if (!list.includes(108)) list.push(108);
    } else if (mode === "every_6th") {
      for (let m = MIDI_START; m <= MIDI_END; m += 6) list.push(m);
    } else if (mode === "custom") {
      const raw = this.ui.capCustom.value.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
      for (const tok of raw) {
        const midi = nameToMidi(tok);
        if (midi && midi >= MIDI_START && midi <= MIDI_END) list.push(midi);
      }
    }

    const seen = new Set();
    return list.filter(m => (seen.has(m) ? false : (seen.add(m), true)));
  }

  updateUI() {
    this.ui.capSecondsV.textContent = parseFloat(this.ui.capSeconds.value).toFixed(1);
    this.ui.capGapV.textContent = parseInt(this.ui.capGap.value, 10).toString();

    if (!this.running) {
      this.ui.capNow.textContent = "—";
      this.ui.capProg.textContent = "—";
      return;
    }
    const midi = this.list[this.idx] ?? null;
    this.ui.capNow.textContent = midi ? this.ui.midiToName(midi) : "—";
    this.ui.capProg.textContent = `${this.idx + 1} / ${this.list.length}`;
  }

  playIndex(i) {
    if (!this.audio.ctx) return;
    this.idx = Math.max(0, Math.min(i, this.list.length - 1));
    const midi = this.list[this.idx];

    this.setSelectedMidi(midi);
    this.syncTuneSlider();
    this.updateDebug();

    this.audio.stopAll();
    this.audio.press(midi);
    this.updateKeyHighlights();
    this.updateUI();

    const holdMs = parseFloat(this.ui.capSeconds.value) * 1000;
    const gapMs = parseInt(this.ui.capGap.value, 10);

    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.audio.release(midi);
      this.updateKeyHighlights();
      if (!this.running) return;
      this.timer = setTimeout(() => {
        if (!this.running) return;
        if (this.idx + 1 < this.list.length) this.playIndex(this.idx + 1);
        else this.stop();
      }, gapMs);
    }, holdMs);
  }

  start() {
    this.list = this.buildList();
    if (!this.list.length) {
      this.ui.capNow.textContent = "No notes in sequence";
      return;
    }
    this.running = true;
    this.ui.capStart.disabled = true;
    this.ui.capNext.disabled = false;
    this.ui.capRepeat.disabled = false;
    this.ui.capStop.disabled = false;

    this.playIndex(0);
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = null;

    this.ui.capStart.disabled = false;
    this.ui.capNext.disabled = true;
    this.ui.capRepeat.disabled = true;
    this.ui.capStop.disabled = true;

    this.audio.stopAll();
    this.updateKeyHighlights();
    this.updateUI();
  }

  next() { this.playIndex(this.idx + 1); }
  repeat() { this.playIndex(this.idx); }
}
