// 結果カード（1080×1350）を描いて、保存・共有する。顔写真は入れない
import { chartSVG } from './chart.js';
import { ISSUE_LABEL, SHARE_URL } from './config.js';

const W = 1080;
const H = 1350;

function loadImg(src) {
  return new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ng; i.src = src; });
}

function wrap(ctx, text, maxW) {
  // 「、」やかっこの前後で区切った言葉ごとに詰める。1つの言葉が長すぎるときだけ文字の途中で折る
  const out = [];
  let line = '';
  for (const part of text.split('\n')) {
    for (const tok of part.split(/(?<=[、。）」 ])|(?=[（「])/)) {
      if (ctx.measureText(line + tok).width <= maxW) { line += tok; continue; }
      if (line) { out.push(line); line = ''; }
      if (ctx.measureText(tok).width <= maxW) { line = tok; continue; }
      for (const ch of tok) {
        if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch;
      }
    }
    if (line) { out.push(line); line = ''; }
  }
  // 行頭に句読点が来ないように
  for (let i = 1; i < out.length; i++) {
    if (/^[、。」』）]/.test(out[i])) { out[i - 1] += out[i][0]; out[i] = out[i].slice(1); }
  }
  // 最後の行が1〜2文字だけにならないように、前の行から送る
  const n = out.length;
  if (n >= 2 && out[n - 1].length <= 2 && out[n - 2].length > 4) {
    const move = 3 - out[n - 1].length;
    out[n - 1] = out[n - 2].slice(-move) + out[n - 1];
    out[n - 2] = out[n - 2].slice(0, -move);
  }
  return out.filter(Boolean);
}

// person = { nick, gender, result, goal }
export async function drawCard(person) {
  await document.fonts.ready;
  await Promise.all([
    document.fonts.load('700 80px "Shippori Mincho"'),
    document.fonts.load('500 30px "Zen Kaku Gothic New"'),
    document.fonts.load('italic 500 30px "Cormorant Garamond"'),
  ]).catch(() => {});
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const t = person.result.type;
  // 紙
  c.fillStyle = '#FBF8F5';
  c.fillRect(0, 0, W, H);
  // うすい色の帯
  const grad = c.createLinearGradient(0, 0, 0, 640);
  grad.addColorStop(0, t.color + '55');
  grad.addColorStop(1, '#FBF8F500');
  c.fillStyle = grad;
  c.fillRect(0, 0, W, 640);
  // 枠
  c.strokeStyle = '#B8955F';
  c.lineWidth = 2;
  c.strokeRect(36, 36, W - 72, H - 72);
  c.lineWidth = 1;
  c.strokeRect(48, 48, W - 96, H - 96);

  c.textAlign = 'center';
  c.fillStyle = '#8A7A72';
  c.font = 'italic 500 30px "Cormorant Garamond", serif';
  c.fillText('FACE BALANCE DIAGNOSIS 2027', W / 2, 118);
  c.font = '500 30px "Zen Kaku Gothic New", sans-serif';
  c.fillStyle = '#6B5F5E';
  c.fillText(`${person.nick ? person.nick : 'わたし'}の顔立ちは`, W / 2, 172);

  // 肖像（アーチ形）
  const img = await loadImg(`img/${person.gender}_${t.id}.webp`).catch(() => null);
  const ax = 96; const ay = 220; const aw = 360; const ah = 500;
  c.save();
  c.beginPath();
  c.moveTo(ax, ay + aw / 2);
  c.arc(ax + aw / 2, ay + aw / 2, aw / 2, Math.PI, 0);
  c.lineTo(ax + aw, ay + ah);
  c.lineTo(ax, ay + ah);
  c.closePath();
  c.clip();
  c.fillStyle = '#fff';
  c.fillRect(ax, ay, aw, ah);
  if (img) c.drawImage(img, ax, ay, aw, aw * (540 / 384));
  c.restore();
  c.strokeStyle = '#B8955F';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(ax - 8, ay + aw / 2);
  c.arc(ax + aw / 2, ay + aw / 2, aw / 2 + 8, Math.PI, 0);
  c.lineTo(ax + aw + 8, ay + ah + 8);
  c.lineTo(ax - 8, ay + ah + 8);
  c.closePath();
  c.stroke();

  // タイプ名
  c.textAlign = 'left';
  const tx = 500;
  const [n1, n2] = t.name.split(' ');
  c.fillStyle = '#2F292A';
  c.font = '700 92px "Shippori Mincho", serif';
  c.fillText(n1, tx, 360);
  c.fillText(n2, tx, 470);
  c.fillStyle = t.color;
  c.fillRect(tx, 500, 90, 4);
  c.fillStyle = '#4A4040';
  c.font = '500 30px "Zen Kaku Gothic New", sans-serif';
  wrap(c, t.catch.replace('、', '、\n'), 480).slice(0, 3).forEach((l, i) => c.fillText(l, tx, 566 + i * 46));

  // チャート
  const svg = chartSVG({ points: [{ ...person.point, me: true, color: '#C98F8A' }], highlight: t.id, names: true,
    arrow: person.goalPoint && person.goalType !== t.id ? { from: person.point, to: person.goalPoint } : null,
    goal: person.goalPoint && person.goalType !== t.id ? person.goalPoint : null });
  const styled = svg.replace('<svg ', `<svg width="440" height="440" `).replace('</svg>', `<style>
    .cut{stroke:#D9CBBF;stroke-dasharray:3 4}.axis{stroke:#B8A79A}.frame{fill:none;stroke:#B8A79A}
    .axis-label{font:500 13px "Zen Kaku Gothic New",sans-serif;fill:#6B5F5E}
    .cell-name{font:500 10.5px "Zen Kaku Gothic New",sans-serif;fill:#A3958C}.cell-name.on{fill:#2F292A;font-weight:700}
    .pt-halo{opacity:.25}.pt-label{font:700 12px "Zen Kaku Gothic New",sans-serif;fill:#2F292A}
    .arrow{stroke:#B8955F;stroke-width:2.5}.goal-mark circle{fill:#fff;stroke:#B8955F;stroke-width:2}.goal-mark path{fill:none;stroke:#B8955F;stroke-width:2}
  </style></svg>`);
  const chartImg = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(styled)).catch(() => null);
  if (chartImg) c.drawImage(chartImg, 96, 780, 440, 440);

  // なりたい印象
  c.fillStyle = '#8A7A72';
  c.font = 'italic 500 30px "Cormorant Garamond", serif';
  c.fillText('2027 GOAL', 590, 850);
  c.fillStyle = '#2F292A';
  c.font = '700 44px "Shippori Mincho", serif';
  const goalText = person.goal ? person.goal.label : '';
  wrap(c, goalText ? `「${goalText}」` : '', 400).forEach((l, i) => c.fillText(l, 590, 912 + i * 58));
  c.font = '500 26px "Zen Kaku Gothic New", sans-serif';
  c.fillStyle = '#4A4040';
  let ty = 1000;
  for (const tip of person.tips || []) {
    const ls = wrap(c, tip.title, 380).slice(0, 2);
    c.fillStyle = '#B8955F';
    c.fillText('・', 584, ty);
    c.fillStyle = '#4A4040';
    for (const l of ls) { c.fillText(l, 610, ty); ty += 36; }
    ty += 10;
  }

  // 下
  c.textAlign = 'center';
  c.fillStyle = '#8A7A72';
  c.font = '500 26px "Zen Kaku Gothic New", sans-serif';
  c.fillText(`なりたいジブン 顔バランス診断 ｜ ${ISSUE_LABEL}${SHARE_URL ? ' ｜ ' + SHARE_URL : ''}`, W / 2, H - 82);
  return cv;
}

export async function makeCardBlob(person) {
  const cv = await drawCard(person);
  return new Promise((ok) => cv.toBlob(ok, 'image/png'));
}

// 作っておいた画像を渡す。スマホは共有画面（写真に保存できる）、パソコンはダウンロード
export async function deliverCard(blob, typeId) {
  const name = `kao-shindan-${typeId}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: 'なりたいジブン 顔バランス診断' }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return 'downloaded';
}