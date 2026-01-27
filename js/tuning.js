export const A4_MIDI = 69;
export const MIDI_START = 21;
export const MIDI_END = 108;

export const centsToRatio = c => Math.pow(2, c / 1200);

export const etHz = (midi, a4Hz) =>
  a4Hz * Math.pow(2, (midi - A4_MIDI) / 12);

export function stretchCents(idx, low, high, shape) {
  const t = idx / 87;
  const x = (t - 0.5) * 2;
  const mag = Math.pow(Math.abs(x), shape);
  return x < 0 ? mag * low : mag * high;
}

export function realityCents(state, midi) {
  const idx = midi - MIDI_START;
  if (idx < 0 || idx > 87) return 0;

  if (state.pianoReality === "et") return 0;
  if (state.pianoReality === "import" && state.importedCurve)
    return state.importedCurve[idx] || 0;

  return stretchCents(
    idx,
    state.stretch.low,
    state.stretch.high,
    state.stretch.shape
  );
}

export function outputHz(state, midi) {
  const et = etHz(midi, state.a4Hz);
  const rc = realityCents(state, midi);
  const detune = state.detuneMap.get(midi) || 0;
  return et * centsToRatio(rc + detune);
}
