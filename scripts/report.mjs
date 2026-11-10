// Prints every headline number shown on the page (same code, same seeded data).
import { generate, TASKS } from '../src/generate.js';
import { study, trueOverall } from '../src/did.js';
const t0 = Date.now();
const data = generate();
const s = study(data, { B: 400 });
const f = (x, d = 2) => x.toFixed(d);
const P = (x) => (x * 100).toFixed(1) + '%';
console.log('participants', data.participants.length, 'instances', data.n.reduce((a, r) => a + r.reduce((x, y) => x + y, 0), 0));
console.log('effect', P(s.rel), 'CI', s.relCI.map(P), '| minutes', f(s.minutes, 3), 'CI', s.minutesCI.map((x) => f(x, 3)), '| cf mean', f(s.cfMean, 3));
console.log('true', P(Math.exp(trueOverall(data)) - 1));
console.log('naive', f(s.naive.effect, 3), 'min', P(s.naive.rel), 'n', s.naive.n);
console.log('pretrend W', f(s.pretrend.W), 'df', s.pretrend.df, 'p', f(s.pretrend.p, 3));
console.log('event study %', Object.keys(s.esPct).map(Number).sort((a, b) => a - b).map((e) => `${e}:${P(s.esPct[e])}[${s.esCI[e].map(P)}]`).join(' '));
TASKS.forEach((tk, k) => {
  const st = study(data, { taskIdx: k, B: 400, level: 1 - 0.05 / TASKS.length });
  console.log(' task', tk.id.padEnd(8), P(st.rel), 'CI', st.relCI.map(P), 'min', f(st.minutes, 3), 'true', P(Math.exp(trueOverall(data, k)) - 1), 'naive', f(st.naive.effect, 3), 'pre p', f(st.pretrend.p, 2));
});
console.log('ms', Date.now() - t0);
