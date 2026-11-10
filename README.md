# Impact study (concept for Scribe Optimize)

**Live demo:** https://mohith26.github.io/scribe-impact-study/

An unofficial concept feature for Scribe Optimize: a new **Impact study** tab on a workflow page
that answers "did this AI rollout actually save time?" with a causal estimate instead of a
before/after comparison.

Optimize already measures workflow time and frequency before and after a change, and its pitch
to customers is proof of AI ROI. The catch is that before/after also counts everything else that
changed in those weeks: seasonality, an org-wide tool upgrade, people getting faster with practice.
When a tool rolls out to teams in waves, the teams that have not adopted yet are a natural control
group. This demo uses them.

Unofficial concept demo by Mohith Gajjela. Not affiliated with Scribe. Synthetic data.

## What it shows (demo data)

A support org (64 participants in 6 pods, 24 weeks, 55,661 instances of "Respond to ad hoc
customer questions over email") rolls out a Dust reply-drafting agent in three waves (Jul 20,
Aug 24, Sep 28); one pod never adopts inside the window. On Aug 10 every pod also gets a new
help-center search.

- **Effect of the agent:** -17.0% time per instance (95% CI -18.8% to -15.3%), -0.67 min,
  about 98 hours a month at current adoption. The simulated truth is -17.5%.
- **What before/after says:** -21.1% (-0.93 min), an overstatement of 38%. Most of the gap is
  the help-center search task: before/after credits the agent with -0.11 min there, while the
  comparison with other pods says +0.01 min (the search upgrade hit everyone).
- **Where the time moved:** drafting -30%; sending +10% (people review the drafts); other tasks
  indistinguishable from zero at a 99.2% (Bonferroni, 6 tasks) level.
- **Pre-rollout check:** joint test of the 5 weeks before adoption, p = 0.37.

All numbers come from `node scripts/report.mjs` and are computed in the browser by the same code.

## How it works

`src/did.js`, no dependencies.

1. **Panel.** Participant-week mean minutes per instance (all tasks or one task), on the log scale
   so a rollout that saves x% is the same shift for a fast pod and a slow one.
2. **Group-time effects (Callaway and Sant'Anna, 2021).** For each adoption wave g and week t,
   ATT(g,t) = mean change since week g-1 among the wave, minus the same change among participants
   not yet treated by max(t, g-1). Already-adopted participants are never used as controls, which
   is what breaks the usual two-way fixed-effects regression under staggered rollouts.
3. **Aggregation.** Event-time effects weighted by wave size; an overall effect over all post
   cells.
4. **Uncertainty.** Participant bootstrap stratified by wave (400 draws), percentile intervals;
   task rows use Bonferroni-adjusted intervals.
5. **Pre-trend test.** Wald test that the 5 pre-adoption event-time effects are jointly zero, with
   the bootstrap covariance and a chi-square tail (incomplete gamma, implemented here).
6. **Baseline it replaces.** Each adopter's mean over the 6 weeks after adoption minus the 6 weeks
   before, averaged.
7. **Units.** Log effects become % (exp - 1) and minutes against the counterfactual mean; hours
   per month use the adopted participants' instances over the last 4 weeks.

## Tests

`node --test test/did.test.mjs` (8 tests, about 4 s):

- deterministic generator; every displayed group has at least 3 people (Optimize's anonymity rule);
- chi-square tail matches table values (5% and 1% critical points);
- hand-built panel: ATT(g,t) exact, and already-adopted units are excluded as controls;
- over 30 seeds, the 95% CI covers the true effect at least 85% of the time and mean bias is under 1 pp;
- placebo (no effect): CI covers 0 at least 85% of the time while before/after still invents savings;
- pre-trend test: at most 17% false alarms under parallel trends, at least 80% detection when adopters
  were already speeding up by 3% a week;
- task-level minute effects add up to the workflow effect within 10%;
- the demo data shows the before/after trap (naive at least 15% larger, search effect not real).

## Data

Synthetic, from `src/generate.js` (seeded, mulberry32). Each instance's tasks are simulated twice
with the same draws, with and without the rollout, so the true effect is known. Minutes depend on
pod, person, practice, seasonality, the Aug 10 search upgrade, a September bump in billing
questions, and noise. App shares in the "Workflow apps" card are fixed proportions.

## Honest limitations

- Synthetic data. The design (waves, a holdout pod, an org-wide change) is chosen to show the
  method; a real rollout may have fewer clean comparison groups.
- Parallel trends is an assumption. The pre-trend test can only find violations it has power for,
  and it assumes the log scale is the right one.
- Adoption is modeled as pod-wide on a known date. Real adoption is gradual and per person; that
  needs an intensity or per-person adoption date (Optimize already sees Dust usage per instance).
- Spillovers (for example, adopters answering faster so non-adopters get fewer hard tickets) would
  bias the comparison group.
- Bootstrap percentile intervals with 9 to 12 people per pod are approximate.
- Frequency effects (more instances per week) are not modeled; only time per instance.

## Novelty note

I checked Scribe's release notes and LaunchNotes changelog (Nov 2025 to Nov 2026), the Optimize
product and landing pages ("Prove your improvements made an impact: measure time spent and
frequency of workflows before and after any change"), and the Optimize help-center articles
(Workflows tab, User groups, Case ID tracking, Process maps, Recommendation confidence). Optimize
offers before/after measurement and side-by-side group comparison; process maps note that variant
comparison is coming. I found no comparison-group, difference-in-differences or event-study
analysis. The method is standard econometrics (Callaway and Sant'Anna, 2021); putting it in the
workflow view, with Optimize's own task breakdown and anonymity rules, is the new part.

## Run locally

Any static server, for example `python3 -m http.server`, then open http://localhost:8000.
Deep links: `?outcome=3` (one task), `?tab=tasks`.
