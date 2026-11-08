# Haiku: does the form fit the reader's job? (diversity, round 1)

**Question:** given a one-line request, does a small model (Claude Haiku) choose the form that fits the reader's job?
Only form is judged here; how it looks is the quality track, judged separately.

**Setup (2026-11-07):** branch `immersive-stories` at `314ca7e` (forms.md, compact sections). Nine fresh Haiku
subagents, each given only its request, its data folder (sample data) and a view id, with the aurora skill and
tools as installed. An independent judge read each view's JSON and scored it 0-2 on form fit, the first five
seconds, and use of aurora's form tools where they apply (total /6), blind to looks.

| id | request | form chosen | fit | first 5 s | tools | /6 | most important miss |
|---|---|---|---|---|---|---|---|
| f1 | Q3 revenue? | answer: one KPI | 2 | 2 | 1 | 5 | headline doesn't state the figure; no comparison |
| f2 | keep an eye on our API services | monitor, compact | 1 | 0 | 1 | 2 | averages p95 across services, hiding the checkout incident |
| f3 | dig into orders by region, channel, product | explorer, filters, compact | 2 | 2 | 2 | 6 | no date range; table capped |
| f4 | choose between three laptops | verdict, 2 charts, table | 1 | 2 | 1 | 4 | options not side by side; deciding measures not charted |
| f5 | what happened to signups last spring | immersive finding, screen hook | 2 | 2 | 1 | 5 | not a story layout; changelog events not on the chart |
| f6 | explain a refrigerator | pinned 3D story, steps drive it | 0 | 1 | 1 | 2 | **re-scored by Kush after seeing it:** no recognisable fridge (a glass box with sticks), labels point at nothing, evaporator and condenser in one box, so heat moving out of the food never shows |
| f7 | how much would I save paying the mortgage faster | static KPIs + table | 1 | 1 | 0 | 2 | the reader can't change anything; arbitrary $250 default |
| f8 | landing page for Inkwell | whole-page design | 2 | 2 | 2 | 6 | no proof or pricing |
| f9 | look up our offices and contacts | KPIs, chart, then the table | 1 | 1 | 1 | 3 | the directory is third, behind numbers nobody looks up |

**Average 35/54** (39 before f6 was re-scored). Five of nine served the job; f2, f6, f7 and f9 did not.

**Method flaw (found by Kush):** the judge was blind to looks, but for an explainer or a pitch the picture *is* the form: "does it show the mechanism?" can't be judged from JSON. Round 2 gives the form judge the `look` pictures too, still scoring whether the job is served, not polish.

**Patterns (judge):**
1. It reaches for the dashboard template (KPI row → chart → table last) whatever the job: buries the lookup
   (f9), the side-by-side (f4), the inputs (f7), the exception (f2).
2. It summarises instead of picking out the exception or the deciding difference: averages hide the incident
   (f2), the verdict's measures aren't shown (f4), an arbitrary scenario stands in for the reader's (f7).
3. It builds interactivity only when the request names a thing to build (explain, landing page), never when the
   data job needs it (a what-if without inputs, a finding without a story layout).

**Also found:** `look` closed its browser under concurrent looks (fixed: the idle timer only runs when no look is
active) and photographed only the first screen of a whole-page design (fixed: it walks the design's own frame).

## Round 2 (2026-11-08)

**Setup:** branch `immersive-stories` at `d36a4e6`: forms.md now gives each form's first screen, "show the exception,
not the average", "a what-if needs inputs"; new examples `monitor` and `tool`. Same nine requests word for word, fresh
Haiku agents, view ids `g1`-`g9`. The judge now also read `look` pictures (desktop; phone too for g6 and g8).

| id | request | form chosen | fit | first 5 s | tools | /6 | r1 | most important miss |
|---|---|---|---|---|---|---|---|---|
| g1 | Q3 revenue? | answer: the total, then by region | 2 | 2 | 2 | 6 | 5 | none that matters |
| g2 | keep an eye on our API services | monitor: incident callout from SQL, status table worst first | 2 | 2 | 1 | 5 | 2 | p95 over 24 h still blurs the spike; trends not compact |
| g3 | dig into orders | explorer: filters, linked charts, table | 2 | 2 | 2 | 6 | 6 | table groups combinations, not orders |
| g4 | choose between three laptops | comparison: specs table, bars, verdict | 2 | 1 | 2 | 5 | 4 | trade-offs below the fold; winners not marked |
| g5 | what happened to signups | grid: numbers, chart, separate changelog | 1 | 1 | 0 | 2 | 5 | not a story; events not on the chart |
| g6 | explain a refrigerator | pinned 3D fridge, seven steps | 2 | 1 | 2 | 5 | 2 | phone: model tiny, step clipped; first screen has no step text |
| g7 | mortgage, pay faster | static scenarios: KPI, bars, table | 0 | 1 | 0 | 1 | 2 | still no inputs |
| g8 | landing page for Inkwell | whole-page design | 2 | 2 | 2 | 6* | 6 | none |
| g9 | look up offices | one plain table, list first | 1 | 1 | 0 | 2 | 3 | no search; table cut off at row 10 |

**Average 38/54** (round 1: 35). Monitor and explainer improved most; finding and what-if got worse or stayed broken.

\* **g8 is contaminated:** its agent read this file (round 1's "no proof or pricing" note) from the repo. Eval agents
must run where they can't see `docs/evals` or the checklist. The other eight read neither (checked in their transcripts).

**Why the what-if and the finding missed (from the agents' transcripts):** almost none of the nine opened
`references/forms.md`. g2 opened `examples/monitor.md` and got the incident first; g7 opened neither forms.md nor
`examples/tool.md`. Haiku acts on SKILL.md and skips the references, so rules that matter must be in SKILL.md itself.

**Patterns (judge):**
1. Inputs and search are used only when the request names them ("dig into" got filters; a what-if and a lookup did not).
2. Story layout goes to the physical explainer but not to the data finding.
3. One summary number flattens the moment that matters (a 24-hour p95; one fixed scenario).
