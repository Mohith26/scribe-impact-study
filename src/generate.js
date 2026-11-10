// Seeded synthetic Optimize-style workflow data: one support workflow, six pods (user groups),
// 24 weeks, every instance broken into tasks. An AI reply-drafting agent rolls out to the pods
// in waves. Each instance is simulated twice with the same random draws: once as observed and
// once without the rollout (the counterfactual), so tests can check estimates against the truth.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRand(seed) {
  const u = mulberry32(seed);
  let spare = null;
  const normal = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let x, y, r;
    do { x = 2 * u() - 1; y = 2 * u() - 1; r = x * x + y * y; } while (r >= 1 || r === 0);
    const f = Math.sqrt((-2 * Math.log(r)) / r);
    spare = y * f;
    return x * f;
  };
  const poisson = (lam) => {
    if (lam > 40) return Math.max(0, Math.round(lam + Math.sqrt(lam) * normal()));
    const L = Math.exp(-lam); let k = 0, p = 1;
    do { k++; p *= u(); } while (p > L);
    return k - 1;
  };
  return { u, normal, poisson };
}

export const WORKFLOW = {
  name: 'Respond to ad hoc customer questions over email',
  description: 'Handling one-off customer questions and requests over email: triaging threads, retrieving account context, searching the help center, drafting personalized replies, sending them, and routing anything that needs another owner.',
};

export const TASKS = [
  { id: 'draft', name: 'Draft and personalize customer replies', base: 2.55, p: 1 },
  { id: 'send', name: 'Send replies and manage recipients/stakeholders', base: 0.48, p: 0.88 },
  { id: 'retrieve', name: 'Retrieve account, thread, and customer context', base: 0.68, p: 0.85 },
  { id: 'search', name: 'Search help center and docs', base: 1.1, p: 0.45 },
  { id: 'triage', name: 'Triage and prioritize customer email threads', base: 0.5, p: 0.68 },
  { id: 'route', name: 'Route requests or confirm handoff to owners', base: 1.3, p: 0.17 },
];

export const APPS = [
  { name: 'Gmail', share: 0.36 },
  { name: 'Superhuman', share: 0.24 },
  { name: 'Dust', share: 0.14 },
  { name: 'Scribe', share: 0.11 },
  { name: 'Zendesk', share: 0.08 },
  { name: 'Salesforce', share: 0.07 },
];

export const CHANGE_LOG = [
  { t: 12, label: 'Aug 10 · new help-center search for every pod' },
];

export const CHANGE = {
  name: 'Dust reply-drafting agent',
  detail: 'Drafts a first reply from the thread and account context; agents edit and send.',
};

// first treated week index (Infinity = not adopted inside the window)
export const PODS = [
  { name: 'Billing pod', n: 12, g: 9, level: 0.88 },
  { name: 'Accounts pod', n: 10, g: 9, level: 0.92 },
  { name: 'Enterprise pod', n: 11, g: 14, level: 1.0 },
  { name: 'SMB pod', n: 12, g: 14, level: 1.04 },
  { name: 'Returns pod', n: 9, g: 19, level: 1.06 },
  { name: 'EMEA pod', n: 10, g: Infinity, level: 1.0 },
];

export const WEEKS = 24;
export const START = Date.UTC(2026, 4, 18); // Mon May 18 2026
export const weekLabel = (t) => {
  const d = new Date(START + t * 7 * 86400000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

// true effect of the rollout, by task and weeks since adoption (e)
export function treatmentMultiplier(taskId, e, effect = 1) {
  if (e < 0) return 1;
  const ramp = [0.45, 0.75, 0.9][e] ?? 1;
  if (taskId === 'draft') return 1 - 0.34 * effect * ramp;
  if (taskId === 'send') return 1 + 0.12 * effect * ramp; // reviewing the AI draft before sending
  return 1;
}

// common shocks every pod sees, adopted or not
function commonMultiplier(taskId, t) {
  let m = 1 + 0.04 * Math.sin((2 * Math.PI * (t - 2)) / 20);
  if (t >= 12 && taskId === 'search') m *= 0.62; // Aug 10: new help-center search for everyone
  if (t >= 12 && taskId === 'retrieve') m *= 0.88;
  if (t >= 16 && t <= 20 && (taskId === 'draft' || taskId === 'retrieve')) m *= 1.08; // Sept billing-change questions
  return m;
}

export function generate(opts = {}) {
  const seed = opts.seed ?? 20261110;
  const effect = opts.effect ?? 1; // scale the true effect (0 = placebo)
  const pods = opts.pods ?? PODS;
  const pretrendBreak = opts.pretrendBreak ?? 0; // per-week drift added to early pods before adoption (for tests)
  const rnd = makeRand(seed);
  const participants = [];
  pods.forEach((p, gi) => {
    for (let k = 0; k < p.n; k++) participants.push({ id: `${p.name.split(' ')[0].toLowerCase()}-${k + 1}`, pod: gi, g: p.g, skill: Math.exp(0.22 * rnd.normal()), learn: 0.003 * (0.5 + rnd.u()) });
  });
  const K = TASKS.length;
  const P = participants.length;
  const n = Array.from({ length: P }, () => new Int32Array(WEEKS));
  const obs = Array.from({ length: P }, () => Array.from({ length: WEEKS }, () => new Float64Array(K)));
  const cf = Array.from({ length: P }, () => Array.from({ length: WEEKS }, () => new Float64Array(K)));
  const occ = Array.from({ length: P }, () => Array.from({ length: WEEKS }, () => new Int32Array(K)));
  for (let i = 0; i < P; i++) {
    const pt = participants[i];
    const pod = pods[pt.pod];
    for (let t = 0; t < WEEKS; t++) {
      const away = rnd.u() < 0.05; // PTO week: no instances captured
      const vol = 1 + 0.08 * Math.sin((2 * Math.PI * (t + 3)) / 12);
      const cnt = away ? 0 : rnd.poisson(38 * vol);
      n[i][t] = cnt;
      const e = pt.g === Infinity ? -1 : t - pt.g;
      const learn = Math.exp(-pt.learn * t);
      const drift = pretrendBreak && pt.g !== Infinity && t < pt.g ? 1 + pretrendBreak * (t - pt.g) : 1;
      for (let c = 0; c < cnt; c++) {
        for (let k = 0; k < K; k++) {
          const task = TASKS[k];
          if (rnd.u() >= task.p) continue;
          occ[i][t][k]++;
          const noise = Math.exp(0.4 * rnd.normal() - 0.08);
          const y0 = task.base * pod.level * pt.skill * learn * drift * commonMultiplier(task.id, t) * noise;
          cf[i][t][k] += y0;
          obs[i][t][k] += y0 * treatmentMultiplier(task.id, e, effect);
        }
      }
    }
  }
  return { participants, pods, n, obs, cf, occ, weeks: WEEKS, tasks: TASKS };
}
