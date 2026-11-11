// 写真モード：顔の点（478点）を取り、比率を測る。写真はこの端末の中だけで使い、どこにも送らない
// 顔認識は Google の MediaPipe（Apache-2.0）。部品と学習データは自分のサーバーに置いている（vendor/mediapipe）

const BASE = new URL('../vendor/mediapipe/', import.meta.url).href;
let landmarker = null;
let loading = null;

export function loadLandmarker(onProgress = () => {}) {
  if (landmarker) return Promise.resolve(landmarker);
  if (loading) return loading;
  loading = (async () => {
    onProgress(0.1);
    const vision = await import(BASE + 'vision_bundle.mjs');
    onProgress(0.3);
    const fileset = await vision.FilesetResolver.forVisionTasks(BASE.replace(/\/$/, ''));
    onProgress(0.6);
    const make = (delegate) => vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: BASE + 'face_landmarker.task', delegate },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
    });
    try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); }
    onProgress(1);
    return landmarker;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// 3点 a-b-c の、b での角度（度）
function angle(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

// 眉の弓なり：両端を結ぶ線から、いちばん離れた点までの距離 ÷ 眉の長さ
function arch(pts) {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const len = d(a, b);
  let max = 0;
  for (const p of pts.slice(1, -1)) {
    const dist = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
    max = Math.max(max, dist);
  }
  return max / len;
}

// 回転行列から 顔の向き（左右 yaw・上下 pitch・かたむき roll、度）
function pose(matrix) {
  if (!matrix) return null;
  const m = matrix.data;
  // 列優先 4x4
  const r00 = m[0], r10 = m[1], r20 = m[2], r21 = m[6], r22 = m[10];
  const yaw = Math.atan2(-r20, Math.hypot(r21, r22)) * 180 / Math.PI;
  const pitch = Math.atan2(r21, r22) * 180 / Math.PI;
  const roll = Math.atan2(r10, r00) * 180 / Math.PI;
  return { yaw, pitch, roll };
}

// 顔の点 → 測った値（data.js の PHOTO_RULES と同じ名前）
// w, h は写真の大きさ（点は 0〜1 なので、ピクセルに直して比を取る）
export function measure(landmarks, w, h) {
  const P = landmarks.map((p) => ({ x: p.x * w, y: p.y * h }));
  const faceLen = d(P[10], P[152]);
  const faceWid = d(P[234], P[454]);
  const eyeLine = (P[33].y + P[133].y + P[263].y + P[362].y) / 4;
  const browHead = mid(P[107], P[336]);
  const eyeW = (d(P[33], P[133]) + d(P[263], P[362])) / 2;
  const eyeH = (d(P[159], P[145]) + d(P[386], P[374])) / 2;
  const jaw = (angle(P[132], P[172], P[152]) + angle(P[361], P[397], P[152])) / 2;
  const browR = [P[107], P[66], P[105], P[63], P[70]];
  const browL = [P[336], P[296], P[334], P[293], P[300]];
  return {
    faceRatio: faceLen / faceWid,
    jawAngle: jaw,
    midface: (P[2].y - browHead.y) / faceLen,
    eyeShape: eyeH / eyeW,
    eyeSize: eyeW / faceWid,
    browArch: (arch(browR) + arch(browL)) / 2,
    chin: d(P[17], P[152]) / faceLen,
    lips: d(P[0], P[17]) / d(P[61], P[291]),
    noseLen: (P[2].y - eyeLine) / faceLen,
    faceSize: faceWid / w,            // 写真の横幅に対する顔の大きさ（遠すぎ判定）
  };
}

// 画像（img / canvas / video）を調べる
// → { ok, reason, measures, pose, landmarks }
export async function analyze(source) {
  const lm = await loadLandmarker();
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  const res = lm.detect(source);
  if (!res.faceLandmarks || !res.faceLandmarks.length) return { ok: false, reason: 'noface' };
  const landmarks = res.faceLandmarks[0];
  const ps = pose(res.facialTransformationMatrixes && res.facialTransformationMatrixes[0]);
  const measures = measure(landmarks, w, h);
  let reason = null;
  if (ps && (Math.abs(ps.yaw) > 10)) reason = 'yaw';
  else if (ps && Math.abs(ps.pitch) > 14) reason = 'pitch';
  else if (ps && Math.abs(ps.roll) > 10) reason = 'roll';
  else if (measures.faceSize < 0.22) reason = 'far';
  return { ok: !reason, reason, measures, pose: ps, landmarks };
}

export const REASON_TEXT = {
  noface: '顔が見つかりませんでした。明るい場所で、顔全体が写るように撮ってください。',
  yaw: '顔が少し横を向いています。まっすぐ正面を向いて撮ってください。',
  pitch: 'あごが上がる（下がる）と長さが正しく測れません。カメラを目の高さにして撮ってください。',
  roll: '顔が少しかたむいています。まっすぐにして撮ってください。',
  far: '顔が小さく写っています。もう少しカメラに近づいてください。',
};
