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

  let mediaUnlocked = false;

  async function unlockMediaOnIOS() {
    if (mediaUnlocked) return;

    // iOS Chrome = WebKit, so treat as iOS Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isIOS) { mediaUnlocked = true; return; }

    const el = document.getElementById("iosMediaUnlock");
    if (el) {
      try {
        el.muted = true;
        el.volume = 0;
        // Play/pause "media" to nudge routing category
        const p = el.play();
        if (p && typeof p.catch === "function") await p;
        el.pause();
        el.currentTime = 0;
      } catch (_) {
        // ignore
      }
    }

    mediaUnlocked = true;
  }

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
    ui.a4v.textContent = parseFloat(ui.a4.value).toFixed(1);
    ui.lowExV.textContent = parseFloat(ui.lowEx.value).toFixed(1);
    ui.highExV.textContent = parseFloat(ui.highEx.value).toFixed(1);
    ui.shapeV.textContent = parseFloat(ui.shape.value).toFixed(2);

    ui.selNote.textContent = `${midiToName(selectedMidi)} (MIDI ${selectedMidi})`;

    const { et, realityC, realityHz, detuneC, outHz } = getOutputHz(ui, importedCurve, detuneMap, selectedMidi);
    ui.dbgEt.textContent = fmtHz(et);
    ui.dbgRealityC.textContent = fmtC(realityC);
    ui.dbgRealityHz.textContent = fmtHz(realityHz);
    ui.dbgDetune.textContent = fmtC(detuneC);
    ui.dbgOutHz.textContent = fmtHz(outHz);
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

  function attachKeyHandlers(div, midi) {
    const down = async (e) => {
      e.preventDefault();
      await unlockMediaOnIOS();
      selectedMidi = midi;
      syncTuneSliderFromSelected();
      updateDebug();
      if (!audio.ctx) return;
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

    const whiteWidth = 26;
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
      let offset = 18;
      if (n === 6) offset = 16;

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
    keysDown.add(k);

    selectedMidi = qwertyMap.get(k);
    syncTuneSliderFromSelected();
    updateDebug();
    if (audio.ctx) {
      audio.press(selectedMidi);
      updateKeyHighlights();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = (e.key || '').toUpperCase();
    if (!qwertyMap.has(k)) return;
    keysDown.delete(k);
    if (audio.ctx) {
      audio.release(qwertyMap.get(k));
      updateKeyHighlights();
      updateDebug();
    }
  });

  ui.btnStartAudio.onclick = async () => {
    await unlockMediaOnIOS();
    await audio.enable();
    ui.btnStartAudio.disabled = true;
    ui.btnStopAll.disabled = false;
    scheduleUpdate();
  };
  ui.btnStopAll.onclick = () => { audio.stopAll(); updateKeyHighlights(); updateDebug(); };

  ui.vol.oninput = () => audio.setVolume(parseFloat(ui.vol.value));
  ui.sustain.onchange = () => { sustainOn = (ui.sustain.value === 'on'); };
  ui.poly.onchange = () => { audio.trimVoices(); };
  ui.wave.onchange = () => { scheduleUpdate(); };

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
    if (!audio.ctx) { ui.capNow.textContent = "Enable Audio first"; return; }
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

  applyPreset(ui.preset.value);
  renderKeyboard();
  capture.updateUI();
  syncTuneSliderFromSelected();
  updateDebug();
}
