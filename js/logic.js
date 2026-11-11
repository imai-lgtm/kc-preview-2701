// 診断のルール（画面に関係しない計算だけ）。Node でもブラウザでも動く
import { QUESTIONS, SKIP, A_CUTS, TYPES, LV_CENTER, SIDE_CENTER, GOALS, TIPS, CATEGORIES, PHOTO_RULES } from './data.js';

const byId = (id) => QUESTIONS.find((q) => q.id === id);

// answers = { q01: 0|1|2|'skip', ... }（選んだ選択肢の番号）
// → { a: 大人っぽさ -1〜1, b: シャープさ -1〜1, answeredA, answeredB }
export function scores(answers) {
  const sum = { A: 0, B: 0 };
  const wsum = { A: 0, B: 0 };
  for (const q of QUESTIONS) {
    const pick = answers[q.id];
    if (pick === undefined || pick === SKIP) continue;
    const opt = q.options[pick];
    if (!opt) continue;
    sum[q.axis] += opt.v * q.w;
    wsum[q.axis] += q.w;
  }
  return {
    a: wsum.A ? sum.A / wsum.A : 0,
    b: wsum.B ? sum.B / wsum.B : 0,
    answeredA: wsum.A > 0,
    answeredB: wsum.B > 0,
  };
}

// ちょうど0のときは、効きやすい質問の答えで決める
function tieBreak(answers, ids) {
  for (const id of ids) {
    const pick = answers[id];
    if (pick === undefined || pick === SKIP) continue;
    const v = byId(id).options[pick].v;
    if (v) return v;
  }
  return 0;
}

export function classify(answers) {
  const s = scores(answers);
  let lv;
  if (s.a <= A_CUTS[0]) lv = 0;
  else if (s.a < A_CUTS[1]) lv = 1;
  else if (s.a === A_CUTS[1]) lv = tieBreak(answers, ['q01', 'q03', 'q05']) > 0 ? 2 : 1;
  else if (s.a < A_CUTS[2]) lv = 2;
  else lv = 3;
  let side;
  if (s.b < 0) side = 'soft';
  else if (s.b > 0) side = 'sharp';
  else side = tieBreak(answers, ['q02', 'q04', 'q10']) > 0 ? 'sharp' : 'soft';
  const type = TYPES.find((t) => t.lv === lv && t.side === side);
  const balanced = Math.abs(s.a) < 0.15 && Math.abs(s.b) < 0.15;
  return { ...s, lv, side, type, balanced };
}

// チャートに点を置く位置（-1〜1）。点がタイプの区切りとずれて見えないよう、
// タイプの区画の中に収める（区画の外にはみ出さない）
export function chartPoint(result) {
  const lvRange = [[-1, A_CUTS[0]], [A_CUTS[0], 0], [0, A_CUTS[2]], [A_CUTS[2], 1]][result.lv];
  const pad = 0.12;
  const padY = result.lv === 1 || result.lv === 2 ? 0.22 : 0.2;   // 区画の上の名前と重ならないように
  const y = Math.min(lvRange[1] - padY, Math.max(lvRange[0] + 0.1, result.a));
  const outer = 0.2;   // チャートの外側の枠とタイプ名から少し離す
  const x = result.side === 'soft' ? Math.min(-pad, Math.max(-1 + outer, result.b)) : Math.max(pad, Math.min(1 - outer, result.b));
  return { x, y };
}

export function typeCenter(typeId) {
  const t = TYPES.find((x) => x.id === typeId);
  return { x: SIDE_CENTER[t.side], y: LV_CENTER[t.lv] };
}

// なりたい印象に近づくコツを3つ（髪・まつげ眉・肌）選ぶ。gender: 'f' | 'm'
// 向きは「なりたいタイプ」に必ず合わせる（チャートの点の細かい位置ではなく、タイプの段階と側で決める）
//   やわらか⇔シャープ：なりたいタイプの側へ（同じ側なら、その側をさらに引き立てる）
//   大人っぽさ：なりたいタイプの段階が上なら大人っぽく、下ならあどけなく。同じ段階なら、その段階の向き
export function pickTips(result, goalId, gender = 'f') {
  const goal = GOALS.find((g) => g.id === goalId);
  const gt = TYPES.find((t) => t.id === goal.type);
  const mt = result.type;
  const same = gt.id === mt.id;
  const dirA = gt.lv > mt.lv ? 'A+' : gt.lv < mt.lv ? 'A-' : (gt.lv >= 2 ? 'A+' : 'A-');
  const dirB = gt.side === 'sharp' ? 'B+' : 'B-';
  const da = LV_CENTER[gt.lv] - LV_CENTER[mt.lv];
  const db = gt.side === mt.side ? 0 : (gt.side === 'sharp' ? 1 : -1);
  const big = same ? 'A' : (Math.abs(da) >= Math.abs(db) ? 'A' : 'B');
  const other = big === 'A' ? 'B' : 'A';
  const plan = same ? { hair: 'A', brow: 'B', skin: 'B' } : { hair: big, brow: other, skin: big };
  const dir = (axis) => (axis === 'A' ? dirA : dirB);
  const table = TIPS[gender] || TIPS.f;
  const tips = CATEGORIES.map((c) => {
    const d = dir(plan[c.id]);
    return { category: c.id, label: gender === 'm' && c.labelM ? c.labelM : c.label, dir: d, ...table[c.id][d] };
  });
  return { same, da, db, tips, goal, target: typeCenter(goal.type), me: chartPoint(result) };
}
// 写真から測った値 → 選択肢の番号（0/1/2）
export function photoToPick(key, value, n = 3) {
  const r = PHOTO_RULES[key];
  if (!r || !Number.isFinite(value)) return undefined;
  const cuts = n === 4 && r.cuts ? r.cuts : [r.lo, r.hi];
  let pos = cuts.filter((c) => value > c).length;      // 区切りをいくつ超えたか
  if (r.dir < 0) pos = cuts.length - pos;
  return pos;
}

// 写真の測定値の一覧 → { q01: 番号, ... }（測れた質問だけ）
export function photoAnswers(measures) {
  const out = {};
  for (const q of QUESTIONS) {
    if (!q.photo) continue;
    const pick = photoToPick(q.photo, measures[q.photo], q.options.length);
    if (pick !== undefined) out[q.id] = pick;
  }
  return out;
}

// みんなの顔立ちチャートのひと言
export function groupComment(results) {
  if (results.length < 2) return '';
  const pts = results.map(chartPoint);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const spreadX = Math.max(...xs) - Math.min(...xs);
  const spreadY = Math.max(...ys) - Math.min(...ys);
  const sameType = new Set(results.map((r) => r.type.id)).size === 1;
  if (sameType) return results.length === 2 ? 'ふたりとも同じタイプ。似合うものが近いので、おたがいのスタイルを参考にし合えそうです。' : 'みんな同じタイプ。似合うものが近いので、おたがいのスタイルを参考にし合えそうです。';
  if (spreadX > 0.9 && spreadY > 0.9) return 'みんなばらばらの魅力。おたがいの「似合う」を交換して、新しい自分を試してみて。';
  if (spreadX > 0.9) return '「やわらか」と「シャープ」に分かれました。並ぶとおたがいの魅力が引き立つ組み合わせです。';
  if (spreadY > 0.9) return '「あどけない」と「大人っぽい」に分かれました。雰囲気のちがいが、いいバランスです。';
  return 'みんな近い場所に集まりました。雰囲気が似ていて、並ぶとまとまりのある組み合わせです。';
}
