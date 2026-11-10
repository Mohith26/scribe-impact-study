import { generate, TASKS, APPS, WORKFLOW, CHANGE, CHANGE_LOG, WEEKS, weekLabel } from './src/generate.js';
import { study } from './src/did.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = { tab: params.get('tab') || 'impact', outcome: params.get('outcome') || 'all' };
const data = generate();
const G = data.participants.map((p) => p.g);
const cache = new Map();
const B = 400;

const fmt = (x, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x * 100).toFixed(d) + '%';
const mins = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d) + ' min';

function get(outcome) {
  if (!cache.has(outcome)) {
    const taskIdx = outcome === 'all' ? null : Number(outcome);
    const level = outcome === 'all' ? 0.95 : 1 - 0.05 / TASKS.length;
    cache.set(outcome, study(data, { taskIdx, B, level }));
  }
  return cache.get(outcome);
}

// ---------- workflow header (computed from the same instances) ----------
function totals() {
  let inst = 0, minutes = 0;
  const taskMin = new Float64Array(TASKS.length), taskOcc = new Float64Array(TASKS.length);
  for (let i = 0; i < data.n.length; i++) for (let t = 0; t < WEEKS; t++) {
    inst += data.n[i][t];
    for (let k = 0; k < TASKS.length; k++) { taskMin[k] += data.obs[i][t][k]; taskOcc[k] += data.occ[i][t][k]; minutes += data.obs[i][t][k]; }
  }
  return { inst, minutes, taskMin, taskOcc, perYear: (minutes / 60 / WEEKS) * 52 };
}

function renderHeader() {
  const T = totals();
  $('wf-title').textContent = WORKFLOW.name;
  $('wf-desc').textContent = WORKFLOW.description;
  $('m-inst').textContent = fmt(T.inst);
  $('m-avg').innerHTML = (T.minutes / T.inst).toFixed(1) + '<span class="u">min</span>';
  $('m-total').innerHTML = fmt(T.minutes / 60) + '<span class="u">hrs</span>';
  $('foot-data').textContent = `seeded generator: ${data.participants.length} participants in ${data.pods.length} pods, ${WEEKS} weeks from ${weekLabel(0)}, ${fmt(T.inst)} workflow instances`;
  $('m-year').innerHTML = fmt(T.perYear) + '<span class="u">hrs/yr</span>';
  const colors = ['#5098c1', '#ff8f45', '#8c8fe0', '#f2c94c', '#4bd29a', '#6697bf'];
  const hrs = APPS.map((a) => (a.share * T.minutes) / 60);
    const top = Math.ceil(Math.max(...hrs) / 300) * 300;
  $('apps').innerHTML = APPS.map((a, i) => `<span>${a.name}</span><span class="track"><span class="ab" style="display:block;width:${(hrs[i] / top) * 100}%;background:${colors[i]}" title="${fmt(hrs[i])} hrs"></span></span>`).join('') +
    `<span class="axis"><span>${fmt(top / 3)} hrs</span><span>${fmt((2 * top) / 3)} hrs</span><span>${fmt(top)} hrs</span></span>`;
  $('task-rows').innerHTML = TASKS.map((tk, k) => ({ tk, k, m: T.taskMin[k] })).sort((a, b) => b.m - a.m).map(({ tk, k, m }) =>
    `<tr><td class="l">${tk.name}</td><td>${fmt(T.taskOcc[k])}</td><td>${Math.round((m / T.minutes) * 100)}%</td><td>${fmt(m / 60)} hrs</td><td>${fmt((m / 60 / WEEKS) * 52)} hrs/yr</td><td><button class="btn">View details</button></td></tr>`).join('');
  $('inst-rows').innerHTML = data.pods.map((p, gi) => {
    let inst = 0, m = 0, np = 0;
    data.participants.forEach((pt, i) => { if (pt.pod !== gi) return; np++; for (let t = 0; t < WEEKS; t++) { inst += data.n[i][t]; for (let k = 0; k < TASKS.length; k++) m += data.obs[i][t][k]; } });
    return `<tr><td class="l">${p.name}</td><td>${np}</td><td>${fmt(inst)}</td><td>${(m / inst).toFixed(1)} min</td><td>${p.g === Infinity ? 'Not yet' : weekLabel(p.g)}</td></tr>`;
  }).join('');
}

// ---------- impact study ----------
function adoptedWeeklyInstances(lastWeeks = 4) {
  let s = 0;
  for (let t = WEEKS - lastWeeks; t < WEEKS; t++) data.participants.forEach((p, i) => { if (p.g <= t) s += data.n[i][t]; });
  return s / lastWeeks;
}

function renderImpact() {
  const S = get(state.outcome);
  const all = get('all');
  const isAll = state.outcome === 'all';
  const label = isAll ? 'time per instance' : `“${TASKS[Number(state.outcome)].name}” time per instance`;
  const perMonth = (m) => (-m * adoptedWeeklyInstances() * 52) / 12 / 60;
  const hrs = perMonth(S.minutes), hrsCI = S.minutesCI.map(perMonth).sort((a, b) => a - b);
  const adopters = data.participants.filter((p) => p.g !== Infinity).length;
  const naiveRatio = S.naive.effect / S.minutes;
  const ciLabel = isAll ? '95% CI' : `${(100 * (1 - 0.05 / TASKS.length)).toFixed(1)}% CI (6 tasks)`;
  const fmtHrs = (h) => (Math.abs(h) < 10 ? h.toFixed(1) : fmt(h));
  $('headline').innerHTML = `
    <div class="tile ${S.rel < 0 ? 'good' : ''}"><div class="tv">${pct(S.rel)}<span class="u sm">${mins(S.minutes)}</span></div><div class="tl">Effect on ${isAll ? 'time per instance' : 'task time per instance'}</div><div class="ci">${ciLabel} ${pct(S.relCI[0])} to ${pct(S.relCI[1])}</div></div>
    <div class="tile"><div class="tv">${fmtHrs(hrs)}<span class="u">hrs/mo</span></div><div class="tl">${hrs >= 0 ? 'Saved' : 'Added'} at current adoption</div><div class="ci">${ciLabel} ${fmtHrs(hrsCI[0])} to ${fmtHrs(hrsCI[1])} · ${adopters} participants</div></div>
    <div class="tile warn"><div class="tv">${pct(S.naive.rel)}<span class="u sm">${mins(S.naive.effect)}</span></div><div class="tl">Simple before/after says</div><div class="ci">${Math.abs(S.minutes) > 0.02 && naiveRatio > 0 ? (naiveRatio > 1 ? `overstates the effect by ${Math.round((naiveRatio - 1) * 100)}%` : `understates the effect by ${Math.round((1 - naiveRatio) * 100)}%`) : 'reports a change the comparison does not support'}</div></div>
    <div class="tile ${S.pretrend.p >= 0.05 ? 'good' : 'warn'}"><div class="tv">p = ${S.pretrend.p.toFixed(2)}</div><div class="tl"><i class="${S.pretrend.p >= 0.05 ? 'icon-circle-check' : 'icon-triangle-alert'}"></i>${S.pretrend.p >= 0.05 ? 'Pre-rollout trends look parallel' : 'Adopters were already diverging'}</div><div class="ci">joint test of the ${S.pretrend.df} weeks before rollout</div></div>`;

  // plain-language summary, built from the numbers
  const tasks = TASKS.map((tk, k) => ({ tk, k, s: get(String(k)) }));
  const gap = tasks.map((x) => ({ ...x, gap: x.s.naive.effect - x.s.minutes })).sort((a, b) => a.gap - b.gap)[0];
  const draft = tasks.find((x) => x.tk.id === 'draft'), send = tasks.find((x) => x.tk.id === 'send');
  $('study-sum').innerHTML = isAll
    ? `Pods using the <b>${CHANGE.name}</b> spend <b>${mins(all.minutes)}</b> per instance (<b>${pct(all.rel)}</b>, 95% CI ${pct(all.relCI[0])} to ${pct(all.relCI[1])}) compared with what pods that had not adopted yet were doing over the same weeks. That is about <b>${fmt(hrs)} hours a month</b> across the ${adopters} participants using it today. A simple before/after says ${pct(all.naive.rel)}: most of the gap is <b>${gap.tk.name.toLowerCase()}</b> (${mins(gap.s.naive.effect)} before/after, ${mins(gap.s.minutes)} once other pods are the baseline), which got faster for every pod after ${CHANGE_LOG[0].label.split(' · ')[0]}. Drafting time fell ${Math.abs(draft.s.rel * 100).toFixed(0)}%; sending got ${Math.abs(send.s.rel * 100).toFixed(0)}% ${send.s.rel > 0 ? 'slower' : 'faster'} as people review the drafts.`
    : `Effect of the ${CHANGE.name} on ${label}: <b>${pct(S.rel)}</b> (${mins(S.minutes, 3)}), ${ciLabel} ${pct(S.relCI[0])} to ${pct(S.relCI[1])}. Simple before/after: ${pct(S.naive.rel)} (${mins(S.naive.effect, 3)}).`;

  drawEventStudy(S);
  renderRollout();
  renderTasks(tasks);
  $('method').innerHTML = `Difference-in-differences for a staggered rollout (Callaway and Sant'Anna, 2021). For every adoption wave and week, the change in log minutes per instance since the week before adoption is compared with the same change for pods that had not adopted yet, so seasonality, org-wide changes and learning that hit everyone cancel out. Waves are then averaged by weeks since rollout. Intervals come from resampling participants within each wave (${B} draws); task rows use ${(100 * (1 - 0.05 / TASKS.length)).toFixed(1)}% intervals because six tasks are tested at once. The pre-rollout test checks the ${all.pretrend.df} weeks before adoption jointly (Wald, bootstrap covariance). Groups smaller than 3 people are never shown. The simple before/after is the mean of each adopter's 6 weeks after minus their 6 weeks before.`;
}

function drawEventStudy(S) {
  const el = $('es');
  const W = el.clientWidth || 640, H = 250;
  const m = { l: 46, r: 12, t: 12, b: 34 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const es = Object.keys(S.esPct).map(Number).sort((a, b) => a - b);
  const lo = Math.min(...es.map((e) => S.esCI[e][0]), S.naive.rel), hi = Math.max(...es.map((e) => S.esCI[e][1]), 0.02);
  const step = hi - lo > 0.3 ? 0.1 : hi - lo > 0.12 ? 0.05 : 0.02;
  const yMin = Math.floor(lo / step) * step, yMax = Math.ceil(hi / step) * step;
  const X = (e) => m.l + ((e - es[0] + 0.5) / es.length) * iw;
  const Y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  let s = `<svg width="${W}" height="${H}">`;
  for (let v = yMin; v <= yMax + 1e-9; v += step) {
    s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(v)}" y2="${Y(v)}" stroke="${Math.abs(v) < 1e-9 ? '#9a9aa2' : '#f0f0f2'}" ${Math.abs(v) < 1e-9 ? '' : ''}/>`;
    s += `<text x="${m.l - 8}" y="${Y(v) + 3.5}" text-anchor="end" font-size="10.5" fill="#9a9aa2">${Math.round(v * 100) < 0 ? '−' + Math.abs(Math.round(v * 100)) : Math.round(v * 100)}%</text>`;
  }
  const xr = (X(-1) + X(0)) / 2;
  s += `<rect x="${xr}" y="${m.t}" width="${m.l + iw - xr}" height="${ih}" fill="#f4f9fc"/>`;
  s += `<line x1="${xr}" x2="${xr}" y1="${m.t}" y2="${m.t + ih}" stroke="#5696ba" stroke-dasharray="3 3"/>`;
  s += `<text x="${xr + 6}" y="${m.t + 12}" font-size="10.5" fill="#5696ba">Rollout</text>`;
  s += `<line x1="${xr}" x2="${m.l + iw}" y1="${Y(S.naive.rel)}" y2="${Y(S.naive.rel)}" stroke="#ff8f45" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  s += `<text x="${m.l + iw - 4}" y="${Y(S.naive.rel) + 13}" text-anchor="end" font-size="10.5" fill="#d9692a">before/after ${pct(S.naive.rel)}</text>`;
  for (const e of es) {
    const post = e >= 0, c = post ? '#5098c1' : '#9a9aa2';
    const [a, b] = S.esCI[e];
    if (e !== -1) s += `<line x1="${X(e)}" x2="${X(e)}" y1="${Y(a)}" y2="${Y(b)}" stroke="${c}" stroke-width="2" stroke-linecap="round" opacity=".55"/>`;
    s += `<circle class="pt" data-e="${e}" cx="${X(e)}" cy="${Y(S.esPct[e])}" r="${e === -1 ? 3.5 : 4.5}" fill="${e === -1 ? '#fff' : c}" stroke="${c}" stroke-width="1.5"/>`;
    s += `<text x="${X(e)}" y="${m.t + ih + 15}" text-anchor="middle" font-size="10.5" fill="#6b6b73">${e > 0 ? '+' + e : e < 0 ? '−' + Math.abs(e) : e}</text>`;
  }
  s += `<text x="${m.l + iw / 2}" y="${H - 3}" text-anchor="middle" font-size="10.5" fill="#9a9aa2">weeks since the pod adopted (week −1 is the baseline)</text>`;
  s += '</svg>';
  el.innerHTML = s;
  $('es-legend').innerHTML = `<span><i style="background:#9a9aa2"></i>Before rollout (should be near 0)</span><span><i style="background:#5098c1"></i>After rollout, with ${state.outcome === 'all' ? '95%' : '99.2%'} interval</span><span><i class="line"></i>What a before/after comparison reports</span>`;
  const tip = $('tip');
  el.querySelectorAll('.pt').forEach((c) => {
    c.addEventListener('mouseenter', (ev) => {
      const e = Number(c.dataset.e);
      const cells = S.est.cells.filter((x) => x.e === e);
      const nT = cells.reduce((a, x) => a + x.nT, 0);
      tip.innerHTML = `<b>Week ${e > 0 ? '+' + e : e}</b><br>${e === -1 ? 'Baseline week (fixed at 0)' : `${pct(S.esPct[e])} (${pct(S.esCI[e][0])} to ${pct(S.esCI[e][1])})`}<br><span style="color:#6b6b73">${cells.length} wave${cells.length === 1 ? '' : 's'} · ${nT} participant-weeks</span>`;
      tip.style.display = 'block'; tip.style.left = ev.clientX + 12 + 'px'; tip.style.top = ev.clientY - 10 + 'px';
    });
    c.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });
}

function renderRollout() {
  const rows = data.pods.map((p) => {
    const n = data.participants.filter((x) => x.pod === data.pods.indexOf(p)).length;
    const cells = Array.from({ length: WEEKS }, (_, t) => `<span class="c ${p.g !== Infinity && t >= p.g ? 'on' : ''} ${t === p.g ? 'first' : ''}" title="${weekLabel(t)}"></span>`).join('');
    return `<span class="rn">${p.name} <small>${n}</small></span><span class="cells">${cells}</span>`;
  }).join('');
  const ev = CHANGE_LOG.map((c) => `<span class="ev"></span>${c.label}`).join('<br>');
  const marks = [0, 8, 16, WEEKS - 1].map((t) => `<span>${weekLabel(t)}</span>`).join('');
  $('rollout').innerHTML = `<div class="roll">${rows}<span class="ax">${marks}</span></div>
    <div class="roll-note">Waves: ${[...new Set(G.filter((g) => g !== Infinity))].map((g) => weekLabel(g)).join(', ')}. EMEA pod has not adopted and stays a comparison group throughout.<br>${ev} (from your change log; it hit every pod, which is why before/after over-credits the agent).</div>`;
  // mark the org-wide event on every row
  document.querySelectorAll('.roll .cells').forEach((row) => {
    for (const c of CHANGE_LOG) { const cell = row.children[c.t]; if (cell) cell.style.outline = '1.5px dashed #ff8f45'; }
  });
}

function renderTasks(tasks) {
  const maxAbs = Math.max(...tasks.map((x) => Math.max(Math.abs(x.s.minutesCI[0]), Math.abs(x.s.minutesCI[1]), Math.abs(x.s.naive.effect))));
  const scale = (v) => 50 + (v / maxAbs) * 48;
  $('eff-rows').innerHTML = tasks.sort((a, b) => a.s.minutes - b.s.minutes).map(({ tk, k, s }) => {
    const sig = s.relCI[0] > 0 || s.relCI[1] < 0;
    const cls = !sig ? '' : s.minutes < 0 ? 'neg' : 'pos';
    const a = scale(Math.min(0, s.minutes)), b = scale(Math.max(0, s.minutes));
    const w1 = scale(s.minutesCI[0]), w2 = scale(s.minutesCI[1]);
    const misleading = Math.abs(s.naive.effect - s.minutes) > 0.05 && !sig;
    return `<tr data-k="${k}"><td class="l">${tk.name}</td><td>${s.cfMean.toFixed(2)} min</td>
      <td class="w"><span class="${cls}">${mins(s.minutes)} (${pct(s.rel, 0)})</span><br><span style="color:#9a9aa2;font-size:11px">${mins(s.minutesCI[0])} to ${mins(s.minutesCI[1])}</span></td>
      <td><span class="bar2"><span class="mid"></span><span class="b" style="left:${a}%;width:${b - a}%;background:${s.minutes < 0 ? '#4bd29a' : '#ff8f45'};opacity:${sig ? 1 : 0.45}"></span><span class="w" style="left:${w1}%;width:${w2 - w1}%"></span></span></td>
      <td>${mins(s.naive.effect)}${misleading ? '<span class="flag">not caused by the agent</span>' : ''}</td></tr>`;
  }).join('');
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('#tabs button[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  ['tasks', 'instances', 'impact'].forEach((t) => { $('tab-' + t).hidden = t !== tab; });
}

function init() {
  renderHeader();
  $('outcome').innerHTML = `<option value="all">Time per instance (all tasks)</option>` + TASKS.map((t, k) => `<option value="${k}">${t.name}</option>`).join('');
  $('outcome').value = state.outcome;
  $('outcome').addEventListener('change', (e) => { state.outcome = e.target.value; renderImpact(); });
  $('change').innerHTML = `<option>${CHANGE.name} · ${[...new Set(G.filter((g) => g !== Infinity))].map((g) => weekLabel(g)).join(', ')}</option>`;
  document.querySelectorAll('#tabs button[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('eff-rows').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-k]'); if (tr) { state.outcome = tr.dataset.k; $('outcome').value = state.outcome; renderImpact(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  setTab(state.tab);
  const t0 = performance.now();
  renderImpact();
  console.log('computed in', Math.round(performance.now() - t0), 'ms');
  window.addEventListener('resize', () => drawEventStudy(get(state.outcome)));
}
init();
