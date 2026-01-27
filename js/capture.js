import { playNote, stopNote } from './audio.js';

export function initCapture(state) {
  state.runCapture = async function(sequence, seconds = 3) {
    for (const midi of sequence) {
      state.selectedMidi = midi;
      playNote(state, midi);
      await new Promise(r => setTimeout(r, seconds * 1000));
      stopNote();
      await new Promise(r => setTimeout(r, 200));
    }
  };
}
