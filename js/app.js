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
    kbdScroll: document.getElementById('kbdScroll'),

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

  // ---------- State ----------
  let selectedMidi = A4_MIDI;
  let importedCurve = null;
  let importedA4 = null;
  const detuneMap = new Map();
  let sustainOn = (ui.sustain.value === 'on');

  // keyDivs maps MIDI -> div
  const keyDivs = new Map();

  // Per-pointer riff state (multi-touch)
  const pointerToMidi = new Map(); // pointerId -> midi currently held

  // ---------- Audio ----------
  const audio = new AudioEngine(ui, () => ({
    importedCurve,
    detuneMap,
    selectedMidi,
    sustainOn
  }));

  function setAudioUiEnabled(enabled, msg) {
    ui.btnStartAudio.disabled = enabled;
    ui.btnStopAll.disabled = !enabled;
    if (ui.audioStatus) {
      ui.audioStatus.textContent =
        msg || (enabled ? 'Audio enabled.' : 'Audio is disabled. Click “Enable Audio”.');
    }
  }

  setAudioUiEnabled(false);

  // ---------- Tabs ----------
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

  // ---------- Helpers ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function readCssPx(varName, fallbackPx) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
      if (!v) return fallbackPx;
      if (v.endsWith('px')) return parseFloat(v.slice(0, -2));
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : fallbackPx;
    } catch {
      return fallbackPx;
    }
  }

  function requireAudioOrMessage() {
    if (audio.isEnabled()) return true;
    setAudioUiEnabled(false, 'Audio is disabled. Click “Enable Audio”.');
    return false;
  }

  // ---------- Debug ----------
  function updateDebug() {
    const setText = (el, text) => { if (el) el.textContent = text; };

    setText(ui.a4v, parseFloat(ui.a4.value).toFixed(1));
    setText(ui.lowExV, parseFloat(ui.lowEx.value).toFixed(1));
    setText(ui.highExV, parseFloat(ui.highEx.value).toFixed(1));
    setText(ui.shapeV, parseFloat(ui.shape.value).toFixed(2));

    setText(ui.selNote, `${midiToName(selectedMidi)} (MIDI ${selectedMidi})`);

    const { et, realityC, realityHz, detuneC, outHz } =
      getOutputHz(ui, importedCurve, detuneMap, selectedMidi);

    setText(ui.dbgEt, et.toFixed(3));
    setText(ui.dbgRealityC, realityC.toFixed(1));
    setText(ui.dbgRealityHz, realityHz.toFixed(3));
    setText(ui.dbgDetune, detuneC.toFixed(1));
    setText(ui.dbgOutHz, outHz.toFixed(3));
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

  // ---------- Keyboard pan via slider (NO native scroll) ----------
  // Slider stays normalized 0..1000 and we translate the keyboard.
  let kbdMaxShiftPx = 0;

  function getKbdPaddingPx(kbdEl) {
    try {
      const cs = getComputedStyle(kbdEl);
      const pl = parseFloat(cs.paddingLeft || '0') || 0;
      const pr = parseFloat(cs.paddingRight || '0') || 0;
      return pl + pr;
    } catch {
      return 0;
    }
  }

  function applyKeyboardPanFromSlider() {
    if (!ui.kbdScroll) return;
    const t = (parseInt(ui.kbdScroll.value || "0", 10) || 0) / 1000;
    const shift = Math.round(t * kbdMaxShiftPx);
    ui.keysEl.style.transform = `translateX(${-shift}px)`;
  }

  function updateKeyboardPanMetrics() {
    if (!ui.kbdScroll) return;

    const kbd = ui.keysEl.closest('.kbd');
    if (!kbd) return;

    const whiteW = readCssPx('--whiteW', 26);
    const keysWidth = Math.round(whiteW * 52); // 52 white keys for 88-key piano

    // Force explicit width so it never “measures wrong” on mobile
    ui.keysEl.style.width = `${keysWidth}px`;

    const padding = getKbdPaddingPx(kbd);
    const viewportW = Math.max(0, Math.round(kbd.clientWidth - padding));

    kbdMaxShiftPx = Math.max(0, keysWidth - viewportW);

    ui.kbdScroll.disabled = (kbdMaxShiftPx === 0);
    if (ui.kbdScroll.disabled) ui.kbdScroll.value = "0";

    applyKeyboardPanFromSlider();
  }

  if (ui.kbdScroll) {
    ui.kbdScroll.min = "0";
    ui.kbdScroll.max = "1000";
    ui.kbdScroll.step = "1";
    ui.kbdScroll.value = ui.kbdScroll.value || "0";
    ui.kbdScroll.addEventListener('input', applyKeyboardPanFromSlider);
    function relayoutKeyboardSoon() {
    // wait for CSS media query to apply, then rebuild positions
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        renderKeyboard();           // ✅ rebuild key positions with new --whiteW
        updateKeyboardPanMetrics(); // ✅ recompute slider pan metrics
      });
    });
  }

  window.addEventListener('resize', relayoutKeyboardSoon);
  window.addEventListener('orientationchange', relayoutKeyboardSoon);
  }

  // ---------- Keyboard: riff/gliss ----------
  function midiFromPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const keyEl = el.closest?.('.white, .black');
    if (!keyEl) return null;
    const midi = Number(keyEl.dataset.midi);
    return Number.isFinite(midi) ? midi : null;
  }

  function pressForPointer(pointerId, midi) {
    const prev = pointerToMidi.get(pointerId);
    if (prev === midi) return;

    // release previous note (for that finger)
    if (prev != null) audio.release(prev);

    if (midi != null) {
      selectedMidi = midi;
      syncTuneSliderFromSelected();
      updateDebug();

      if (!requireAudioOrMessage()) return;

      audio.press(midi);
      pointerToMidi.set(pointerId, midi);
      updateKeyHighlights();
    } else {
      pointerToMidi.delete(pointerId);
      updateKeyHighlights();
    }
  }

  function releasePointer(pointerId) {
    const prev = pointerToMidi.get(pointerId);
    if (prev != null) {
      audio.release(prev);
      pointerToMidi.delete(pointerId);
      updateKeyHighlights();
      updateDebug();
    }
  }

  function attachKeyHandlers(div) {
    div.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      div.setPointerCapture?.(e.pointerId);
      const midi = midiFromPoint(e.clientX, e.clientY);
      pressForPointer(e.pointerId, midi);
    });

    div.addEventListener('pointermove', (e) => {
      e.preventDefault();
      const midi = midiFromPoint(e.clientX, e.clientY);
      pressForPointer(e.pointerId, midi);
    });

    div.addEventListener('pointerup', (e) => {
      e.preventDefault();
      releasePointer(e.pointerId);
    });

    div.addEventListener('pointercancel', (e) => {
      e.preventDefault();
      releasePointer(e.pointerId);
    });

    // Safety: if capture is lost, release
    div.addEventListener('lostpointercapture', (e) => {
      releasePointer(e.pointerId);
    });
  }

  // ---------- Render keyboard ----------
  function renderKeyboard() {
    ui.keysEl.innerHTML = '';
    ui.keysEl.style.transform = 'translateX(0px)';
    keyDivs.clear();

    const whiteWidth = readCssPx('--whiteW', 26);
    let whiteIndex = 0;

    // White keys
    for (let midi = MIDI_START; midi <= MIDI_END; midi++) {
      if (isBlack(midi)) continue;

      const d = document.createElement('div');
      d.className = 'white';
      d.style.left = (whiteIndex * whiteWidth) + 'px';
      d.dataset.midi = String(midi);

      const lbl = document.createElement('div');
      lbl.className = 'keylabel';
      lbl.textContent = midiToName(midi);
      d.appendChild(lbl);

      attachKeyHandlers(d);
      ui.keysEl.appendChild(d);
      keyDivs.set(midi, d);
      whiteIndex++;
    }

    // Black keys
    for (let midi = MIDI_START; midi <= MIDI_END; midi++) {
      if (!isBlack(midi)) continue;

      const d = document.createElement('div');
      d.className = 'black';
      d.dataset.midi = String(midi);

      // Count how many white keys have occurred up to this midi (exclusive-ish)
      let w = 0;
      for (let m = MIDI_START; m <= midi; m++) if (!isBlack(m)) w++;

      // IMPORTANT: scale the black-key offset with white key width
      // This fixes “spacing too short” when landscape keys get bigger.
      const offset = Math.round(whiteWidth * 0.62);
      const left = (w - 1) * whiteWidth + offset;
      d.style.left = left + 'px';

      const lbl = document.createElement('div');
      lbl.className = 'keylabel blackLbl';
      lbl.textContent = midiToName(midi);
      d.appendChild(lbl);

      attachKeyHandlers(d);
      ui.keysEl.appendChild(d);
      keyDivs.set(midi, d);
    }

    updateKeyHighlights();
    updateKeyboardPanMetrics();
  }

  function updateKeyHighlights() {
    for (const div of keyDivs.values()) div.classList.remove('active');

    // audio.activeNotes stores pressed notes for BOTH engines
    for (const midi of audio.activeNotes.keys()) {
      const div = keyDivs.get(midi);
      if (div) div.classList.add('active');
    }
  }

  // ---------- QWERTY keys ----------
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

  // ---------- Audio controls ----------
  ui.btnStartAudio.onclick = () => {
    ui.btnStartAudio.disabled = true;
    if (ui.audioStatus) ui.audioStatus.textContent = 'Enabling audio…';

    audio.enable()
      .then(() => {
        setAudioUiEnabled(true, ui.wave.value === 'piano_samples'
          ? 'Audio enabled (piano samples).'
          : (ui.wave.value === 'sine' ? 'Audio enabled (sine reference).' : 'Audio enabled (piano-ish synth).'));
        scheduleUpdate();
      })
      .catch((e) => {
        console.warn('Audio enable failed:', e);
        setAudioUiEnabled(false, 'Audio enable failed. Click “Enable Audio” to retry.');
      });
  };

  ui.btnStopAll.onclick = () => {
    // Release riff pointers too
    for (const pid of Array.from(pointerToMidi.keys())) releasePointer(pid);
    audio.stopAll();
    updateKeyHighlights();
    updateDebug();
  };

  ui.vol.oninput = () => audio.setVolume(parseFloat(ui.vol.value));
  ui.sustain.onchange = () => { sustainOn = (ui.sustain.value === 'on'); };
  ui.poly.onchange = () => { audio.trimVoices(); };

  // When switching mode, hard disable audio to avoid glitches.
  ui.wave.onchange = async () => {
    keysDown.clear();

    // Release any active riff pointers
    for (const pid of Array.from(pointerToMidi.keys())) releasePointer(pid);

    try { await audio.disable(); } catch (e) { console.warn('Audio disable failed on wave change:', e); }
    updateKeyHighlights();

    setAudioUiEnabled(false, 'Sound changed. Click “Enable Audio” to continue.');
    scheduleUpdate();
  };

  // ---------- Tune bench detune ----------
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

  // ---------- Curve import/export ----------
  ui.btnExportTruth.onclick = () => {
    const payload = exportTruthCurve(ui, importedCurve);
    ui.curveJson.value = JSON.stringify(payload, null, 2);
    if (ui.importStatus) ui.importStatus.textContent = "Exported current “truth” curve to JSON box.";
  };

  ui.btnApplyImport.onclick = () => {
    try {
      const obj = JSON.parse(ui.curveJson.value);
      const curve = obj.curveCents88;

      if (!Array.isArray(curve) || curve.length !== 88) {
        ui.importStatus.textContent = "Import failed: curveCents88 must be an array of 88 numbers.";
        return;
      }

      const cleaned = curve.map(x => (typeof x === 'number') ? x : parseFloat(x));
      if (cleaned.some(x => Number.isNaN(x))) {
        ui.importStatus.textContent = "Import failed: curveCents88 contains non-numeric values.";
        return;
      }

      importedCurve = cleaned;
      importedA4 = (typeof obj.a4Hz === 'number') ? obj.a4Hz : null;

      if (importedA4) {
        ui.a4.value = importedA4.toFixed(1);
        if (ui.a4v) ui.a4v.textContent = importedA4.toFixed(1);
      }

      ui.importStatus.textContent =
        "Import applied. Set “Piano reality” to 'ET + imported curve' or use 'Stretch' target to tune to it.";
      scheduleUpdate();
    } catch {
      ui.importStatus.textContent = "Import failed: invalid JSON.";
    }
  };

  // ---------- Capture controller ----------
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
    if (ui.wave.value === 'piano_samples') {
      ui.capNow.textContent = "Switch Waveform to a synth (sine/piano-ish) for Capture.";
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

  // ---------- Inputs that affect pitch ----------
  ['input', 'change'].forEach(ev => {
    ui.a4.addEventListener(ev, scheduleUpdate);
    ui.lowEx.addEventListener(ev, scheduleUpdate);
    ui.highEx.addEventListener(ev, scheduleUpdate);
    ui.shape.addEventListener(ev, scheduleUpdate);
    ui.pianoReality.addEventListener(ev, scheduleUpdate);
    ui.tuneTarget.addEventListener(ev, scheduleUpdate);
  });

  // ---------- Init ----------
  applyPreset(ui.preset.value);
  renderKeyboard();
  capture.updateUI();
  syncTuneSliderFromSelected();
  updateDebug();
  updateKeyboardPanMetrics();
}
