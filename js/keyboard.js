import { playNote, stopNote, retune } from './audio.js';

export function initKeyboard(state) {
  // Minimal keyboard binding for testing
  window.addEventListener('keydown', e => {
    if (e.key === 'a') {
      state.selectedMidi = 69; // A4
      playNote(state, 69);
    }
    if (e.key === 's') {
      state.selectedMidi = 60; // C4
      playNote(state, 60);
    }
  });

  window.addEventListener('keyup', () => stopNote());
}
