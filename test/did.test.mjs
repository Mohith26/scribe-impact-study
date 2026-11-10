import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, TASKS } from '../src/generate.js';
import { panel, attgt, estimate, study, trueOverall, chi2sf, naiveBeforeAfter } from '../src/did.js';

const hashData = (d) => { let h = 0; for (let i = 0; i < d.n.length; i++) for (let t = 0; t < d.n[i].length; t++) { h = (h * 31 + d.n[i][t]) >>> 0; h = (h * 31 + Math.round(d.obs[i][t][0] * 1000)) >>> 0; } return h; };

test('generator is deterministic and honours the minimum group size', () => {
  assert.equal(hashData(generate()), hashData(generate()));
  const d = generate();
  const counts = {};
  for (const p of d.participants) counts[p.pod] = (counts[p.pod] ?? 0) + 1;
  assert.ok(Object.values(counts).every((c) => c >= 3), 'Optimize hides groups under 3 people');
});

test('chi-square survival function matches known values', () => {
  assert.ok(Math.abs(chi2sf(11.0705, 5) - 0.05) < 1e-4);
  assert.ok(Math.abs(chi2sf(3.8415, 1) - 0.05) < 1e-4);
  assert.ok(Math.abs(chi2sf(15.0863, 5) - 0.01) < 1e-4);
  assert.equal(chi2sf(0, 3), 1);
});

test('ATT(g,t) on a hand-built panel, and already-adopted units are never controls', () => {
  // 2 adopt at t=2, 2 adopt at t=3, 2 never; outcome = 10 + t, effect -3 from adoption on
  const G = [2, 2, 3, 3, Infinity, Infinity];
  const Y = G.map((g) => [0, 1, 2, 3, 4].map((t) => 10 + t + (t >= g ? -3 - 5 * (t - g) : 0)));
  const c = attgt(Y, G, 2, 2);
  assert.equal(c.att, -3); assert.equal(c.nT, 2); assert.equal(c.nC, 4);
  // at t=3 the g=2 units are mid-effect; they must not be controls for g=3
  const c3 = attgt(Y, G, 3, 3);
  assert.equal(c3.att, -3); assert.equal(c3.nC, 2);
  const est = estimate(Y, G, { eMin: -2, eMax: 1 });
  assert.equal(est.es[-1], 0);
  assert.equal(est.es[0], -3);
});

test('recovers the true effect: CI covers the truth in most seeds and the bias is small', () => {
  let cover = 0, bias = 0; const S = 30;
  for (let s = 0; s < S; s++) {
    const d = generate({ seed: 1000 + s });
    const st = study(d, { B: 150, seed: s });
    const truth = Math.exp(trueOverall(d)) - 1;
    if (st.relCI[0] <= truth && truth <= st.relCI[1]) cover++;
    bias += st.rel - truth;
  }
  assert.ok(cover / S >= 0.85, `coverage ${cover}/${S}`);
  assert.ok(Math.abs(bias / S) < 0.01, `mean bias ${bias / S} (relative)`);
});

test('placebo: no rollout effect means an estimate near zero, while before/after still reports savings', () => {
  let cover = 0, naive = 0; const S = 30;
  for (let s = 0; s < S; s++) {
    const d = generate({ seed: 2000 + s, effect: 0 });
    const st = study(d, { B: 150, seed: s });
    if (st.relCI[0] <= 0 && 0 <= st.relCI[1]) cover++;
    naive += st.naive.effect;
  }
  assert.ok(cover / S >= 0.85, `placebo coverage ${cover}/${S}`);
  assert.ok(naive / S < -0.08, `naive before/after invents savings: ${naive / S}`);
});

test('pre-trend test: rarely fires under parallel trends, usually fires when adopters were already speeding up', () => {
  let fp = 0, power = 0; const S = 30;
  for (let s = 0; s < S; s++) {
    if (study(generate({ seed: 3000 + s }), { B: 150, seed: s }).pretrend.p < 0.05) fp++;
    if (study(generate({ seed: 3000 + s, pretrendBreak: 0.03 }), { B: 150, seed: s }).pretrend.p < 0.05) power++;
  }
  assert.ok(fp / S <= 0.17, `false positives ${fp}/${S}`);
  assert.ok(power / S >= 0.8, `power ${power}/${S}`);
});

test('task-level minute effects add up (approximately) to the workflow-level effect', () => {
  const d = generate();
  const total = study(d, { B: 50 }).minutes;
  let sum = 0;
  TASKS.forEach((_, k) => { sum += study(d, { taskIdx: k, B: 50 }).minutes; });
  assert.ok(Math.abs(sum - total) < 0.1 * Math.abs(total), `${sum} vs ${total}`);
});

test('the demo data shows the before/after trap: naive overstates, and credits search time to the AI', () => {
  const d = generate();
  const st = study(d, { B: 300 });
  assert.ok(st.naive.effect < st.minutes * 1.15, 'naive is at least 15% larger in magnitude');
  const search = TASKS.findIndex((t) => t.id === 'search');
  const se = study(d, { taskIdx: search, B: 300, level: 1 - 0.05 / TASKS.length });
  assert.ok(se.naive.effect < -0.05 && se.relCI[0] <= 0 && se.relCI[1] >= 0);
  assert.ok(st.pretrend.p > 0.05);
});
