import { midiToName, isBlack, MIDI_START, MIDI_END, A4_MIDI } from './midi.js';
import { getOutputHz, getTargetCents, exportTruthCurve } from './tuning.js';
import { AudioEngine } from './audio.js';
import { CaptureController } from './capture.js';

export function initApp() {
  const ui = {
    tabPlay: document.getElementById('tabPlay'),
    tabCapture: document.getElementById('tabCapture'),
    tabTune: document.getElementById('tabTune'),
    panePlay: document.getElementById('panePlay'),
    paneCapture: document.getElementById('paneCapture'),
    paneTune: document.getElementById('paneTune'),

    btnStartAudio: document.getElementById('btnStartAudio'),
    btnStopAll: document.getElementById('btnStopAll'),
    audioStatus: document.getElementById('audioStatus'),

    wave: document.getElementById('wave'),
    poly: document.getElementById('poly'),
    vol: document.getElementById('vol'),
    sustain: document.getElementById('sustain'),

    a4: document.getElementById('a4'),
    a4v: document.getElementById('a4v'),
    pianoReality: document.getElementById('pianoReality'),
    preset: document.getElementById('preset'),
    lowEx: document.getElementById('lowEx'),
    highEx: document.getElementById('highEx'),
    shape: document.getElementById('shape'),
    lowExV: document.getElementById('lowExV'),
    highExV: document.getElementById('highExV'),
    shapeV: document.getElementById('shapeV'),

    selNote: document.getElementById('selNote'),
    dbgEt: document.getElementById('dbgEt'),
    dbgRealityC: document.getElementById('dbgRealityC'),
    dbgRealityHz: document.getElementById('dbgRealityHz'),
    dbgDetune: document.getElementById('dbgDetune'),
    dbgOutHz: document.getElementById('dbgOutHz'),

    keysEl: document.getElementById('keys'),

    capPreset: document.getElementById('capPreset'),
    capSeconds: document.getElementById('capSeconds'),
    capSecondsV: document.getElementById('capSecondsV'),
    capGap: document.getElementById('capGap'),
    capGapV: document.getElementById('capGapV'),
    capStart: document.getElementById('capStart'),
    capNext: document.getElementById('capNext'),
    capRepeat: document.getElementById('capRepeat'),
    capStop: document.getElementById('capStop'),
    capNow: document.getElementById('capNow'),
    capProg: document.getElementById('capProg'),
    capCustom: document.getElementById('capCustom'),
    midiToName: midiToName,

    tuneTarget: document.getElementById('tuneTarget'),
    detune: document.getElementById('detune'),
    detuneV: document.getElementById('detuneV'),
    btnRandomDetune: document.getElementById('btnRandomDetune'),
    btnSnapToTarget: document.getElementById('btnSnapToTarget'),

    curveJson: document.getElementById('curveJson'),
    btnExportTruth: document.getElementById('btnExportTruth'),
    btnApplyImport: document.getElementById('btnApplyImport'),
    importStatus: document.getElementById('importStatus'),
  };

  let selectedMidi = A4_MIDI;
  let importedCurve = null;
  let importedA4 = null;
  const detuneMap = new Map();
  let sustainOn = (ui.sustain.value === 'on');

  const keyDivs = new Map();

  const audio = new AudioEngine(ui, () => ({ importedCurve, detuneMap, selectedMidi, sustainOn }));

  function setAudioUiEnabled(enabled, msg) {
    ui.btnStartAudio.disabled = enabled;
    ui.btnStopAll.disabled = !enabled;
    if (ui.audioStatus) ui.audioStatus.textContent = msg || (enabled ? 'Audio enabled.' : 'Audio is disabled. Click “Enable Audio”.');
  }

  setAudioUiEnabled(false);

  function setTab(which) {
    ui.tabPlay.classList.remove('active');
    ui.tabCapture.classList.remove('active');
    ui.tabTune.classList.remove('active');
    ui.panePlay.style.display = 'none';
    ui.paneCapture.style.display = 'none';
    ui.paneTune.style.display = 'none';

    if (which === 'play') { ui.tabPlay.classList.add('active'); ui.panePlay.style.display = 'block'; }
    if (which === 'capture') { ui.tabCapture.classList.add('active'); ui.paneCapture.style.display = 'block'; }
    if (which === 'tune') { ui.tabTune.classList.add('active'); ui.paneTune.style.display = 'block'; }
  }
  ui.tabPlay.onclick = () => setTab('play');
  ui.tabCapture.onclick = () => setTab('capture');
  ui.tabTune.onclick = () => setTab('tune');

  const fmtHz = (x) => x.toFixed(3);
  const fmtC = (x) => x.toFixed(1);

  function updateDebug() {
    const setText = (el, text) => { if (el) el.textContent = text; };

    setText(ui.a4v, parseFloat(ui.a4.value).toFixed(1));
    setText(ui.lowExV, parseFloat(ui.lowEx.value).toFixed(1));
    setText(ui.highExV, parseFloat(ui.highEx.value).toFixed(1));
    setText(ui.shapeV, parseFloat(ui.shape.value).toFixed(2));

    setText(ui.selNote, `${midiToName(selectedMidi)} (MIDI ${selectedMidi})`);

    const { et, realityC, realityHz, detuneC, outHz } = getOutputHz(ui, importedCurve, detuneMap, selectedMidi);
    const fmtHz = (x) => x.toFixed(3);
    const fmtC = (x) => x.toFixed(1);

    setText(ui.dbgEt, fmtHz(et));
    setText(ui.dbgRealityC, fmtC(realityC));
    setText(ui.dbgRealityHz, fmtHz(realityHz));
    setText(ui.dbgDetune, fmtC(detuneC));
    setText(ui.dbgOutHz, fmtHz(outHz));
  }

  function scheduleUpdate() {
    requestAnimationFrame(() => {
      updateDebug();
      audio.retuneAll();
    });
  }

  function applyPreset(p) {
    if (p === "mild") { ui.lowEx.value = "-10"; ui.highEx.value = "20"; ui.shape.value = "1.5"; }
    if (p === "medium") { ui.lowEx.value = "-15"; ui.highEx.value = "35"; ui.shape.value = "1.6"; }
    if (p === "strong") { ui.lowEx.value = "-25"; ui.highEx.value = "55"; ui.shape.value = "1.8"; }
    scheduleUpdate();
  }
  ui.preset.onchange = () => applyPreset(ui.preset.value);

  function requireAudioOrMessage() {
    if (audio.isEnabled()) return true;
    setAudioUiEnabled(false, 'Audio is disabled. Click “Enable Audio”.');
    return false;
  }

  function attachKeyHandlers(div, midi) {
    const down = (e) => {
      e.preventDefault();
      selectedMidi = midi;
      syncTuneSliderFromSelected();
      updateDebug();

      if (!requireAudioOrMessage()) return;

      audio.press(midi);
      updateKeyHighlights();
    };
    const up = (e) => {
      e.preventDefault();
      audio.release(midi);
      updateKeyHighlights();
      updateDebug();
    };
    div.addEventListener('pointerdown', down);
    div.addEventListener('pointerup', up);
    div.addEventListener('pointerleave', up);
    div.addEventListener('pointercancel', up);
  }

  function renderKeyboard() {
    ui.keysEl.innerHTML = '';
    keyDivs.clear();

    const rootStyle = getComputedStyle(document.documentElement);
    const whiteWidth = parseFloat(rootStyle.getPropertyValue('--whiteW')) || 26;
    // Keep black-key offsets proportional to the white key width.
    const offsetScale = whiteWidth / 26;
    let whiteIndex = 0;

    for (let midi = MIDI_START; midi <= MIDI_END; midi++) {
      if (isBlack(midi)) continue;
      const d = document.createElement('div');
      d.className = 'white';
      d.style.left = (whiteIndex * whiteWidth) + 'px';

      const lbl = document.createElement('div');
      lbl.className = 'keylabel';
      lbl.textContent = midiToName(midi);
      d.appendChild(lbl);

      attachKeyHandlers(d, midi);
      ui.keysEl.appendChild(d);
      keyDivs.set(midi, d);
      whiteIndex++;
    }

    for (let midi = MIDI_START; midi <= MIDI_END; midi++) {
      if (!isBlack(midi)) continue;
      const d = document.createElement('div');
      d.className = 'black';

      const n = midi % 12;
      let offset = 18 * offsetScale;
      if (n === 6) offset = 16 * offsetScale;

      let w = 0;
      for (let m = MIDI_START; m <= midi; m++) if (!isBlack(m)) w++;
      const left = (w - 1) * whiteWidth + offset;
      d.style.left = left + 'px';

      const lbl = document.createElement('div');
      lbl.className = 'keylabel blackLbl';
      lbl.textContent = midiToName(midi);
      d.appendChild(lbl);

      attachKeyHandlers(d, midi);
      ui.keysEl.appendChild(d);
      keyDivs.set(midi, d);
    }

    updateKeyHighlights();
  }

  function updateKeyHighlights() {
    for (const div of keyDivs.values()) div.classList.remove('active');
    for (const midi of audio.activeNotes.keys()) {
      const div = keyDivs.get(midi);
      if (div) div.classList.add('active');
    }
  }

  const qwertyMap = new Map([
    ["A", 60], ["W", 61], ["S", 62], ["E", 63], ["D", 64], ["F", 65],
    ["T", 66], ["G", 67], ["Y", 68], ["H", 69], ["U", 70], ["J", 71],
  ]);
  const keysDown = new Set();

  window.addEventListener('keydown', (e) => {
    const k = (e.key || '').toUpperCase();
    if (!qwertyMap.has(k)) return;
    if (keysDown.has(k)) return;

    if (!requireAudioOrMessage()) return;

    keysDown.add(k);

    selectedMidi = qwertyMap.get(k);
    syncTuneSliderFromSelected();
    updateDebug();

    audio.press(selectedMidi);
    updateKeyHighlights();
  });

  window.addEventListener('keyup', (e) => {
    const k = (e.key || '').toUpperCase();
    if (!qwertyMap.has(k)) return;
    keysDown.delete(k);

    audio.release(qwertyMap.get(k));
    updateKeyHighlights();
    updateDebug();
  });

  ui.btnStartAudio.onclick = () => {
    ui.btnStartAudio.disabled = true;
    if (ui.audioStatus) ui.audioStatus.textContent = 'Enabling audio…';

    audio.enable()
      .then(() => {
        setAudioUiEnabled(true, ui.wave.value === 'piano_samples'
          ? 'Audio enabled (piano samples).'
          : 'Audio enabled (synth).');
        scheduleUpdate();
      })
      .catch((e) => {
        console.warn('Audio enable failed:', e);
        setAudioUiEnabled(false, 'Audio enable failed. Click “Enable Audio” to retry.');
      });
  };

  ui.btnStopAll.onclick = () => { audio.stopAll(); updateKeyHighlights(); updateDebug(); };

  ui.vol.oninput = () => audio.setVolume(parseFloat(ui.vol.value));
  ui.sustain.onchange = () => { sustainOn = (ui.sustain.value === 'on'); };
  ui.poly.onchange = () => { audio.trimVoices(); };

  ui.wave.onchange = async () => {
    // Your request: when changing sound, hard-disable audio so the user can re-enable cleanly.
    // This prevents glitchy sampler/synth transitions and ensures a fresh graph.
    keysDown.clear();
    try {
      await audio.disable();
    } catch (e) {
      console.warn('Audio disable failed on wave change:', e);
    }
    updateKeyHighlights();
    setAudioUiEnabled(false, 'Sound changed. Click “Enable Audio” to continue.');
    scheduleUpdate();
  };

  function syncTuneSliderFromSelected() {
    const c = detuneMap.get(selectedMidi) ?? 0;
    ui.detune.value = c.toFixed(1);
    ui.detuneV.textContent = parseFloat(ui.detune.value).toFixed(1);
  }

  function setDetuneForSelected(cents) {
    detuneMap.set(selectedMidi, cents);
    ui.detune.value = cents.toFixed(1);
    ui.detuneV.textContent = parseFloat(ui.detune.value).toFixed(1);
    scheduleUpdate();
  }

  ui.detune.oninput = () => {
    const c = parseFloat(ui.detune.value);
    detuneMap.set(selectedMidi, c);
    ui.detuneV.textContent = c.toFixed(1);
    scheduleUpdate();
  };

  document.querySelectorAll('.detStep').forEach(btn => {
    btn.addEventListener('click', () => {
      const step = parseFloat(btn.dataset.step);
      const cur = detuneMap.get(selectedMidi) ?? 0;
      setDetuneForSelected(cur + step);
    });
  });

  ui.btnRandomDetune.onclick = () => {
    const r = (Math.random() * 70) - 35;
    setDetuneForSelected(Math.round(r * 10) / 10);
  };

  ui.btnSnapToTarget.onclick = () => {
    const { realityC } = getOutputHz(ui, importedCurve, detuneMap, selectedMidi);
    const targetC = getTargetCents(ui, importedCurve, selectedMidi);
    const neededDetune = (targetC - realityC);
    setDetuneForSelected(Math.round(neededDetune * 10) / 10);
  };

  ui.btnExportTruth.onclick = () => {
    const payload = exportTruthCurve(ui, importedCurve);
    ui.curveJson.value = JSON.stringify(payload, null, 2);
    ui.importStatus.textContent = "Exported current reality curve to JSON box.";
  };

  ui.btnApplyImport.onclick = () => {
    try {
      const obj = JSON.parse(ui.curveJson.value);
      const curve = obj.curveCents88;
      if (!Array.isArray(curve) || curve.length !== 88) {
        ui.importStatus.textContent = "Import failed: curveCents88 must be an array of 88 numbers.";
        return;
      }
      const cleaned = curve.map(x => typeof x === 'number' ? x : parseFloat(x));
      if (cleaned.some(x => Number.isNaN(x))) {
        ui.importStatus.textContent = "Import failed: curveCents88 contains non-numeric values.";
        return;
      }
      importedCurve = cleaned;
      importedA4 = typeof obj.a4Hz === 'number' ? obj.a4Hz : null;

      if (importedA4) {
        ui.a4.value = importedA4.toFixed(1);
        ui.a4v.textContent = importedA4.toFixed(1);
      }

      ui.importStatus.textContent = "Import applied. Set “Piano reality” to 'ET + imported curve' or use 'Stretch' target to tune to it.";
      scheduleUpdate();
    } catch (e) {
      ui.importStatus.textContent = "Import failed: invalid JSON.";
    }
  };

  const capture = new CaptureController(
    ui, audio,
    (m) => { selectedMidi = m; },
    syncTuneSliderFromSelected,
    updateDebug,
    updateKeyHighlights
  );

  ui.capSeconds.oninput = () => capture.updateUI();
  ui.capGap.oninput = () => capture.updateUI();
  ui.capPreset.onchange = () => capture.updateUI();
  ui.capCustom.oninput = () => capture.updateUI();

  ui.capStart.onclick = () => {
    // Capture is for tuner testing; disallow sampled piano mode.
    if (ui.wave.value === 'piano_samples') {
      ui.capNow.textContent = "Switch Waveform to a synth (e.g., sine/piano-ish) for Capture.";
      return;
    }
    if (!audio.isEnabled() || !audio.ctx) {
      ui.capNow.textContent = "Enable Audio first.";
      return;
    }
    capture.start();
  };
  ui.capStop.onclick = () => capture.stop();
  ui.capNext.onclick = () => capture.next();
  ui.capRepeat.onclick = () => capture.repeat();

  ['input','change'].forEach(ev => {
    ui.a4.addEventListener(ev, scheduleUpdate);
    ui.lowEx.addEventListener(ev, scheduleUpdate);
    ui.highEx.addEventListener(ev, scheduleUpdate);
    ui.shape.addEventListener(ev, scheduleUpdate);
    ui.pianoReality.addEventListener(ev, scheduleUpdate);
    ui.tuneTarget.addEventListener(ev, scheduleUpdate);
  });


  // Desktop: keep advanced panels expanded. Mobile: keep them collapsed by default.
  try{
    if (window.matchMedia("(min-width: 861px)").matches){
      document.querySelectorAll("details.panel").forEach(d => { d.open = true; });
    } else {
      document.querySelectorAll("details.panel").forEach(d => { d.open = false; });
    }
  }catch{}

  applyPreset(ui.preset.value);
  renderKeyboard();
  capture.updateUI();
  syncTuneSliderFromSelected();
  updateDebug();
}
