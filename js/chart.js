// 顔立ちチャート（縦＝大人っぽさ、横＝やわらか⇔シャープ）を SVG で描く
import { TYPES, A_CUTS, LV_CENTER, SIDE_CENTER } from './data.js';

const S = 320;          // 全体の大きさ
const M = 34;           // まわりの余白（軸の文字）
const IN = S - M * 2;
export const px = (x) => M + ((x + 1) / 2) * IN;
export const py = (y) => M + (1 - (y + 1) / 2) * IN;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// opts: { points:[{x,y,label,color,me}], arrow:{from:{x,y},to:{x,y}}, highlight:typeId, corners:'f'|'m'|null, names:true, compact }
export function chartSVG(opts = {}) {
  const { points = [], arrow = null, highlight = null, corners = null, names = true } = opts;
  // 目標の印は、区画の上のタイプ名と重ならないよう少し下げる
  const low = (p) => (p && Math.abs(p.y) < 0.4 ? { x: p.x, y: p.y - 0.08 } : p);
  const goal = low(opts.goal);
  if (arrow) arrow.to = low(arrow.to);
  const lines = [];
  // 区画（タイプの場所）
  for (const t of TYPES) {
    const top = py([1, A_CUTS[2], 0, A_CUTS[0]][3 - t.lv]);
    const bottom = py([A_CUTS[2], 0, A_CUTS[0], -1][3 - t.lv]);
    const left = t.side === 'soft' ? px(-1) : px(0);
    const w = IN / 2;
    const on = highlight === t.id;
    lines.push(`<rect x="${left}" y="${top}" width="${w}" height="${bottom - top}" fill="${on ? t.color : 'transparent'}" opacity="${on ? 0.28 : 0}" class="cell${on ? ' on' : ''}"/>`);
    if (names) {
      // 区画の左上（やわらか側）／右上（シャープ側）に1行で。点や印と重ならないように
      const soft = t.side === 'soft';
      lines.push(`<text x="${soft ? left + 6 : left + w - 6}" y="${top + 13}" class="cell-name${on ? ' on' : ''}" text-anchor="${soft ? 'start' : 'end'}">${esc(t.name)}</text>`);
    }
  }
  // 区切りの線
  for (const c of A_CUTS) lines.push(`<line x1="${px(-1)}" x2="${px(1)}" y1="${py(c)}" y2="${py(c)}" class="${c === 0 ? 'axis' : 'cut'}"/>`);
  lines.push(`<line x1="${px(0)}" x2="${px(0)}" y1="${py(1)}" y2="${py(-1)}" class="axis"/>`);
  lines.push(`<rect x="${px(-1)}" y="${py(1)}" width="${IN}" height="${IN}" class="frame"/>`);
  // 軸の言葉
  lines.push(`<text x="${S / 2}" y="${M - 12}" text-anchor="middle" class="axis-label">大人っぽい</text>
    <text x="${S / 2}" y="${S - M + 22}" text-anchor="middle" class="axis-label">あどけない</text>
    <text x="${M - 10}" y="${S / 2}" text-anchor="middle" class="axis-label" transform="rotate(-90 ${M - 10} ${S / 2})">やわらか</text>
    <text x="${S - M + 10}" y="${S / 2}" text-anchor="middle" class="axis-label" transform="rotate(90 ${S - M + 10} ${S / 2})">シャープ</text>`);
  // 四すみの顔（タイトルの説明用）
  if (corners) {
    const defs = [];
    const cs = [['fuwari', -0.62, -0.68], ['hatsuratsu', 0.62, -0.68], ['shittori', -0.62, 0.66], ['rin', 0.62, 0.66]];
    cs.forEach(([id, x, y], i) => {
      const cx = px(x);
      const cy = py(y);
      defs.push(`<clipPath id="cc${i}"><circle cx="${cx}" cy="${cy}" r="25"/></clipPath>`);
      lines.push(`<circle cx="${cx}" cy="${cy}" r="27" fill="#fff" stroke="#E4D9D0"/>
        <image href="img/${corners}_${id}.webp" x="${cx - 26}" y="${cy - 30}" width="52" height="73" clip-path="url(#cc${i})" preserveAspectRatio="xMidYMin slice"/>`);
    });
    lines.unshift(`<defs>${defs.join('')}</defs>`);
  }
  // なりたい印象への矢印
  if (arrow) {
    const x1 = px(arrow.from.x); const y1 = py(arrow.from.y);
    const x2 = px(arrow.to.x); const y2 = py(arrow.to.y);
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len > 14) {
      const ux = (x2 - x1) / len; const uy = (y2 - y1) / len;
      const ex = x2 - ux * 12; const ey = y2 - uy * 12;
      lines.push(`<defs><marker id="ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#B8955F"/></marker></defs>
        <line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" class="arrow" marker-end="url(#ah)" style="--len:${len}"/>`);
    }
  }
  if (goal) {
    lines.push(`<g class="goal-mark"><circle cx="${px(goal.x)}" cy="${py(goal.y)}" r="11" /><path d="M${px(goal.x) - 4} ${py(goal.y)}l3 3 6-6" /></g>`);
  }
  // 点
  points.forEach((p, i) => {
    const x = px(p.x); const y = py(p.y);
    lines.push(`<g class="pt${p.me ? ' me' : ''}" style="--d:${i * 0.15}s">
      <circle cx="${x}" cy="${y}" r="${p.me ? 13 : 10}" class="pt-halo" fill="${p.color || '#C98F8A'}"/>
      <circle cx="${x}" cy="${y}" r="${p.me ? 6.5 : 5.5}" class="pt-dot" fill="${p.color || '#C98F8A'}"/>
      ${p.label ? `<text x="${p.x > 0.2 ? x - 14 : x + 14}" y="${y + 4.5}" text-anchor="${p.x > 0.2 ? 'end' : 'start'}" class="pt-label">${esc(p.label)}</text>` : ''}
    </g>`);
  });
  return `<svg class="chart" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="顔立ちチャート">${lines.join('')}</svg>`;
}

export function typeCenterXY(typeId) {
  const t = TYPES.find((x) => x.id === typeId);
  return { x: SIDE_CENTER[t.side], y: LV_CENTER[t.lv] };
}
