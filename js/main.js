import { initState } from './state.js';
import { initAudio } from './audio.js';
import { initKeyboard } from './keyboard.js';
import { initCapture } from './capture.js';
import { initUI } from './ui.js';

const state = initState();

await initAudio(state);
initKeyboard(state);
initCapture(state);
initUI(state);

console.log('Piano sim ready', state);
