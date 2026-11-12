// BGM と案内の声。BGM はつなぎ目が目立たないよう重ねながらくり返し、声の間は BGM を小さくする
const BGM_VOL = 0.42;
const BGM_DUCK = 0.14;
const VOICE_VOL = 1.0;
const XFADE = 3;

let ctx = null;
let master;
let bgmBus;
let voiceBus;
const buffers = new Map();
let enabled = true;
let current = null;      // いま流れている BGM { name, sources:[], timer }
let voiceSrc = null;

const url = (p) => new URL(`../${p}`, import.meta.url).href;

async function load(path) {
  if (buffers.has(path)) return buffers.get(path);
  const p = fetch(url(path)).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b));
  buffers.set(path, p);
  return p;
}

export function initAudio(on = true) {
  enabled = on;
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = enabled ? 1 : 0;
  master.connect(ctx.destination);
  bgmBus = ctx.createGain();
  bgmBus.gain.value = BGM_VOL;
  bgmBus.connect(master);
  voiceBus = ctx.createGain();
  voiceBus.gain.value = VOICE_VOL;
  voiceBus.connect(master);
  // 画面が隠れた・ほかのアプリに切りかえた・ページを離れたときは音を止める
  const pause = () => { if (ctx && ctx.state === 'running') ctx.suspend(); };
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) pause(); else if (enabled) ctx.resume();
  });
  window.addEventListener('pagehide', pause);
  document.addEventListener('pointerdown', () => { if (ctx && enabled && ctx.state !== 'running' && !document.hidden) ctx.resume(); }, true);
  window.addEventListener('blur', () => { if (document.hidden || !document.hasFocus()) setTimeout(() => { if (document.hidden) pause(); }, 300); });
  // 先に読んでおく
  load('bgm/main.mp3').catch(() => {});   // 結果のBGMは、使う直前に読む（撮影中のメモリを減らすため）
}

export function setEnabled(on) {
  enabled = on;
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(on ? 1 : 0, t, 0.08);
  if (on) ctx.resume();
}
export const isEnabled = () => enabled;

// くり返し再生：曲の終わり XFADE 秒前に次を重ねて始める
function startLoop(buf, name, fadeIn = 1.5) {
  const state = { name, sources: [], timer: null, gain: ctx.createGain() };
  state.gain.gain.value = 0;
  state.gain.connect(bgmBus);
  state.gain.gain.setTargetAtTime(1, ctx.currentTime, fadeIn / 3);
  const play = (when) => {
    const g = ctx.createGain();
    g.connect(state.gain);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(g);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(1, when + (state.sources.length ? XFADE : 0.05));
    const end = when + buf.duration;
    g.gain.setValueAtTime(1, end - XFADE);
    g.gain.linearRampToValueAtTime(0, end);
    src.start(when);
    src.stop(end + 0.1);
    state.sources.push(src);
    if (state.sources.length > 3) state.sources.shift();
    const next = end - XFADE;
    state.timer = setTimeout(() => play(next), Math.max(0, (next - ctx.currentTime - 1) * 1000));
  };
  play(ctx.currentTime + 0.05);
  return state;
}

export async function playBgm(name) {
  if (!ctx) return;
  if (current && current.name === name) return;
  let buf;
  try { buf = await load(`bgm/${name}.mp3`); } catch { return; }
  if (current && current.name === name) return;
  const old = current;
  current = startLoop(buf, name);
  if (old) {
    const t = ctx.currentTime;
    old.gain.gain.setTargetAtTime(0, t, 0.6);
    clearTimeout(old.timer);
    setTimeout(() => { old.sources.forEach((s) => { try { s.stop(); } catch { /* 止まっている */ } }); old.gain.disconnect(); }, 3000);
  }
}

// 案内の声（v01_title など）。前の声は止める。BGM は声の間だけ小さく
export async function say(id) {
  if (!ctx || !enabled) return Promise.resolve();
  let buf;
  try { buf = await load(`voice/${id}.mp3`); } catch { return; }
  if (voiceSrc) { try { voiceSrc.stop(); } catch { /* 止まっている */ } }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(voiceBus);
  const t = ctx.currentTime;
  bgmBus.gain.cancelScheduledValues(t);
  bgmBus.gain.setTargetAtTime(BGM_DUCK, t, 0.15);
  const done = new Promise((resolve) => {
    src.onended = () => {
      resolve();
      if (voiceSrc !== src) return;
      voiceSrc = null;
      bgmBus.gain.setTargetAtTime(BGM_VOL, ctx.currentTime, 0.5);
    };
  });
  voiceSrc = src;
  src.start(t + 0.05);
  return done;
}

export function stopVoice() {
  if (voiceSrc) { try { voiceSrc.stop(); } catch { /* 止まっている */ } voiceSrc = null; }
}

// 小さな効果音（その場で合成）：選んだとき・結果が出たとき
export function chime(kind = 'tap') {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const notes = kind === 'reveal' ? [784, 988, 1175, 1568] : kind === 'step' ? [1046] : [1318];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    const s = t + i * 0.09;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(kind === 'reveal' ? 0.12 : 0.06, s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, s + (kind === 'reveal' ? 1.4 : 0.35));
    o.connect(g).connect(master);
    o.start(s);
    o.stop(s + 1.5);
  });
}
