// 質問のイラスト：同じ顔の「その部分だけ」を変えて、雑誌の図解のような細い線で描く（SVG）
// p = { faceLen, jaw, mid, eyeShape, eyeSize, brow, chin, lips, nose, cheek, forehead, noseTip }（それぞれ -1〜1）
// gender = 'f' | 'm'、focus = 強調する部分（質問の param 名）。カードの形は 4:5

const INK = '#3A3233';
const GOLD = '#B8955F';
const SKIN = '#FBF1EB';
const HAIR = '#6E5247';

const f1 = (n) => Math.round(n * 10) / 10;

function geometry(p) {
  const cx = 100;
  const W = 52 - 6 * p.faceLen;              // 顔の半分の幅（面長ほど細く）
  const hairline = 46 - 11 * p.forehead;       // 髪の生え際（おでこが広いほど上）
  const browY = 84;
  const eyeY = 99;
  const noseB = 133 + 8 * p.mid + 6 * p.nose;  // 鼻の下
  const mouthY = noseB + 16;
  const chinY = mouthY + 27 + 8.5 * p.chin + 10 * p.faceLen;
  return { cx, W, hairline, browY, eyeY, noseB, mouthY, chinY };
}

// 輪郭：こめかみ→ほお→えら→あご先（左右対称）
function outline(p, g) {
  const { cx, W, chinY } = g;
  const jt = (p.jaw + 1) / 2;         // 0 丸い 〜 1 シャープ
  const ch = (p.cheek + 1) / 2;       // 0 ふっくら 〜 1 すっきり
  const top = 52;
  const cheekY = 116;
  const lerp = (a, b, t) => a + (b - a) * t;
  const cheekOut = lerp(6, -2.5, ch);   // ほおのふくらみ（ふっくら＝外へ、骨感＝内へ）
  const gx = W * lerp(0.8, 0.88, jt);   // えらの位置（中心から）
  const gy = chinY - lerp(28, 22, jt);
  const chinHalf = lerp(2, 13, jt);     // あご先の平らな幅
  const cheekX = W + cheekOut;
  const start = [W, top];
  // 丸い：えらで曲線がつながる U 字／シャープ：えらで角ができ、あご先は平ら
  const segs = [
    [[W + 1, top + 20], [cheekX + 0.5, cheekY - 18], [cheekX, cheekY]],
    [[cheekX - 0.3, cheekY + 14], [lerp(gx + 9, gx + 0.5, jt), lerp(gy - 12, gy - 12, jt)], [gx, gy]],
    [[lerp(gx - 9, gx - 10, jt), lerp(gy + 12, gy + 4, jt)], [lerp(chinHalf + 16, chinHalf + 5, jt), chinY], [chinHalf, chinY]],
  ];
  const pt = (s, [x, y]) => `${f1(cx + s * x)} ${f1(y)}`;
  let d = `M ${pt(-1, start)}`;
  for (const [c1, c2, e] of segs) d += ` C ${pt(-1, c1)} ${pt(-1, c2)} ${pt(-1, e)}`;
  d += ` L ${pt(1, [chinHalf, chinY])}`;
  const ends = [start, ...segs.map((s) => s[2])];
  for (let i = segs.length - 1; i >= 0; i--) {
    const [c1, c2] = segs[i];
    d += ` C ${pt(1, c2)} ${pt(1, c1)} ${pt(1, ends[i])}`;
  }
  // 頭の上（こめかみから頭頂へ）
  d += ` C ${f1(cx + W - 1)} 30 ${f1(cx + 28)} 10 ${cx} 10 C ${f1(cx - 28)} 10 ${f1(cx - W + 1)} 30 ${pt(-1, start)} Z`;
  return d;
}

function hair(g, gender) {
  const { cx, W, hairline } = g;
  const h = hairline;
  if (gender === 'm') {
    // 短髪：頭の上に少し量感、額は見せる
    return `<path d="M ${f1(cx - W - 3)} 74 C ${f1(cx - W - 7)} 30 ${cx - 24} 4 ${cx + 4} 5 C ${cx + 32} 6 ${f1(cx + W + 8)} 28 ${f1(cx + W + 3)} 74
      C ${f1(cx + W - 1)} 60 ${f1(cx + W - 6)} ${f1(h + 6)} ${cx + 22} ${f1(h + 1)} C ${cx + 8} ${f1(h - 4)} ${cx - 12} ${f1(h - 3)} ${cx - 28} ${f1(h + 3)}
      C ${f1(cx - W + 4)} ${f1(h + 8)} ${f1(cx - W)} 58 ${f1(cx - W - 3)} 74 Z" fill="${HAIR}" opacity="0.85"/>
      <path d="M ${cx - 20} ${f1(h - 1)} C ${cx - 6} ${f1(h - 12)} ${cx + 14} 12 ${cx + 30} 14" stroke="#4A3530" stroke-width="0.6" fill="none" opacity="0.5"/>`;
  }
  // まとめ髪：うすい色の面＋生え際の線＋後ろへ流れる毛すじ（重く見えないように）
  const strands = [-30, -18, -7, 7, 18, 30].map((dx) =>
    `M ${f1(cx + dx * 0.35)} ${f1(h + 1 - Math.abs(dx) * 0.05)} C ${f1(cx + dx * 0.6)} ${f1(h - 14)} ${f1(cx + dx * 1.05)} 18 ${f1(cx + dx * 1.25)} ${f1(10 + Math.abs(dx) * 0.25)}`).join(' ');
  return `<path d="M ${f1(cx - W - 1)} 70 C ${f1(cx - W - 6)} 24 ${cx - 28} 5 ${cx} 5 C ${cx + 28} 5 ${f1(cx + W + 6)} 24 ${f1(cx + W + 1)} 70
      C ${f1(cx + W - 2)} 56 ${f1(cx + W - 12)} ${f1(h + 4)} ${cx} ${f1(h)} C ${f1(cx - W + 12)} ${f1(h + 4)} ${f1(cx - W + 2)} 56 ${f1(cx - W - 1)} 70 Z"
      fill="#CDB3A6" opacity="0.55" stroke="${HAIR}" stroke-width="0.9"/>
    <path d="${strands}" stroke="${HAIR}" stroke-width="0.6" fill="none" opacity="0.7" stroke-linecap="round"/>`;
}

function eye(p, g, dir, gender) {
  const ex = g.cx + dir * 22;
  const ey = g.eyeY;
  const ew = 19 + 5.5 * p.eyeSize;
  const st = (p.eyeShape + 1) / 2;           // 0 まんまる 〜 1 切れ長
  const eh = ew * (0.54 - 0.27 * st);
  const lift = 2.6 * st;                      // 目尻の上がり
  const inner = ex - dir * ew / 2;
  const outer = ex + dir * ew / 2;
  const up = `M ${f1(inner)} ${ey} C ${f1(inner + dir * ew * 0.18)} ${f1(ey - eh)} ${f1(outer - dir * ew * 0.22)} ${f1(ey - eh * 0.95 - lift)} ${f1(outer)} ${f1(ey - lift)}`;
  const lowC = [f1(outer - dir * ew * 0.3), f1(ey + eh * 0.5 - lift * 0.4), f1(inner + dir * ew * 0.22), f1(ey + eh * 0.52)];
  const low = `M ${f1(outer)} ${f1(ey - lift)} C ${lowC[0]} ${lowC[1]} ${lowC[2]} ${lowC[3]} ${f1(inner)} ${ey}`;
  const ir = Math.min(eh * 0.52, ew * 0.24);
  const icx = f1(ex + dir * 0.4);
  const icy = f1(ey - eh * 0.14 - lift * 0.45);
  const id = `e${dir > 0 ? 'r' : 'l'}${Math.random().toString(36).slice(2, 7)}`;
  const lash = gender === 'm' ? 1.4 : 1.9;
  return `<clipPath id="${id}"><path d="${up} C ${lowC[0]} ${lowC[1]} ${lowC[2]} ${lowC[3]} ${f1(inner)} ${ey} Z"/></clipPath>
    <path d="${up} C ${lowC[0]} ${lowC[1]} ${lowC[2]} ${lowC[3]} ${f1(inner)} ${ey} Z" fill="#fff"/>
    <g clip-path="url(#${id})">
      <circle cx="${icx}" cy="${icy}" r="${f1(ir)}" fill="#7A5A4E"/>
      <circle cx="${icx}" cy="${icy}" r="${f1(ir * 0.5)}" fill="#2E2324"/>
      <circle cx="${f1(ex - ir * 0.3)}" cy="${f1(icy - ir * 0.35)}" r="${f1(Math.max(0.8, ir * 0.22))}" fill="#fff"/>
    </g>
    <path d="${up}" stroke="${INK}" stroke-width="${lash}" fill="none" stroke-linecap="round"/>
    <path d="${low}" stroke="${INK}" stroke-width="0.6" fill="none" stroke-linecap="round" opacity="0.6"/>
    <path d="M ${f1(inner + dir * ew * 0.15)} ${f1(ey - eh - 2.2)} Q ${f1(ex)} ${f1(ey - eh * 1.25 - 2.5 - lift * 0.5)} ${f1(outer - dir * 1)} ${f1(ey - lift - 2.6)}"
      stroke="${INK}" stroke-width="0.45" fill="none" opacity="0.45"/>`;
}

function brow(p, g, dir, gender) {
  const y = g.browY;
  const inner = g.cx + dir * 11;
  const outer = g.cx + dir * 38;
  const bt = (p.brow + 1) / 2;               // 0 アーチ 〜 1 まっすぐ・角
  const peakX = g.cx + dir * (28 + 2 * bt);
  const w = gender === 'm' ? 3.4 : 2.3;
  let d;
  if (p.brow <= -0.7) d = `M ${inner} ${y + 1} C ${f1(inner + dir * 7)} ${y - 7} ${f1(peakX - dir * 2)} ${y - 8} ${outer} ${y + 2}`;
  else if (p.brow < 0) d = `M ${inner} ${y + 1} C ${f1(inner + dir * 8)} ${y - 3.5} ${f1(peakX)} ${y - 5} ${outer} ${y + 1.5}`;
  else if (p.brow < 0.7) d = `M ${inner} ${y} C ${f1(inner + dir * 9)} ${y - 1.6} ${f1(peakX)} ${y - 2.4} ${outer} ${y + 0.4}`;
  else d = `M ${inner} ${y} L ${f1(peakX)} ${y - 3.4} L ${outer} ${y + 0.6}`;
  return `<path d="${d}" stroke="#5A4440" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function nose(p, g) {
  const { cx, eyeY, noseB } = g;
  const tt = (p.noseTip + 1) / 2;            // 0 丸い 〜 1 シャープ
  const tipW = 7.5 - 3.2 * tt;
  const tipDrop = 2.6 - 1.4 * tt;
  // 鼻すじ：片側だけのやわらかい影の線
  const bridge = `M ${cx - 5} ${eyeY + 12} C ${cx - 4.5} ${eyeY + 20} ${cx - 4.5} ${f1(noseB - 14)} ${f1(cx - tipW + 1)} ${f1(noseB - 4)}`;
  // 鼻先と小鼻：丸いほど幅広くなだらか、シャープほど細く角ばる
  const tip = tt < 0.5
    ? `M ${f1(cx - tipW - 3)} ${f1(noseB - 3)} C ${f1(cx - tipW - 4)} ${f1(noseB + 1.5)} ${f1(cx - tipW + 1)} ${f1(noseB + tipDrop)} ${cx} ${f1(noseB + tipDrop)} C ${f1(cx + tipW - 1)} ${f1(noseB + tipDrop)} ${f1(cx + tipW + 4)} ${f1(noseB + 1.5)} ${f1(cx + tipW + 3)} ${f1(noseB - 3)}`
    : `M ${f1(cx - tipW - 3)} ${f1(noseB - 3)} L ${f1(cx - tipW)} ${f1(noseB + 0.5)} L ${cx} ${f1(noseB + tipDrop)} L ${f1(cx + tipW)} ${f1(noseB + 0.5)} L ${f1(cx + tipW + 3)} ${f1(noseB - 3)}`;
  const nostril = `M ${f1(cx - tipW + 0.5)} ${f1(noseB + 0.4)} q 2 -1.6 4 -0.3 M ${f1(cx + tipW - 0.5)} ${f1(noseB + 0.4)} q -2 -1.6 -4 -0.3`;
  return `<path d="${bridge}" stroke="${INK}" stroke-width="0.7" fill="none" opacity="0.5" stroke-linecap="round"/>
    <path d="${tip}" stroke="${INK}" stroke-width="1.05" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${nostril}" stroke="${INK}" stroke-width="0.8" fill="none" opacity="0.7" stroke-linecap="round"/>`;
}

function lips(p, g, gender) {
  const { cx, mouthY } = g;
  const w = 15.5;
  const upH = 3.6 + 2.4 * p.lips;
  const loH = 5 + 3.2 * p.lips;
  const upper = `M ${cx - w} ${mouthY} C ${f1(cx - w * 0.6)} ${f1(mouthY - upH * 0.55)} ${cx - 5} ${f1(mouthY - upH * 1.15)} ${cx - 2.4} ${f1(mouthY - upH)}
    Q ${cx} ${f1(mouthY - upH * 0.72)} ${cx + 2.4} ${f1(mouthY - upH)} C ${cx + 5} ${f1(mouthY - upH * 1.15)} ${f1(cx + w * 0.6)} ${f1(mouthY - upH * 0.55)} ${cx + w} ${mouthY}`;
  const lower = `C ${f1(cx + w * 0.6)} ${f1(mouthY + loH * 1.15)} ${f1(cx - w * 0.6)} ${f1(mouthY + loH * 1.15)} ${cx - w} ${mouthY}`;
  const line = `M ${cx - w} ${mouthY} Q ${cx} ${mouthY + 1.4} ${cx + w} ${mouthY}`;
  const fill = gender === 'm' ? '#D9A69C' : '#E09A93';
  return `<path d="${upper} ${lower} Z" fill="${fill}" opacity="${gender === 'm' ? 0.45 : 0.6}" stroke="#B5736C" stroke-width="0.7"/>
    <path d="${line}" stroke="#8E4F4A" stroke-width="1" fill="none" stroke-linecap="round"/>`;
}

// 強調の目印（金色の線）
function guide(focus, g) {
  const { cx, W, hairline, browY, eyeY, noseB, mouthY, chinY } = g;
  const gx = cx + W + 14;
  const bracket = (y1, y2) => `<path d="M ${f1(gx - 3.5)} ${f1(y1)} H ${f1(gx + 3.5)} M ${f1(gx)} ${f1(y1)} V ${f1(y2)} M ${f1(gx - 3.5)} ${f1(y2)} H ${f1(gx + 3.5)}" stroke="${GOLD}" stroke-width="1.3" fill="none"/>
    <path d="M ${f1(cx - W + 2)} ${f1(y1)} H ${f1(gx - 5)} M ${f1(cx - W + 2)} ${f1(y2)} H ${f1(gx - 5)}" stroke="${GOLD}" stroke-width="0.7" stroke-dasharray="1.5 2.5" fill="none"/>`;
  const ring = (x, y, rx, ry) => `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" stroke="${GOLD}" stroke-width="1.2" stroke-dasharray="3 2.5" fill="none"/>`;
  switch (focus) {
    case 'faceLen': return `${bracket(hairline, chinY)}
      <path d="M ${f1(cx - W - 2)} ${f1(chinY + 12)} H ${f1(cx + W + 2)} M ${f1(cx - W - 2)} ${f1(chinY + 8.5)} V ${f1(chinY + 15.5)} M ${f1(cx + W + 2)} ${f1(chinY + 8.5)} V ${f1(chinY + 15.5)}" stroke="${GOLD}" stroke-width="1.3"/>`;
    case 'mid': return bracket(browY, noseB);
    case 'chin': return bracket(mouthY + 6, chinY);
    case 'nose': return bracket(eyeY, noseB + 1);
    case 'forehead': return bracket(hairline, browY);
    case 'jaw': return ring(cx, chinY - 20, W * 0.98, 27);
    case 'cheek': return ring(cx - W * 0.6, 124, 14, 16) + ring(cx + W * 0.6, 124, 14, 16);
    case 'eyeSize': return `<path d="M ${f1(cx - W)} ${f1(eyeY + 16)} H ${f1(cx + W)}" stroke="${GOLD}" stroke-width="0.7" stroke-dasharray="1.5 2.5"/>
      <path d="M ${f1(cx - 22 - 12)} ${f1(eyeY + 10)} H ${f1(cx - 22 + 12)} M ${f1(cx + 22 - 12)} ${f1(eyeY + 10)} H ${f1(cx + 22 + 12)}" stroke="${GOLD}" stroke-width="1.3"/>`;
    default: return '';
  }
}

// 部分を大きく見せるときの範囲（4:5）
function viewBoxFor(focus, g) {
  switch (focus) {
    case 'eyeShape': return `${g.cx - 50} ${g.eyeY - 22} 56 70`;   // 右目（向かって左）を大きく
    case 'brow': return `${g.cx - 54} ${g.browY - 22} 56 70`;
    case 'lips': return `${g.cx - 26} ${f1(g.mouthY - 32)} 52 65`;
    case 'noseTip': return `${g.cx - 22} ${f1(g.noseB - 30)} 44 55`;
    default: return '6 0 188 235';
  }
}

export function faceSVG(params = {}, { gender = 'f', focus = null, label = '' } = {}) {
  const p = { faceLen: 0, jaw: 0, mid: 0, eyeShape: 0, eyeSize: 0, brow: 0, chin: 0, lips: 0, nose: 0, cheek: 0, forehead: 0, noseTip: 0, ...params };
  const g = geometry(p);
  const zoomed = ['eyeShape', 'brow', 'lips', 'noseTip'].includes(focus);
  const neck = [-1, 1].map((d) => `<path d="M ${f1(g.cx + d * g.W * 0.5)} ${f1(g.chinY - 14)} C ${f1(g.cx + d * g.W * 0.48)} ${f1(g.chinY + 8)} ${f1(g.cx + d * g.W * 0.52)} 222 ${f1(g.cx + d * g.W * 0.6)} 236" stroke="${INK}" stroke-width="0.9" fill="none"/>`).join('');
  const ears = [-1, 1].map((d) => `<path d="M ${f1(g.cx + d * (g.W - 0.5))} 96 C ${f1(g.cx + d * (g.W + 8))} 90 ${f1(g.cx + d * (g.W + 9))} 118 ${f1(g.cx + d * (g.W - 1))} 122" stroke="${INK}" stroke-width="0.9" fill="${SKIN}"/>`).join('');
  const blush = p.cheek < 0 ? [-1, 1].map((d) => `<ellipse cx="${f1(g.cx + d * 31)}" cy="120" rx="11" ry="6.5" fill="#EBB8B0" opacity="${0.55 * -p.cheek}"/>`).join('') : '';
  const bone = p.cheek > 0 ? `<path d="M ${f1(g.cx - g.W + 5)} 110 Q ${f1(g.cx - 34)} 120 ${f1(g.cx - 27)} 131 M ${f1(g.cx + g.W - 5)} 110 Q ${f1(g.cx + 34)} 120 ${f1(g.cx + 27)} 131" stroke="${INK}" stroke-width="0.6" fill="none" opacity="${0.5 * p.cheek}"/>` : '';
  return `<svg viewBox="${viewBoxFor(focus, g)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}" class="face-svg${zoomed ? ' zoomed' : ''}">
    <g ${zoomed ? 'stroke-opacity="0.5"' : ''}>${neck}${ears}</g>
    <path d="${outline(p, g)}" fill="${SKIN}" stroke="${INK}" stroke-width="${zoomed ? 0.5 : 1.15}" stroke-linejoin="round"/>
    ${hair(g, gender)}
    ${blush}${bone}
    ${brow(p, g, -1, gender)}${brow(p, g, 1, gender)}
    ${eye(p, g, -1, gender)}${eye(p, g, 1, gender)}
    ${nose(p, g)}
    ${lips(p, g, gender)}
    ${zoomed ? '' : guide(focus, g)}
  </svg>`;
}
