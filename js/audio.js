import { outputHz } from './tuning.js';

let ctx = null;
let master = null;
let osc = null;

export async function initAudio(state) {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.08;
    master.connect(ctx.destination);
  }
  if (ctx.state !== 'running') await ctx.resume();
}

export function playNote(state, midi) {
  stopNote();
  osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = outputHz(state, midi);
  osc.connect(master);
  osc.start();
}

export function retune(state, midi) {
  if (!osc) return;
  osc.frequency.setTargetAtTime(
    outputHz(state, midi),
    ctx.currentTime,
    0.02
  );
}

export function stopNote() {
  if (osc) {
    try { osc.stop(); } catch {}
    osc.disconnect();
    osc = null;
  }
}
