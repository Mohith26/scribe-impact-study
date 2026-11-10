// Impact study: staggered-adoption difference-in-differences (Callaway & Sant'Anna 2021,
// not-yet-treated comparison group, universal base period g-1), event-study aggregation,
// participant-cluster bootstrap, a pre-trend Wald test, and the naive before/after it replaces.
import { mulberry32 } from './generate.js';

// participant-week panel of minutes per instance for a set of task indices (null = all tasks).
// log = true puts it on the log scale, where a rollout that cuts time by x% is the same shift
// for a fast pod and a slow one (durations are multiplicative).
export function panel(data, taskIdx = null, which = 'obs', log = false) {
  const src = data[which];
  return data.n.map((row, i) => Array.from(row, (cnt, t) => {
    if (!cnt) return NaN;
    let s = 0;
    const v = src[i][t];
    if (taskIdx === null) for (let k = 0; k < v.length; k++) s += v[k];
    else for (const k of [].concat(taskIdx)) s += v[k];
    return log ? (s > 0 ? Math.log(s / cnt) : NaN) : s / cnt;
  }));
}

// ATT(g,t) = E[Y_t - Y_{g-1} | G=g] - E[Y_t - Y_{g-1} | not yet treated at max(t, g-1)]
export function attgt(Y, G, g, t, idx = null) {
  const b = g - 1;
  const ids = idx ?? Y.map((_, i) => i);
  let sT = 0, nT = 0, sC = 0, nC = 0;
  const lim = Math.max(t, b);
  for (const i of ids) {
    const yt = Y[i][t], yb = Y[i][b];
    if (!(yt === yt && yb === yb)) continue; // NaN check
    if (G[i] === g) { sT += yt - yb; nT++; }
    else if (G[i] > lim) { sC += yt - yb; nC++; }
  }
  if (!nT || !nC) return null;
  return { att: sT / nT - sC / nC, nT, nC };
}

export function estimate(Y, G, opts = {}) {
  const T = Y[0].length;
  const eMin = opts.eMin ?? -6, eMax = opts.eMax ?? 8;
  const idx = opts.idx ?? null;
  const cohorts = [...new Set(G.filter((g) => g !== Infinity))].sort((a, b) => a - b);
  const cells = [];
  for (const g of cohorts) {
    for (let t = 0; t < T; t++) {
      if (t === g - 1) continue;
      const c = attgt(Y, G, g, t, idx);
      if (c) cells.push({ g, t, e: t - g, ...c });
    }
  }
  const es = {};
  for (let e = eMin; e <= eMax; e++) {
    if (e === -1) { es[e] = 0; continue; }
    let s = 0, w = 0;
    for (const c of cells) if (c.e === e) { s += c.att * c.nT; w += c.nT; }
    es[e] = w ? s / w : NaN;
  }
  let s = 0, w = 0;
  for (const c of cells) if (c.e >= 0) { s += c.att * c.nT; w += c.nT; }
  const overall = w ? s / w : NaN;
  return { cells, es, overall, cohorts, eMin, eMax };
}

// stratified (by cohort) participant bootstrap
export function bootstrap(Y, G, opts = {}) {
  const B = opts.B ?? 400;
  const u = mulberry32(opts.seed ?? 7);
  const byCohort = new Map();
  G.forEach((g, i) => { const k = String(g); if (!byCohort.has(k)) byCohort.set(k, []); byCohort.get(k).push(i); });
  const reps = [];
  for (let b = 0; b < B; b++) {
    const Yb = [], Gb = [];
    for (const ids of byCohort.values()) {
      for (let j = 0; j < ids.length; j++) { const i = ids[Math.floor(u() * ids.length)]; Yb.push(Y[i]); Gb.push(G[i]); }
    }
    reps.push(estimate(Yb, Gb, opts));
  }
  return reps;
}

export function percentile(arr, q) {
  const a = arr.filter((x) => x === x).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

// regularized upper incomplete gamma Q(a, x) (Numerical Recipes series / continued fraction)
function gammaln(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
export function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) {
    let sum = 1 / a, del = sum, ap = a;
    for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}
export const chi2sf = (x, df) => gammaQ(df / 2, x / 2);

function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-18) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

// joint test that all pre-period event-time effects are zero, with bootstrap covariance
export function pretrendTest(est, reps, pre = [-6, -5, -4, -3, -2]) {
  const keys = pre.filter((e) => est.es[e] === est.es[e]);
  const th = keys.map((e) => est.es[e]);
  const R = reps.map((r) => keys.map((e) => r.es[e])).filter((v) => v.every((x) => x === x));
  const mean = keys.map((_, j) => R.reduce((a, v) => a + v[j], 0) / R.length);
  const S = keys.map((_, a) => keys.map((_, b) => R.reduce((acc, v) => acc + (v[a] - mean[a]) * (v[b] - mean[b]), 0) / (R.length - 1)));
  const x = solve(S, th);
  const W = x ? th.reduce((a, v, j) => a + v * x[j], 0) : NaN;
  return { W, df: keys.length, p: chi2sf(W, keys.length), keys };
}

// what a plain before/after comparison reports: each adopter's mean over k weeks after
// adoption minus the k weeks before, averaged over adopters
export function naiveBeforeAfter(Y, G, k = 6) {
  let s = 0, base = 0, n = 0;
  for (let i = 0; i < Y.length; i++) {
    const g = G[i];
    if (g === Infinity) continue;
    const m = (a, b) => { let x = 0, c = 0; for (let t = a; t < b; t++) if (t >= 0 && t < Y[i].length && Y[i][t] === Y[i][t]) { x += Y[i][t]; c++; } return c ? x / c : NaN; };
    const pre = m(g - k, g), post = m(g, g + k);
    if (pre === pre && post === post) { s += post - pre; base += pre; n++; }
  }
  return { effect: s / n, rel: s / base, n };
}

// mean observed outcome over adopted participant-weeks (for converting effects to %)
export function treatedPostMean(Y, G) {
  let s = 0, c = 0;
  for (let i = 0; i < Y.length; i++) for (let t = 0; t < Y[i].length; t++) if (G[i] !== Infinity && t >= G[i] && Y[i][t] === Y[i][t]) { s += Y[i][t]; c++; }
  return s / c;
}

// the true ATT in simulated data (log scale): adopted participant-weeks, log observed minus
// log counterfactual, weighted the same way as the estimator's overall aggregation
export function trueOverall(data, taskIdx = null) {
  const Y1 = panel(data, taskIdx, 'obs', true), Y0 = panel(data, taskIdx, 'cf', true);
  const G = data.participants.map((p) => p.g);
  let s = 0, w = 0;
  for (let i = 0; i < Y1.length; i++) {
    const g = G[i]; if (g === Infinity) continue;
    for (let t = g; t < Y1[i].length; t++) {
      if (!(Y1[i][t] === Y1[i][t]) || !(Y1[i][g - 1] === Y1[i][g - 1])) continue;
      s += Y1[i][t] - Y0[i][t]; w++;
    }
  }
  return s / w;
}

// full study for one outcome: DiD on log minutes per instance, reported as % and minutes;
// CIs from the participant bootstrap (level = 0.95, or wider for multiple tasks)
export function study(data, opts = {}) {
  const taskIdx = opts.taskIdx ?? null;
  const level = opts.level ?? 0.95;
  const Ylog = panel(data, taskIdx, 'obs', true);
  const Ymin = panel(data, taskIdx, 'obs', false);
  const G = data.participants.map((p) => p.g);
  const est = estimate(Ylog, G, opts);
  const reps = bootstrap(Ylog, G, opts);
  const a = (1 - level) / 2;
  const ci = (f) => [percentile(reps.map(f), a), percentile(reps.map(f), 1 - a)];
  const pctOf = (x) => Math.exp(x) - 1;
  const esPct = {}, esCI = {};
  for (let e = est.eMin; e <= est.eMax; e++) {
    esPct[e] = e === -1 ? 0 : pctOf(est.es[e]);
    esCI[e] = e === -1 ? [0, 0] : ci((r) => r.es[e]).map(pctOf);
  }
  const rel = pctOf(est.overall);
  const relCI = ci((r) => r.overall).map(pctOf);
  const post = treatedPostMean(Ymin, G);   // observed minutes per instance after adoption
  const cfMean = post / (1 + rel);         // what it would have been without the rollout
  return {
    est, reps, esPct, esCI, rel, relCI, cfMean,
    minutes: post - cfMean, minutesCI: relCI.map((r) => cfMean * r),
    pretrend: pretrendTest(est, reps),
    naive: naiveBeforeAfter(Ymin, G),
  };
}
