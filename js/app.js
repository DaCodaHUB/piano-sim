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
    dbgTargetHz: document.getElementById('dbgTargetHz'),
    dbgOutHz: document.getElementById('dbgOutHz'),
    dbgCents: document.getElementById('dbgCents'),
    detune: document.getElementById('detune'),
    detuneV: document.getElementById('detuneV'),
    btnExportCurve: document.getElementById('btnExportCurve'),
    btnImportCurve: document.getElementById('btnImportCurve'),
    fileImportCurve: document.getElementById('fileImportCurve'),
    btnResetCurve: document.getElementById('btnResetCurve'),

    // Capture
    btnStartCapture: document.getElementById('btnStartCapture'),
    btnStopCapture: document.getElementById('btnStopCapture'),
    capStatus: document.getElementById('capStatus'),
    capHz: document.getElementById('capHz'),
    capCents: document.getElementById('capCents'),
    capNote: document.getElementById('capNote'),
    capHistory: document.getElementById('capHistory'),
    capGraph: document.getElementById('capGraph'),
  };

  // Tabs
  function setTab(which) {
    ui.tabPlay.classList.toggle('active', which === 'play');
    ui.tabCapture.classList.toggle('active', which === 'capture');
    ui.tabTune.classList.toggle('active', which === 'tune');

    ui.panePlay.style.display = which === 'play' ? 'block' : 'none';
    ui.paneCapture.style.display = which === 'capture' ? 'block' : 'none';
    ui.paneTune.style.display = which === 'tune' ? 'block' : 'none';
  }
  ui.tabPlay.onclick = () => setTab('play');
  ui.tabCapture.onclick = () => setTab('capture');
  ui.tabTune.onclick = () => setTab('tune');
  setTab('play');

  // State
  let selectedMidi = A4_MIDI;
  let importedCurve = null;
  let importedA4 = null;
  const detuneMap = new Map();
  let sustainOn = (ui.sustain.value === 'on');

  const keyDivs = new Map();

  const audio = new AudioEngine(ui, () => ({ importedCurve, detuneMap, selectedMidi, sustainOn }));
  let audioUnlocked = false; // require user gesture via Start Audio

  function setTabHighlight(midi) {
    selectedMidi = midi;
    syncTuneSliderFromSelected();
    updateDebug();
    updateKeyHighlights();
  }

  // Build keyboard UI
  const keyboardEl = document.getElementById('keyboard');

  function buildKeyboard() {
    keyboardEl.innerHTML = '';
    keyDivs.clear();

    for (let midi = MIDI_START; midi <= MIDI_END; midi++) {
      const name = midiToName(midi);
      const div = document.createElement('div');
      div.className = 'key ' + (isBlack(midi) ? 'black' : 'white');
      div.dataset.midi = String(midi);

      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = name;
      div.appendChild(label);

      // Pointer events
      const down = (e) => {
        e.preventDefault();
        selectedMidi = midi;
        syncTuneSliderFromSelected();
        updateDebug();

        // Require Start Audio before any sound plays.
        if (!audioUnlocked) return;

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

      // Click selects
      div.addEventListener('click', () => setTabHighlight(midi));

      keyboardEl.appendChild(div);
      keyDivs.set(midi, div);
    }
  }

  buildKeyboard();

  // Select note dropdown
  function fillNoteSelect() {
    ui.selNote.innerHTML = '';
    for (let midi = MIDI_START; midi <= MIDI_END; midi++) {
      const opt = document.createElement('option');
      opt.value = String(midi);
      opt.textContent = midiToName(midi);
      if (midi === selectedMidi) opt.selected = true;
      ui.selNote.appendChild(opt);
    }
  }
  fillNoteSelect();
  ui.selNote.onchange = () => {
    setTabHighlight(parseInt(ui.selNote.value, 10));
  };

  // QWERTY map
  const qwertyMap = new Map([
    ['a', 60], ['w', 61], ['s', 62], ['e', 63], ['d', 64], ['f', 65], ['t', 66], ['g', 67], ['y', 68], ['h', 69], ['u', 70], ['j', 71], ['k', 72],
    ['o', 73], ['l', 74], ['p', 75], [';', 76],
  ]);
  const held = new Set();

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.repeat) return;
    if (!qwertyMap.has(k)) return;

    const midi = qwertyMap.get(k);
    held.add(midi);

    selectedMidi = midi;
    syncTuneSliderFromSelected();
    updateDebug();

    // Require Start Audio before any sound plays.
    if (!audioUnlocked) return;

    audio.press(selectedMidi);
    updateKeyHighlights();
  });

  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (!qwertyMap.has(k)) return;

    const midi = qwertyMap.get(k);
    held.delete(midi);

    if (sustainOn && ui.sustain.value === 'on') {
      // sustain holds
    } else {
      audio.release(midi);
      updateKeyHighlights();
      updateDebug();
    }
  });

  ui.btnStartAudio.onclick = () => {
    audio.enable()
      .then(() => {
        audioUnlocked = true;
        ui.btnStartAudio.disabled = true;
        ui.btnStopAll.disabled = false;
        scheduleUpdate();
      })
      .catch((e) => {
        console.warn('Audio enable failed:', e);
      });
  };

  ui.btnStopAll.onclick = () => { audio.stopAll(); updateKeyHighlights(); updateDebug(); };

  ui.vol.oninput = () => audio.setVolume(parseFloat(ui.vol.value));
  ui.sustain.onchange = () => { sustainOn = (ui.sustain.value === 'on'); };
  ui.poly.onchange = () => { audio.trimVoices(); };

  ui.wave.onchange = () => {
    // Require the user to re-enable audio every time the sound changes.
    audioUnlocked = false;
    audio.disable();
    ui.btnStartAudio.disabled = false;
    ui.btnStopAll.disabled = true;
    scheduleUpdate();
  };

  function syncTuneSliderFromSelected() {
    const c = detuneMap.get(selectedMidi) ?? 0;
    ui.detune.value = c.toFixed(1);
    ui.detuneV.textContent = parseFloat(ui.detune.value).toFixed(1);
    if (ui.selNote) ui.selNote.value = String(selectedMidi);
  }

  function setDetuneForSelected(cents) {
    detuneMap.set(selectedMidi, cents);
    ui.detune.value = cents.toFixed(1);
    ui.detuneV.textContent = parseFloat(ui.detune.value).toFixed(1);
    scheduleUpdate();
  }

  ui.detune.oninput = () => {
    const c = parseFloat(ui.detune.value);
    ui.detuneV.textContent = c.toFixed(1);
    setDetuneForSelected(c);
  };

  // Presets / tuning model
  function updatePresetUI() {
    ui.a4v.textContent = parseFloat(ui.a4.value).toFixed(0);
    ui.lowExV.textContent = parseFloat(ui.lowEx.value).toFixed(0);
    ui.highExV.textContent = parseFloat(ui.highEx.value).toFixed(0);
    ui.shapeV.textContent = parseFloat(ui.shape.value).toFixed(0);
  }

  ui.a4.oninput = () => { updatePresetUI(); scheduleUpdate(); };
  ui.lowEx.oninput = () => { updatePresetUI(); scheduleUpdate(); };
  ui.highEx.oninput = () => { updatePresetUI(); scheduleUpdate(); };
  ui.shape.oninput = () => { updatePresetUI(); scheduleUpdate(); };

  ui.preset.onchange = () => {
    if (ui.preset.value === 'default') {
      ui.a4.value = '440';
      ui.lowEx.value = '8';
      ui.highEx.value = '4';
      ui.shape.value = '45';
      importedCurve = null;
      importedA4 = null;
      detuneMap.clear();
      updatePresetUI();
      scheduleUpdate();
    }
    if (ui.preset.value === 'imported' && !importedCurve) {
      ui.preset.value = 'default';
    }
    scheduleUpdate();
  };

  ui.btnExportCurve.onclick = () => {
    const a4 = importedA4 ?? parseFloat(ui.a4.value);
    const curve = exportTruthCurve(a4, importedCurve, detuneMap);
    const blob = new Blob([JSON.stringify(curve, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `piano-curve-A4-${Math.round(a4)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  ui.btnImportCurve.onclick = () => ui.fileImportCurve.click();

  ui.fileImportCurve.onchange = async () => {
    const f = ui.fileImportCurve.files?.[0];
    if (!f) return;
    const text = await f.text();
    try {
      const json = JSON.parse(text);
      importedCurve = json;
      importedA4 = json?.a4 ?? null;
      ui.preset.value = 'imported';
      scheduleUpdate();
    } catch (e) {
      console.warn('Import failed:', e);
    } finally {
      ui.fileImportCurve.value = '';
    }
  };

  ui.btnResetCurve.onclick = () => {
    importedCurve = null;
    importedA4 = null;
    detuneMap.clear();
    ui.preset.value = 'default';
    scheduleUpdate();
  };

  // Debug + highlighting + retune
  function updateKeyHighlights() {
    for (let midi = MIDI_START; midi <= MIDI_END; midi++) {
      const div = keyDivs.get(midi);
      if (!div) continue;
      div.classList.toggle('selected', midi === selectedMidi);
      div.classList.toggle('held', held.has(midi));
    }
  }

  function updateDebug() {
    const a4 = importedA4 ?? parseFloat(ui.a4.value);
    const targetCents = getTargetCents(a4, selectedMidi, importedCurve, detuneMap);
    const outHz = getOutputHz(a4, selectedMidi, importedCurve, detuneMap);
    const targetHz = 440 * Math.pow(2, (selectedMidi - A4_MIDI) / 12);

    ui.dbgEt.textContent = `${midiToName(selectedMidi)} = ${targetHz.toFixed(3)} Hz`;
    ui.dbgRealityC.textContent = `${targetCents.toFixed(2)} cents`;
    ui.dbgTargetHz.textContent = `${targetHz.toFixed(3)} Hz`;
    ui.dbgOutHz.textContent = `${outHz.toFixed(3)} Hz`;
    ui.dbgCents.textContent = `${(1200 * Math.log2(outHz / targetHz)).toFixed(2)} cents`;
  }

  let raf = null;
  function scheduleUpdate() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      audio.retuneAll();
      updateDebug();
      updateKeyHighlights();
      updatePresetUI();
    });
  }

  // Capture tab
  const capture = new CaptureController(ui, () => ({
    a4: importedA4 ?? parseFloat(ui.a4.value),
    importedCurve,
    detuneMap,
    selectedMidi,
  }));

  ui.btnStartCapture.onclick = () => capture.start();
  ui.btnStopCapture.onclick = () => capture.stop();

  // Init visuals
  updatePresetUI();
  syncTuneSliderFromSelected();
  updateDebug();
  updateKeyHighlights();
  scheduleUpdate();
}
