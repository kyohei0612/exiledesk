/**
 * auto-linear.ts — 方策を決めた時の期待値の連立方程式 V_i − Σ p_ij V_j = b_i を解く (解析君、2026-10-20)。
 *
 * 値の繰り返しは 0.3% の当たりの輪 (カオスで狙いが消えて付け直す) があると何千回も掃くので、方策の繰り返しの評価はこれで解く。
 * 行列は疎 (1 行に行き先 数十) なので BiCGSTAB (対角で前処理)。収まらなければガウス・ザイデルで仕上げる
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
  if (ok) return true;
  // 仕上げ: ガウス・ザイデル (対角で割る)
  for (let sw = 0; sw < 20000; sw++) {
    let diff = 0;
    for (let i = 0; i < n; i++) {
      let acc = b[i]!;
      for (let k = rp[i]!; k < rp[i + 1]!; k++) { const j = C[k]!; if (j !== i) acc -= A[k]! * x[j]!; }
      const nv = acc / diag[i]!;
      const d = Math.abs(nv - x[i]!) / (1 + Math.abs(nv));
      if (d > diff) diff = d;
      x[i] = nv;
    }
    if (diff < 1e-10) return true;
  }
  return false;
}
