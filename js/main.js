// 画面の流れ：タイトル → 人数 → だれ → 方法 →（カメラ）→ 質問12 → 読み解き → 結果 → なりたい印象 → コツ →（次の人）→ みんな → おわり
import { QUESTIONS, TYPES, GOALS, SKIP, CATEGORIES, PRO } from './data.js';
import { classify, chartPoint, pickTips, photoAnswers, groupComment, typeCenter } from './logic.js';
import { faceSVG } from './faces.js';
import { chartSVG } from './chart.js';
import { initAudio, setEnabled, isEnabled, playBgm, say, chime, stopVoice } from './audio.js';
import { STATS_API, FEATURE_PAGE, FEATURE_TITLE, ISSUE_LABEL, DEMO_HOSTS } from './config.js';
import { SHOPS } from './shops.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const TS = Number(params.get('ts')) || 1;          // 演出の速さ（確認用）
// 見本の掲載店は、手元と確認用URLだけで出せる（config.js の DEMO_HOSTS）。本番のアドレスでは ?demo=1 を付けても出ない
const DEMO = params.get('demo') === '1' && DEMO_HOSTS.some((h) => location.hostname === h || location.hostname.endsWith(`.${h}`));
let shops = SHOPS;
let DEMO_NOTE = '';
if (DEMO) {
  try { const m = await import('./shops-demo.js'); shops = m.DEMO_SHOPS; DEMO_NOTE = m.DEMO_NOTE; } catch { /* 見本のファイルがなければ本番の店だけ */ }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms / TS));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const PERSON_COLORS = ['#C98F8A', '#8FA7BF', '#B99A5F', '#8DB09A'];

const state = {
  screen: 'title',
  count: 1,
  people: [],         // { nick, gender, mode, answers, photoPicks, result, point, goal, goalPoint, goalType, tips }
  idx: 0,
  q: 0,
  list: [],          // 出す質問の並び（QUESTIONS の番号）
  history: [],
};
const me = () => state.people[state.idx];

// ---------- 数の報告（個人がわからない形で、回数だけ） ----------
function stat(kind, data = {}) {
  if (!STATS_API || DEMO) return;          // 見本を表示しているときは数えない
  try {
    fetch(`${STATS_API}/log`, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, ...data }),
    }).catch(() => {});
  } catch { /* 数えられなくても診断は続ける */ }
}

// ---------- 画面の切りかえ ----------
function show(name, { push = true } = {}) {
  const prev = state.screen;
  if (push && prev !== name) state.history.push(prev);
  state.screen = name;
  for (const s of $$('.screen')) {
    const on = s.dataset.screen === name;
    if (on && s.hidden) { s.hidden = false; s.classList.remove('enter'); void s.offsetWidth; s.classList.add('enter'); }
    else if (!on) s.hidden = true;
  }
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  // 2人目以降の入力画面からは、前の人へはもどらない（1人とばされるのを防ぐ）
  $('#back').hidden = ['title', 'reveal', 'end', 'group', 'tips'].includes(name) || (name === 'person' && state.idx > 0);
  if (name !== 'title') { ensureGuard(); $('#stickyCta').hidden = true; }
  $('#progress').hidden = name !== 'quiz';
  if (name === 'result' || name === 'reveal' || name === 'goal' || name === 'tips' || name === 'group' || name === 'end') playBgm('kekka');
  else if (name !== 'title') playBgm('main');
  if (name !== 'camera') stopCamera();
}

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------- 音 ----------
function setSound(on) {
  setEnabled(on);
  const b = $('#sound');
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', on ? '音を消す' : '音を出す');
  b.classList.toggle('off', !on);
  try { localStorage.setItem('kao-sound', on ? '1' : '0'); } catch { /* 保存できなくてもよい */ }
}
let soundPref = true;
try { soundPref = localStorage.getItem('kao-sound') !== '0'; } catch { /* なし */ }
if (params.get('nosound') === '1') soundPref = false;
setSound(soundPref);
$('#sound').addEventListener('click', () => {
  const next = !isEnabled();
  initAudio(next);
  setSound(next);
  if (!next) stopVoice();
});

// 「、」などで区切った言葉ごとに折り返す（行の途中で言葉が切れないように）
const phr = (s) => esc(s).split(/(?<=[、。）」])|(?=[（「])/).map((x) => `<span class="ph">${x}</span>`).join('');
const nameOf = (p, i) => p.nick || `${i + 1}人目`;

// ダイアログ（古い iPhone でも開け閉めできるように）
function openDialog(d) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
function closeDialog(d) { if (d.close) d.close(); else d.removeAttribute('open'); }
const openDialogEl = () => [...document.querySelectorAll('dialog')].find((d) => d.open);

// スマホ本体の「戻る」でサイトから出ないように、1つ分の足場を置く
let guard = false;
function ensureGuard() { if (!guard) { history.pushState({ kao: 1 }, ''); guard = true; } }
window.addEventListener('popstate', () => {
  guard = false;
  const d = openDialogEl();
  if (d) closeDialog(d);
  else if (state.screen !== 'title') goBack();
  if (state.screen !== 'title') ensureGuard();
});

// ---------- タイトル ----------
$('#titleChart').innerHTML = chartSVG({ corners: 'f', names: false });
$('#typeStrip').innerHTML = TYPES.map((t, i) => `<figure class="strip-item" style="--c:${t.color}">
  <span class="strip-img"><img src="img/${i % 2 ? 'm' : 'f'}_${t.id}.webp" alt="" loading="lazy" width="384" height="540"></span>
  <figcaption><b>${esc(t.name)}</b><span>${esc(t.catch)}</span></figcaption></figure>`).join('');
// 下へ読み進めたときも、画面の下に「診断をはじめる」を出す
// （ボタンが画面の上へ流れていったら出す。スクロールのたびに位置を確かめるので、速くスクロールしても見逃さない）
let stickyRaf = 0;
function updateSticky() {
  stickyRaf = 0;
  const r = $('#start').getBoundingClientRect();
  $('#stickyCta').hidden = state.screen !== 'title' || r.bottom > 0;
}
window.addEventListener('scroll', () => { if (!stickyRaf) stickyRaf = requestAnimationFrame(updateSticky); }, { passive: true });
window.addEventListener('resize', () => { if (!stickyRaf) stickyRaf = requestAnimationFrame(updateSticky); });
$('#start2').addEventListener('click', () => $('#start').click());
$('#start').addEventListener('click', () => {
  $('#stickyCta').hidden = true;
  initAudio(isEnabled());
  setSound(isEnabled());
  say('v01_title');
  playBgm('main');
  show('count');
});

// ---------- 人数 ----------
$('#countGrid').addEventListener('click', (e) => {
  const b = e.target.closest('.count');
  if (!b) return;
  chime('tap');
  state.count = Number(b.dataset.n);
  state.people = [];
  state.idx = 0;
  startPerson();
});

function startPerson() {
  const i = state.idx;
  state.people[i] = state.people[i] || { nick: '', gender: i === 0 ? 'f' : (state.people[i - 1]?.gender === 'f' ? 'm' : 'f'), answers: {}, photoPicks: {} };
  const p = me();
  if (i > 0) state.history = [];       // 前の人の画面へはもどらない
  $('#personStep').textContent = state.count > 1 ? `STEP 2 ・ ${i + 1} / ${state.count}人目` : 'STEP 2';
  $('#personTitle').textContent = state.count > 1 ? `${i + 1}人目のかた` : 'あなたのことを教えてください';
  $('#nick').value = p.nick;
  setGender(p.gender);
  show('person');
}
function setGender(g) {
  me().gender = g;
  for (const b of $$('#genderSeg button')) b.setAttribute('aria-checked', String(b.dataset.g === g));
}
$('#genderSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { chime('tap'); setGender(b.dataset.g); } });
$('#personNext').addEventListener('click', () => {
  const nick = $('#nick').value.trim().slice(0, 8);
  me().nick = nick || (state.count > 1 ? `${state.idx + 1}人目` : '');
  show('mode');
});
$('#nick').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#nick').blur(); } });

// ---------- 方法 ----------
$('#modeQuiz').addEventListener('click', () => { chime('tap'); me().mode = 'quiz'; me().photoPicks = {}; beginQuiz(); });
let privacyVoice = Promise.resolve();
$('#modePhoto').addEventListener('click', () => { chime('tap'); me().mode = 'photo'; privacyVoice = say('v03_privacy'); openCamera(); });

// ---------- カメラ ----------
let stream = null;
let photoMod = null;
async function openCamera() {
  show('camera');
  const status = $('#camStatus');
  const video = $('#video');
  $('#still').hidden = true;
  video.hidden = false;
  $('#camDots').innerHTML = '';
  $('#shutter').disabled = true;
  status.textContent = '顔を読み取る準備をしています…';
  photoMod = photoMod || import('./photo.js');
  const mod = await photoMod;
  mod.loadLandmarker((p) => { if (state.screen === 'camera' && !stream) status.textContent = `準備しています… ${Math.round(p * 100)}%`; })
    .then(() => { if (state.screen === 'camera' && stream) { $('#shutter').disabled = false; status.textContent = '顔を枠に合わせて、撮ってください'; } })
    .catch(() => { status.textContent = '読み取りの準備ができませんでした。質問で答えてください。'; });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    if (state.screen !== 'camera') { stopCamera(); return; }
    video.srcObject = stream;
    await video.play();
    // 「写真はスマホの中だけ」の声が終わってから、撮り方の声
    privacyVoice.then(() => { if (state.screen === 'camera' && !analyzing) say('v04_photo'); });
    status.textContent = 'カメラの準備ができました';
    mod.loadLandmarker().then(() => { if (state.screen === 'camera') { $('#shutter').disabled = false; status.textContent = '顔を枠に合わせて、撮ってください'; } }).catch(() => {});
  } catch {
    status.textContent = 'カメラが使えませんでした。「アルバムから選ぶ」か、質問で答えてください。';
  }
}
function stopCamera() {
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
}
let analyzing = false;
let analyzeToken = 0;
$('#shutter').addEventListener('click', async () => {
  const video = $('#video');
  if (analyzing || !video.videoWidth) return;
  const cv = $('#still');
  cv.width = video.videoWidth; cv.height = video.videoHeight;
  const c = cv.getContext('2d');
  c.translate(cv.width, 0); c.scale(-1, 1);       // 見たままの向き（鏡）で残す
  c.drawImage(video, 0, 0);
  chime('step');
  stopCamera();
  cv.hidden = false; video.hidden = true;
  await analyzePhoto(cv);
});
$('#photoFile').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f || analyzing) return;
  const img = new Image();
  img.src = URL.createObjectURL(f);
  try { await img.decode(); } catch { URL.revokeObjectURL(img.src); toast('写真を読み込めませんでした'); return; }
  const cv = $('#still');
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  cv.width = Math.round(img.naturalWidth * scale); cv.height = Math.round(img.naturalHeight * scale);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(img.src);
  stopCamera();
  cv.hidden = false; $('#video').hidden = true;
  await analyzePhoto(cv);
});
$('#camSkip').addEventListener('click', () => { analyzeToken++; analyzing = false; me().mode = 'quiz'; me().photoPicks = {}; beginQuiz(); });

async function analyzePhoto(cv) {
  const token = ++analyzeToken;
  analyzing = true;
  $('#shutter').disabled = true;
  const status = $('#camStatus');
  status.textContent = '顔の比率を測っています…';
  const mod = await photoMod;
  let res;
  try { res = await mod.analyze(cv); } catch { res = { ok: false, reason: 'noface' }; }
  if (token !== analyzeToken || state.screen !== 'camera') { analyzing = false; clearStill(cv); return; }
  if (!res.ok) {
    analyzing = false;
    status.textContent = mod.REASON_TEXT[res.reason] || mod.REASON_TEXT.noface;
    clearStill(cv);
    setTimeout(() => { if (state.screen === 'camera' && token === analyzeToken) openCamera(); }, 2600 / TS);
    return;
  }
  // 測った点をきらっと見せる。写真は枠いっぱいに切り取って（cover）表示しているので、その分を補正する
  const dots = $('#camDots');
  const box = cv.getBoundingClientRect();
  const camBox = $('#cam').getBoundingClientRect();
  const s = Math.max(box.width / cv.width, box.height / cv.height);
  const ox = box.left - camBox.left + (box.width - cv.width * s) / 2;
  const oy = box.top - camBox.top + (box.height - cv.height * s) / 2;
  const key = [10, 152, 234, 454, 33, 133, 263, 362, 159, 145, 386, 374, 2, 0, 17, 61, 291, 172, 397, 107, 336, 168];
  dots.innerHTML = key.map((k, i) => {
    const pt = res.landmarks[k];
    return `<i style="left:${(ox + pt.x * cv.width * s).toFixed(1)}px;top:${(oy + pt.y * cv.height * s).toFixed(1)}px;--d:${i * 0.035}s"></i>`;
  }).join('');
  me().photoPicks = photoAnswers(res.measures);
  me().answers = { ...me().photoPicks };
  res.landmarks = null;
  status.textContent = `${Object.keys(me().photoPicks).length}問の答えを読み取りました`;
  chime('reveal');
  await wait(1900);
  dots.innerHTML = '';
  clearStill(cv);
  analyzing = false;
  if (token !== analyzeToken || state.screen !== 'camera') return;   // 待っている間に別の操作をしたら、そちらを優先
  openPhotoReview();
}

// 写真は残さない：測り終わったら画面からも消す
function clearStill(cv) {
  const c = cv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  cv.width = 1; cv.height = 1;
}

// ---------- 写真の目安（写真から分かる答えを、まとめて先に見せる） ----------
function openPhotoReview() {
  renderPhotoReview();
  show('photo');
  say('v02_howto');
}
function renderPhotoReview() {
  const p = me();
  const qs = QUESTIONS.filter((q) => p.photoPicks[q.id] !== undefined);
  const rest = QUESTIONS.length - qs.length;
  $('#prCount').textContent = qs.length;
  const SHORT = { q01: '顔の形', q02: 'フェイスライン', q03: '顔の中央の長さ', q04: '目の形', q05: '目の大きさ', q06: '眉の形', q07: 'あごの長さ', q08: 'くちびる', q09: '鼻の長さ', q10: 'ほおの肉づき', q11: 'おでこの広さ', q12: '鼻先の形' };
  const restNames = QUESTIONS.filter((q) => p.photoPicks[q.id] === undefined).map((q) => SHORT[q.id]);
  $('#prRestText').textContent = `「${restNames.join('」「')}」は、写真では正確に測れないため、このあと自分で答えます（${rest}問）。`;
  $('#prNext').textContent = `残りの${rest}問に答える`;
  $('#prList').innerHTML = qs.map((q) => {
    const picked = p.answers[q.id];
    return `<div class="pr-item" data-q="${q.id}">
      <p class="pr-title">${esc(q.title)}</p>
      <div class="pr-opts" style="--n:${q.options.length}">${q.options.map((o, i) => `
        <button type="button" class="pr-opt${picked === i ? ' on' : ''}" data-i="${i}" aria-pressed="${picked === i}">
          <span class="pr-art">${faceSVG({ [q.param]: o.val }, { gender: p.gender, focus: q.param, label: o.label })}</span>
          <span class="pr-label">${phr(o.label)}</span>
          ${p.photoPicks[q.id] === i ? '<span class="badge">写真の目安</span>' : ''}
        </button>`).join('')}</div>
    </div>`;
  }).join('');
}
$('#prList').addEventListener('click', (e) => {
  const b = e.target.closest('.pr-opt');
  if (!b) return;
  chime('tap');
  const item = b.closest('.pr-item');
  me().answers[item.dataset.q] = Number(b.dataset.i);
  for (const x of item.querySelectorAll('.pr-opt')) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }
});
$('#prNext').addEventListener('click', () => { chime('step'); beginQuiz(); });

// ---------- 質問 ----------
// 写真を使ったときは、写真で答えが入らなかった質問だけを出す（state.list ＝ 出す質問の並び）
const curQ = () => QUESTIONS[state.list[state.q]];
function beginQuiz() {
  const p = me();
  if (p.mode !== 'photo') { p.answers = {}; p.photoPicks = {}; }
  state.list = QUESTIONS.map((q, i) => i).filter((i) => p.mode !== 'photo' || p.photoPicks[QUESTIONS[i].id] === undefined);
  state.q = 0;
  renderQuestion();
  show('quiz');
  if (p.mode !== 'photo') say('v02_howto');
}
function renderQuestion() {
  const q = curQ();
  const p = me();
  const total = state.list.length;
  $('#qNum').textContent = String(state.q + 1).padStart(2, '0');
  $('#qOf').textContent = `/ ${String(total).padStart(2, '0')}`;
  $('#qTitle').textContent = q.title;
  $('#qHint').textContent = q.hint;
  $('#qProText').textContent = PRO[q.id] || '';
  $('#qPrev').hidden = state.q === 0;
  $('#progressBar').style.width = `${(state.q / total) * 100}%`;
  $('#qPhoto').hidden = true;
  const picked = p.answers[q.id];
  $('#options').classList.toggle('four', q.options.length === 4);
  $('#options').innerHTML = q.options.map((o, i) => `
    <button type="button" class="opt${picked === i ? ' on' : ''}" role="radio" aria-checked="${picked === i}" data-i="${i}">
      <span class="opt-art">${faceSVG({ [q.param]: o.val }, { gender: p.gender, focus: q.param, label: o.label })}</span>
      <span class="opt-label">${phr(o.label)}</span>
    </button>`).join('');
  $('#qNext').hidden = picked === undefined || picked === SKIP;
  $('#qDots').innerHTML = state.list.map((x, i) => `<li class="${i < state.q ? 'done' : i === state.q ? 'now' : ''}"></li>`).join('');
  $('#qSkip').classList.toggle('on', picked === SKIP);
}
let nextTimer = null;
function answer(val) {
  const p = me();
  p.answers[curQ().id] = val;
  chime('tap');
  for (const b of $$('#options .opt')) {
    const on = Number(b.dataset.i) === val;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
  }
  $('#qSkip').classList.toggle('on', val === SKIP);
  clearTimeout(nextTimer);
  nextTimer = setTimeout(nextQuestion, 380 / TS);
}
function nextQuestion() {
  if (state.screen !== 'quiz') return;
  if (state.q < state.list.length - 1) {
    state.q++;
    if (state.list.length >= 10 && state.q === Math.floor(state.list.length / 2)) say('v05_half');
    const box = $('#s-quiz .pad');
    box.classList.remove('slide', 'slide-back'); void box.offsetWidth; box.classList.add('slide');
    renderQuestion();
    window.scrollTo({ top: 0 });
  } else {
    $('#progressBar').style.width = '100%';
    finishQuiz();
  }
}
$('#options').addEventListener('click', (e) => { const b = e.target.closest('.opt'); if (b) answer(Number(b.dataset.i)); });
$('#qSkip').addEventListener('click', () => answer(SKIP));
$('#qNext').addEventListener('click', () => { chime('tap'); nextQuestion(); });
// 前の質問にもどる（選んだ答えは残っているので、選び直すか「これで次へ」）
$('#qPrev').addEventListener('click', () => {
  if (state.q === 0) return;
  chime('tap');
  clearTimeout(nextTimer);
  state.q--;
  const box = $('#s-quiz .pad');
  box.classList.remove('slide', 'slide-back'); void box.offsetWidth; box.classList.add('slide-back');
  renderQuestion();
  window.scrollTo({ top: 0 });
});
// ---------- 読み解き → 結果 ----------
async function finishQuiz() {
  const p = me();
  p.result = classify(p.answers);
  p.point = chartPoint(p.result);
  show('reveal');
  const rc = $('#revealChart');
  rc.innerHTML = chartSVG({ names: false });
  rc.classList.remove('done');
  const texts = ['あなたの顔立ちを読み解いています', '大人っぽさを測っています', 'やわらかさを測っています'];
  for (const t of texts) { $('#revealText').textContent = t; await wait(850); }
  rc.innerHTML = chartSVG({ names: false, points: [{ ...p.point, me: true }] });
  rc.classList.add('done');
  chime('reveal');
  await wait(1100);
  renderResult();
  show('result', { push: false });
  say('v06_result');
  if (!p.counted) { p.counted = true; stat('result', { type: p.result.type.id, gender: p.gender, mode: p.mode, n: state.count }); }
}

function renderResult() {
  const p = me();
  const t = p.result.type;
  $('#resWho').textContent = p.nick ? `${p.nick}の FACE BALANCE` : 'YOUR FACE BALANCE';
  $('#resImg').src = `img/${p.gender}_${t.id}.webp`;
  $('#resImg').alt = `${t.name}の顔立ちのイラスト`;
  $('#resName').textContent = t.name;
  $('#resCatch').innerHTML = phr(t.catch);
  $('#s-result').style.setProperty('--type', t.color);
  $('#resChart').innerHTML = chartSVG({ points: [{ ...p.point, me: true }], highlight: t.id });
  const answered = Object.values(p.answers).filter((v) => v !== SKIP && v !== undefined).length;
  const note = answered === 0 ? '答えがなかったため、チャートの真ん中に近いタイプを表示しています。鏡を見ながら、もう一度試してみてください。'
    : answered < 8 ? `「わからない」が多かったため、${answered}問の答えから出した目安の結果です。鏡を見ながら、もう一度試してみるのもおすすめです。` : p.result.balanced ? 'あなたは、ちょうどチャートの真ん中あたり。どの方向にも寄せられる「バランス顔」です。いちばん近いタイプを表示しています。' : '';
  $('#resBalanced').textContent = note;
  $('#resBalanced').hidden = !note;
  $('#resCharm').textContent = t.charm;
  $('#resFeatures').innerHTML = t.features.map((f) => `<li>${esc(f)}</li>`).join('');
  const s = t.suits[p.gender];
  const rows = [['髪型', s.hair], ['眉', s.brow], [p.gender === 'm' ? '肌・小物' : 'メイク', s.make], ['服', s.fashion]];
  $('#resSuits').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${phr(v)}</dd></div>`).join('');
}

// ---------- なりたい印象 ----------
$('#toGoal').addEventListener('click', () => {
  chime('tap');
  const p = me();
  $('#goalGrid').innerHTML = GOALS.map((g) => `<button type="button" class="goal${p.goal && p.goal.id === g.id ? ' on' : ''}" role="radio" aria-checked="${p.goal && p.goal.id === g.id}" data-id="${g.id}">${phr(g.label)}${g.type === p.result.type.id ? '<small>いまのタイプ</small>' : ''}</button>`).join('');
  $('#toTips').disabled = !p.goal;
  drawGoalChart();
  show('goal');
  say('v07_goal');
});
function drawGoalChart() {
  const p = me();
  const gp = p.goal ? typeCenter(p.goal.type) : null;
  $('#goalChart').innerHTML = chartSVG({ points: [{ ...p.point, me: true }], highlight: p.goal ? p.goal.type : p.result.type.id,
    arrow: gp && p.goal.type !== p.result.type.id ? { from: p.point, to: gp } : null, goal: gp && p.goal.type !== p.result.type.id ? gp : null });
}
$('#goalGrid').addEventListener('click', (e) => {
  const b = e.target.closest('.goal');
  if (!b) return;
  chime('tap');
  const p = me();
  p.goal = GOALS.find((g) => g.id === b.dataset.id);
  for (const x of $$('#goalGrid .goal')) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); }
  $('#toTips').disabled = false;
  drawGoalChart();
});

// ---------- コツ ----------
const ICONS = {
  hair: '<svg viewBox="0 0 32 32"><path d="M8 26c-2-8 0-17 8-18s11 6 9 13c-1 3-1 5 0 6M12 14c3 1 7 0 9-3"/></svg>',
  brow: '<svg viewBox="0 0 32 32"><path d="M6 12c5-4 14-4 20 1M8 20c3-3 13-3 16 0-3 3-13 3-16 0zM16 20h.01"/></svg>',
  skin: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="9"/><path d="M12 15c1.5-1 3-1 4 0M17 18c1.5 1 3 1 4 0"/></svg>',
};
function featureHTML(big = false) {
  const page = FEATURE_PAGE ? `P.${esc(FEATURE_PAGE)}の` : '';
  const p = me();
  const cats = new Set((p?.tips || []).map((t) => t.category));
  const n = shops.filter((s) => s.cats.some((c) => cats.has(c)) && (!s.for || s.for.includes(p?.gender))).length;
  return `<button type="button" class="feature-btn" data-shops="">
    <span class="feature-art" aria-hidden="true"><img src="img/spot_mirror.webp" alt="" loading="lazy"></span>
    <span class="feature-body">
      <span class="feature-kicker">${esc(ISSUE_LABEL)}</span>
      <b>${phr(`誌面${page}「${FEATURE_TITLE}」`)}</b>
      <span>${n ? `あなたにおすすめの掲載店 ${n}件を見る` : (big ? '似合うを叶えるお店や、プロのアドバイスを紹介しています。' : 'プロのアドバイスとお店を紹介しています。')}</span>
    </span>
    <span class="feature-arrow" aria-hidden="true">›</span>
  </button>`;
}

// ---------- おすすめの掲載店 ----------
const SPOT = { hair: 'spot_hair', brow: 'spot_brow', skin: 'spot_skin' };
const CAT_LABEL = (id, g) => { const c = CATEGORIES.find((x) => x.id === id); return g === 'm' && c.labelM ? c.labelM : c.label; };
// その人に合うお店：コツの分野と同じ順、主なお客さまが合うお店を先に
function shopsFor(p) {
  if (!p) return shops;
  const cats = (p.tips || []).map((t) => t.category);
  const score = (s) => {
    const i = cats.findIndex((c) => s.cats.includes(c));
    return (i < 0 ? 10 : i) + (s.for && !s.for.includes(p.gender) ? 5 : 0);
  };
  return shops.filter((s) => !s.for || s.for.includes(p.gender) || cats.some((c) => s.cats.includes(c)))
    .slice().sort((a, b) => score(a) - score(b));
}
function shopCard(s, p, rec) {
  const tip = (p?.tips || []).find((t) => s.cats.includes(t.category));
  const cat = tip ? tip.category : s.cats[0];
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`;
  return `<article class="shopcard${rec ? ' rec' : ''}" id="shop-${esc(s.id)}">
    <div class="shopcard-head">
      <span class="shopcard-art" aria-hidden="true"><img src="img/${SPOT[cat]}.webp" alt="" loading="lazy"></span>
      <div>
        <span class="shopcard-kind">${esc(s.kind)}・${esc(s.area)}</span>
        <h3>${phr(s.name)}</h3>
        ${s.page ? `<span class="shopcard-page">誌面 P.${esc(s.page)}</span>` : ''}
      </div>
    </div>
    ${s.photo ? `<figure class="shopcard-photo"><img src="${esc(s.photo)}" alt="${esc(s.photoAlt || s.name)}" loading="lazy"><figcaption>くれよん誌面より</figcaption></figure>` : ''}
    ${rec && tip ? `<p class="shopcard-why"><b>あなたへのおすすめ</b>${esc(s.tipNote?.[cat] || `${CAT_LABEL(cat, p.gender)}のことを相談するなら`)}<span>コツ「${esc(tip.title)}」</span></p>` : ''}
    <p class="shopcard-catch">${esc(s.catch)}</p>
    ${s.menu?.length ? `<dl class="shopcard-menu">${s.menu.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    ${s.coupon ? `<p class="shopcard-coupon"><span>くれよんクーポン</span>${esc(s.coupon)}</p>` : ''}
    <ul class="shopcard-info">
      <li><b>住所</b>${esc(s.address)}</li>
      ${s.hours ? `<li><b>時間</b>${esc(s.hours)}</li>` : ''}
      ${s.holiday ? `<li><b>休み</b>${esc(s.holiday)}</li>` : ''}
    </ul>
    <div class="shopcard-actions${s.url ? ' three' : ''}">
      <a class="mini-btn" href="tel:${esc(s.tel.replace(/[^0-9]/g, ''))}" data-stat="shop:${esc(s.id)}">電話する<small>${esc(s.tel)}</small></a>
      <a class="mini-btn" href="${mapUrl}" target="_blank" rel="noopener" data-stat="shop:${esc(s.id)}">地図を見る</a>
      ${s.url && /^https:\/\//.test(s.url) ? `<a class="mini-btn hp" href="${esc(s.url)}" target="_blank" rel="noopener" data-stat="shop:${esc(s.id)}">ホームページ</a>` : ''}
    </div>
  </article>`;
}
function openShops(focusId = '') {
  const p = me();
  const list = shopsFor(p);
  const cats = new Set((p?.tips || []).map((t) => t.category));
  const rec = list.filter((s) => s.cats.some((c) => cats.has(c)) && (!s.for || s.for.includes(p?.gender)));
  const others = list.filter((s) => !rec.includes(s));
  $('#shopsKicker').textContent = (FEATURE_PAGE ? `P.${FEATURE_PAGE} ` : '') + FEATURE_TITLE.toUpperCase().replace('ビューティー特集', 'BEAUTY SALONS');
  $('#shopsTitle').textContent = rec.length ? 'あなたにおすすめの掲載店' : `${FEATURE_TITLE}の掲載店`;
  $('#shopsLead').textContent = rec.length
    ? `「${p.goal ? p.goal.label : 'なりたい印象'}」に近づくコツを、相談できるお店です。誌面ではくわしい情報や写真を紹介しています。`
    : '誌面ではくわしい情報や写真を紹介しています。';
  $('#shopsList').innerHTML = (list.length
    ? rec.map((s) => shopCard(s, p, true)).join('') + (others.length ? `<p class="shops-other">そのほかの掲載店</p>${others.map((s) => shopCard(s, p, false)).join('')}` : '')
    : `<div class="shops-empty"><img src="img/spot_mirror.webp" alt="" loading="lazy"><p>掲載店の情報は、誌面の「${esc(FEATURE_TITLE)}」でご覧ください。</p></div>`);
  $('#shopsNote').textContent = DEMO ? DEMO_NOTE : '料金・営業時間などは掲載時点の情報です。お出かけ前にお店にご確認ください。';
  const d = $('#shopsSheet');
  openDialog(d);
  d.querySelector('.sheet-inner').scrollTop = 0;
  d.scrollTop = 0;
  if (focusId) {
    const el = document.getElementById(`shop-${focusId}`);
    if (el) { el.classList.add('focus'); setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250); }
  }
  stat('tap', { target: focusId ? `shop:${focusId}` : 'page', type: p?.result?.type.id });
}
for (const b of $$('#shopsSheet [data-close]')) b.addEventListener('click', () => closeDialog($('#shopsSheet')));
$('#shopsSheet').addEventListener('click', (e) => { if (e.target.id === 'shopsSheet') closeDialog($('#shopsSheet')); });
$('#toTips').addEventListener('click', () => {
  const p = me();
  if (!p.goal) return;
  chime('step');
  const plan = pickTips(p.result, p.goal.id, p.gender);
  p.tips = plan.tips;
  p.goalType = p.goal.type;
  p.goalPoint = typeCenter(p.goal.type);
  $('#tipsTitle').innerHTML = plan.same ? 'いまの魅力を、<br>もっと引き立てる3つのコツ' : `「${esc(p.goal.label)}」に<br>近づく3つのコツ`;
  $('#tipsSub').textContent = plan.same
    ? 'なりたい印象は、いまのあなたの魅力そのもの。強みを伸ばすコツを選びました。'
    : 'ひとつだけでも印象は変わります。気になるものから試してみてください。';
  $('#tipsList').innerHTML = plan.tips.map((t, i) => {
    const cat = CATEGORIES.find((c) => c.id === t.category);
    const list = shopsFor(p).filter((s) => s.cats.includes(t.category) && (!s.for || s.for.includes(p.gender)));
    const shopHTML = list.length ? `<div class="shops"><p class="shops-h">プロに相談するなら</p>${list.map((s) => `
        <button type="button" class="shop" data-shops="${esc(s.id)}">
          <span class="shop-text"><b>${phr(s.name)}</b><span class="shop-meta">${esc(s.kind)}・${esc(s.area)}${s.page ? ` ・ 誌面 P.${esc(s.page)}` : ''}</span></span>
          <span class="shop-arrow" aria-hidden="true">›</span>
        </button>`).join('')}</div>` : '';
    return `<article class="tip" style="--d:${i * 0.12}s">
      <div class="tip-head"><span class="tip-icon" aria-hidden="true">${ICONS[cat.icon]}</span><span class="tip-cat">${esc(t.label)}</span><span class="tip-no">0${i + 1}</span></div>
      <h3 class="tip-title">${phr(t.title)}</h3>
      <p class="tip-why"><span>なぜ？</span>${esc(t.why)}</p>
      ${t.nail && p.gender === 'f' ? `<p class="tip-plus">${esc(t.nail)}</p>` : ''}
      ${shopHTML}
    </article>`;
  }).join('');
  $('#featureLink').innerHTML = featureHTML(false);
  const last = state.idx >= state.count - 1;
  $('#nextPerson').textContent = !last ? `次の人（${state.idx + 2}人目）へ` : state.count > 1 ? 'みんなの顔立ちチャートを見る' : 'おわりへ';
  show('tips');
  say('v08_tips').then(() => { if (!last && state.screen === 'tips') say('v09_family'); });
  prepareCard(p);
  stat('goal', { type: p.result.type.id, goal: p.goal.id, gender: p.gender });
});
$('#nextPerson').addEventListener('click', () => {
  chime('tap');
  if (state.idx < state.count - 1) { state.idx++; startPerson(); return; }
  if (state.count > 1) { renderGroup(); show('group'); return; }
  toEnd();
});

// ---------- みんな ----------
function renderGroup() {
  const done = state.people.map((p, i) => ({ p, i })).filter(({ p }) => p && p.result);
  const pts = done.map(({ p, i }) => ({ ...p.point, label: nameOf(p, i), color: PERSON_COLORS[i] }));
  $('#groupChart').innerHTML = chartSVG({ points: pts });
  $('#groupComment').textContent = groupComment(done.map(({ p }) => p.result));
  $('#groupList').innerHTML = done.map(({ p, i }) => `<li><i style="background:${PERSON_COLORS[i]}"></i><b>${esc(nameOf(p, i))}</b><span>${esc(p.result.type.name)}</span><small>なりたい：${esc(p.goal ? p.goal.label : '')}</small><button type="button" class="mini-save" data-save="${i}">画像で保存</button></li>`).join('');
  say('v09_family');
}
$('#toEnd').addEventListener('click', () => { chime('tap'); toEnd(); });
function toEnd() {
  $('#endFeature').innerHTML = featureHTML(true);
  const lastP = state.people[state.people.length - 1];
  $('#endSave').textContent = state.count > 1 ? `${nameOf(lastP, state.people.length - 1)}の結果を画像で保存` : '結果を画像で保存';
  show('end');
  say('v10_end');
}
$('#again').addEventListener('click', () => {
  chime('tap');
  state.people = []; state.idx = 0; state.history = [];
  show('count', { push: false });
});

// ---------- 保存 ----------
// iPhone では、ボタンを押してからすぐに共有画面を開かないと断られることがあるので、画像は先に作っておく
let cardMod = null;
function prepareCard(p) {
  p.cardBlob = null;
  cardMod = cardMod || import('./card.js');
  const key = `${p.result.type.id}|${p.goal?.id}`;
  p.cardKey = key;
  cardMod.then((m) => m.makeCardBlob(p)).then((blob) => { if (p.cardKey === key) p.cardBlob = blob; }).catch(() => {});
}
async function save(person) {
  if (!person || !person.result) return;
  try {
    cardMod = cardMod || import('./card.js');
    const m = await cardMod;
    let blob = person.cardBlob;
    if (!blob) { toast('画像を作っています…', 4000); blob = await m.makeCardBlob(person); person.cardBlob = blob; }
    const r = await m.deliverCard(blob, person.result.type.id);
    if (r === 'shared') toast('保存・共有の画面を開きました');
    else if (r === 'downloaded') toast('画像をダウンロードしました');
    if (r !== 'cancel') stat('save', { type: person.result.type.id });
  } catch {
    toast('画像を作れませんでした。画面を長押しして保存してください');
  }
}
$('#saveCard').addEventListener('click', () => save(me()));
$('#endSave').addEventListener('click', () => save(state.people[state.people.length - 1]));
$('#groupList').addEventListener('click', (e) => { const b = e.target.closest('[data-save]'); if (b) save(state.people[Number(b.dataset.save)]); });

// ---------- 誌面・お店へのタップ（数える／シートを開く） ----------
document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-shops]');
  if (o) { chime('tap'); openShops(o.dataset.shops); return; }
  const b = e.target.closest('[data-stat]');
  if (b) stat('tap', { target: b.dataset.stat, type: me()?.result?.type.id });
});

// ---------- もどる（画面の左上のボタンと、スマホ本体の戻る） ----------
function goBack() {
  const s = state.screen;
  if (s === 'reveal' || (s === 'person' && state.idx > 0)) return;      // 読み解き中・2人目以降の入力画面からはもどらない
  if (s === 'quiz' && state.q > 0) {
    clearTimeout(nextTimer); state.q--;
    const box = $('#s-quiz .pad');
    box.classList.remove('slide', 'slide-back'); void box.offsetWidth; box.classList.add('slide-back');
    renderQuestion(); return;
  }
  if (s === 'camera') { analyzeToken++; analyzing = false; }
  if (s === 'goal') { if (state.history[state.history.length - 1] === 'result') state.history.pop(); show('result', { push: false }); return; }
  const prev = state.history.pop();
  if (!prev || prev === 'reveal') { show('title', { push: false }); return; }
  if (prev === 'camera') { show('mode', { push: false }); return; }
  if (prev === 'quiz') { renderQuestion(); }
  if (prev === 'tips' || prev === 'group') { show(prev, { push: false }); return; }
  show(prev, { push: false });
}
$('#back').addEventListener('click', () => { chime('tap'); goBack(); });

// ---------- 根拠のシート ----------
// 根拠・使い方のシート（data-open="ダイアログのid"）
for (const b of $$('[data-open]')) b.addEventListener('click', () => { chime('tap'); openDialog(document.getElementById(b.dataset.open)); });
for (const d of $$('#about, #howto')) {
  for (const b of d.querySelectorAll('[data-close]')) b.addEventListener('click', () => closeDialog(d));
  d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); });
}
$('#credit').textContent = `${ISSUE_LABEL}　企画・制作 ケイ・クリエイト`;

// ---------- 確認用の入口（自動テストで使う） ----------
// 手元・確認用だけ（本番のアドレスでは作らない）
if (DEMO_HOSTS.some((h) => location.hostname === h || location.hostname.endsWith(`.${h}`))) window.__game = {
  state,
  types: TYPES,
  screen: () => state.screen,
  // pattern: 'lv0soft' のように指定すると、そのタイプになる答えを入れて結果へ
  async quickAnswer(fn) {
    for (let i = state.q; i < state.list.length; i++) {
      const q = curQ();
      const pick = fn(q, state.q);
      answer(pick);
      await new Promise((r) => setTimeout(r, 420 / TS));
    }
  },
};
