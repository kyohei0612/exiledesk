/**
 * auto-linear.ts — 方策を決めた時の期待値の連立方程式 V_i − Σ p_ij V_j = b_i を解く (解析君、2026-10-20)。
 *
 * 値の繰り返しは 0.3% の当たりの輪 (カオスで狙いが消えて付け直す) があると何千回も掃くので、方策の繰り返しの評価はこれで解く。
 * 行列は疎 (1 行に行き先 数十) なので BiCGSTAB (対角で前処理)。収まらなければ (ほとんど抜けられない輪で値が 1e20 を超える時など)、
 * 小さい行列は掃き出し (部分ピボット) で解き直し、大きい行列はガウス・ザイデルで仕上げる。
 * 抜けられない輪 (特異) は false。false の時 x の中身は使わない (NaN・ごみが入っている事がある)
 */
export interface LinRow { oi: ArrayLike<number>; op: ArrayLike<number>; b: number }

/** rows[i] の連立方程式を解く。x は始めの値 (上書きして返す)。返り値は収まったか */
export function solveLinear(rows: readonly LinRow[], x: Float64Array, tol = 1e-11, maxIt = 4000): boolean {
  const n = rows.length;
  // A = I − P を CSR に (同じ列はまとめる)
  const rp = new Int32Array(n + 1);
  const ci: number[] = [], va: number[] = [];
  const diag = new Float64Array(n);
  const b = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = rows[i]!;
    b[i] = r.b;
    let dii = 1;
    const m = new Map<number, number>();
    for (let t = 0; t < r.oi.length; t++) { const j = r.oi[t]!, p = r.op[t]!; if (j === i) dii -= p; else m.set(j, (m.get(j) ?? 0) - p); }
    diag[i] = Math.abs(dii) > 1e-300 ? dii : 1e-300;
    ci.push(i); va.push(dii);
    for (const [j, v] of m) { ci.push(j); va.push(v); }
    rp[i + 1] = ci.length;
  }
  const C = Int32Array.from(ci), A = Float64Array.from(va);
  const mul = (v: Float64Array, out: Float64Array) => { for (let i = 0; i < n; i++) { let s = 0; for (let k = rp[i]!; k < rp[i + 1]!; k++) s += A[k]! * v[C[k]!]!; out[i] = s; } };
  const dot = (u: Float64Array, v: Float64Array) => { let s = 0; for (let i = 0; i < n; i++) s += u[i]! * v[i]!; return s; };
  const r = new Float64Array(n), rh = new Float64Array(n), p = new Float64Array(n), v = new Float64Array(n), s = new Float64Array(n), t = new Float64Array(n), ph = new Float64Array(n), sh = new Float64Array(n);
  mul(x, r);
  for (let i = 0; i < n; i++) { r[i] = b[i]! - r[i]!; rh[i] = r[i]!; }
  const bn = Math.sqrt(dot(b, b)) || 1;
  let rho = 1, alpha = 1, omega = 1;
  let ok = Math.sqrt(dot(r, r)) <= tol * bn;
  for (let it = 0; it < maxIt && !ok; it++) {
    const rho1 = dot(rh, r);
    if (!Number.isFinite(rho1) || Math.abs(rho1) < 1e-300) break;
    const beta = (rho1 / rho) * (alpha / omega);
    for (let i = 0; i < n; i++) { p[i] = r[i]! + beta * (p[i]! - omega * v[i]!); ph[i] = p[i]! / diag[i]!; }
    mul(ph, v);
    const rv = dot(rh, v);
    if (Math.abs(rv) < 1e-300) break;
    alpha = rho1 / rv;
    for (let i = 0; i < n; i++) s[i] = r[i]! - alpha * v[i]!;
    if (Math.sqrt(dot(s, s)) <= tol * bn) { for (let i = 0; i < n; i++) x[i]! += alpha * ph[i]!; ok = true; break; }
    for (let i = 0; i < n; i++) sh[i] = s[i]! / diag[i]!;
    mul(sh, t);
    const tt = dot(t, t);
    if (tt < 1e-300) break;
    omega = dot(t, s) / tt;
    for (let i = 0; i < n; i++) { x[i]! += alpha * ph[i]! + omega * sh[i]!; r[i] = s[i]! - omega * t[i]!; }
    if (Math.sqrt(dot(r, r)) <= tol * bn) ok = true;
    rho = rho1;
    if (omega === 0) break;
  }
  if (ok && finite(x)) return true;
  if (n <= DENSE_MAX) return solveDense(n, rp, C, A, b, x);
  // 仕上げ: ガウス・ザイデル (対角で割る)
  for (let sw = 0; sw < 20000; sw++) {
    let diff = 0;
    for (let i = 0; i < n; i++) {
      let acc = b[i]!;
      for (let k = rp[i]!; k < rp[i + 1]!; k++) { const j = C[k]!; if (j !== i) acc -= A[k]! * x[j]!; }
      const nv = acc / diag[i]!;
      const d = Math.abs(nv - x[i]!) / (1 + Math.abs(nv));
      if (!(d <= diff)) diff = d; // NaN も収まっていない扱い
      x[i] = nv;
    }
    if (diff < 1e-10) return finite(x);
  }
  return false;
}

/** 掃き出しで解く行の数の上限 (2,500 で 50MB・1 回 数秒。見本の形は数百) */
const DENSE_MAX = 2500;
const finite = (x: Float64Array): boolean => x.every(Number.isFinite);

/** A x = b を掃き出し (部分ピボット) で。ピボットが 0 に近い (抜けられない輪) なら false */
function solveDense(n: number, rp: Int32Array, C: Int32Array, A: Float64Array, b: Float64Array, x: Float64Array): boolean {
  const M = new Float64Array(n * n), y = Float64Array.from(b);
  for (let i = 0; i < n; i++) for (let k = rp[i]!; k < rp[i + 1]!; k++) M[i * n + C[k]!]! += A[k]!;
  for (let c = 0; c < n; c++) {
    let piv = c, best = Math.abs(M[c * n + c]!);
    for (let i = c + 1; i < n; i++) { const v = Math.abs(M[i * n + c]!); if (v > best) { best = v; piv = i; } }
    // 行の和は 1 (I − P の対角) 程度なので、1e-13 未満は抜けられない輪
    if (!(best > 1e-13)) return false;
    if (piv !== c) {
      for (let k = c; k < n; k++) { const t = M[c * n + k]!; M[c * n + k] = M[piv * n + k]!; M[piv * n + k] = t; }
      const t = y[c]!; y[c] = y[piv]!; y[piv] = t;
    }
    const d = M[c * n + c]!;
    for (let i = c + 1; i < n; i++) {
      const f = M[i * n + c]! / d;
      if (f === 0) continue;
      for (let k = c; k < n; k++) M[i * n + k]! -= f * M[c * n + k]!;
      y[i]! -= f * y[c]!;
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= M[i * n + k]! * x[k]!;
    x[i] = s / M[i * n + i]!;
  }
  return finite(x);
}
