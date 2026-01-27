// MIDI / note utilities
export const noteNames = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
export const MIDI_START = 21; // A0
export const MIDI_END = 108;  // C8
export const A4_MIDI = 69;

export function midiToName(m) {
  const name = noteNames[m % 12];
  const oct = Math.floor(m / 12) - 1;
  return `${name}${oct}`;
}

export function nameToMidi(name) {
  const m = name.trim().toUpperCase().match(/^([A-G])(#?)(-?\d)$/);
  if (!m) return null;
  const letter = m[1];
  const sharp = m[2] === "#" ? "#" : "";
  const oct = parseInt(m[3], 10);
  const idx = noteNames.indexOf(letter + sharp);
  if (idx < 0) return null;
  return (oct + 1) * 12 + idx;
}

export function isBlack(midi) {
  const n = midi % 12;
  return [1,3,6,8,10].includes(n); // C#, D#, F#, G#, A#
}
