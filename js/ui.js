import { retune } from './audio.js';

export function initUI(state) {
  // Minimal UI hooks; expand later
  window.addEventListener('wheel', e => {
    const cur = state.detuneMap.get(state.selectedMidi) || 0;
    const next = cur + (e.deltaY < 0 ? 0.1 : -0.1);
    state.detuneMap.set(state.selectedMidi, next);
    retune(state, state.selectedMidi);
  });
}
