import { MIDI_START, MIDI_END, A4_MIDI } from './midi.js';

export const centsToRatio = (c) => Math.pow(2, c / 1200);

export const etHz = (midi, a4) => a4 * Math.pow(2, (midi - A4_MIDI) / 12);

// Smooth signed power curve with asymmetric extremes
export function stretchCents(index0to87, lowExtreme, highExtreme, shape) {
  const t = index0to87 / 87;       // 0..1
  const x = (t - 0.5) * 2;         // -1..+1
  const s = Math.sign(x);
  const mag = Math.pow(Math.abs(x), shape); // 0..1
  return s < 0 ? mag * lowExtreme : mag * highExtreme;
}

export function currentRealityCents(ui, importedCurve, midi) {
  const idx = midi - MIDI_START; // 0..87
  if (idx < 0 || idx > 87) return 0;

  const mode = ui.pianoReality.value;
  if (mode === 'et') return 0;

  if (mode === 'import') {
    if (importedCurve && importedCurve.length === 88) return importedCurve[idx] || 0;
    return 0;
  }

  const low = parseFloat(ui.lowEx.value);
  const high = parseFloat(ui.highEx.value);
  const sh = parseFloat(ui.shape.value);
  return stretchCents(idx, low, high, sh);
}

export function getTargetCents(ui, importedCurve, midi) {
  if (ui.tuneTarget.value === 'et') return 0;
  const idx = midi - MIDI_START;
  if (importedCurve && importedCurve.length === 88 && ui.pianoReality.value !== 'et') {
    return importedCurve[idx] || 0;
  }
  return currentRealityCents(ui, importedCurve, midi);
}

export function getOutputHz(ui, importedCurve, detuneMap, midi) {
  const a4Hz = parseFloat(ui.a4.value);
  const et = etHz(midi, a4Hz);
  const realityC = currentRealityCents(ui, importedCurve, midi);
  const realityHz = et * centsToRatio(realityC);
  const detuneC = detuneMap.get(midi) ?? 0;
  const outHz = realityHz * centsToRatio(detuneC);
  return { et, realityC, realityHz, detuneC, outHz };
}

export function exportTruthCurve(ui, importedCurve) {
  const a4Hz = parseFloat(ui.a4.value);
  const arr = [];
  for (let midi = MIDI_START; midi <= MIDI_END; midi++) {
    arr.push(currentRealityCents(ui, importedCurve, midi));
  }
  return { a4Hz, curveCents88: arr };
}
