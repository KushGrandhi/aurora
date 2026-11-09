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

## Baseline: three runs per request (2026-11-08)

**Why:** one run per request can't tell a change from noise (g5 fell 5 → 2 with nothing aimed at it). Same skill as
round 2 (`d36a4e6`), each request run three times by fresh Haiku agents (`b`, `c`, `d` 1-9), with `docs/evals` and the
checklist moved out of the repo during the runs. Three judges, each scoring three requests across all three runs, with
pictures.

| request | b | c | d | mean | range |
|---|---|---|---|---|---|
| answer (Q3 revenue) | 6 | 6 | 6 | 6.0 | 0 |
| monitor (API services) | 6 | 5 | 1 | 4.0 | 5 |
| explorer (orders) | 6 | 3 | 6 | 5.0 | 3 |
| comparison (laptops) | 3 | 5 | 3 | 3.7 | 2 |
| finding (signups) | 2 | 2 | 2 | 2.0 | 0 |
| explainer (fridge) | 5 | 3 | 4 | 4.0 | 2 |
| what-if (mortgage) | 2 | 3† | 2 | 2.3 | 1 |
| pitch (landing page) | 6 | 6 | 6 | 6.0 | 0 |
| reference (offices) | 6 | 3 | 3 | 4.0 | 3 |
| **total /54** | **42** | **36** | **33** | **37** | **9** |

**What this says:**
- Run-to-run spread on the same skill is 9 points (33-42). Round 1 (35) and round 2 (38) are inside it: the earlier
  "improvement" is not shown. A change must move the mean of three runs by more than this spread to count.
- **Reliably solved:** answer and pitch (6, 6, 6).
- **Reliably failing:** the finding (2, 2, 2: never a story, events never on the chart) and the what-if (two of three
  runs built no input).
- **Unstable:** monitor (6 to 1), explorer, reference: the model can do them, but doesn't reliably.

† **c7 was an aurora bug, not the model:** it built a `{{extra}}` input, and aurora removed it from the sentence after
the next patch (the text re-ran its control setup on text whose token was already replaced). Fixed with a browser test.

**Aurora problems the 27 runs surfaced (product, not model):**
1. A "Q3" or "2026" in a label is rejected as a typed number (three of three answer runs had to reword it).
2. A large empty gap under KPI rows on desktop (reported in five runs).
3. The data profile's distinct count is an estimate shown as exact (1,165 of 1,200 order ids), so two agents
   reported duplicate orders that don't exist.
4. A kit panel and control bar are cut off on a phone (two of three 3D fridge runs).
5. `render` rejected a large design view's JSON; agents fell back to the HTTP API.
6. The palette can't be changed by a patch (an agent said it needs a full re-render; to check).

## Sonnet vs Haiku (2026-11-08)

Same nine requests, same skill (`d36a4e6` + the prose-control fix), one Sonnet run (`s1`-`s9`) judged side by side with
Haiku's run `b` by two judges who weren't told which maker made which. Form uses the rubric above; quality (designed
not generic, craft, intuitive) is judged from desktop and phone pictures.

| request | Haiku form | Sonnet form | Haiku quality | Sonnet quality |
|---|---|---|---|---|
| answer | 4 | 5 | 1 | 3 |
| monitor | 4 | 5 | 4 | 4 |
| explorer | 5 | 6 | 4 | 4 |
| comparison | 3 | 6 | 2 | 5 |
| finding | 3 | 5 | 1 | 5 |
| explainer (fridge) | 4 | 6 | 2 | 4 |
| what-if | 1 | 6 | 1 | 4 |
| pitch | 6 | 6 | 5 | 6 |
| reference | 5 | 6 | 3 | 4 |
| **total /54** | **35** | **51** | **23** | **39** |

Sonnet won or tied every pair on both dimensions. The forms Haiku fails every time (finding, what-if) Sonnet builds
right: a story with the chart pinned, inputs in the sentence. One run each, so only the size of the gap is solid.

**Where Sonnet still falls short (aurora's ceiling, not the model's):** a pinned chart in a story sits small in an
empty half-screen; empty space under KPI rows; kit 3D is primitive (food as cubes, labels clipped at the cabinet edge);
the "literal number" check blocked highlighting the Q3 bar; `render` couldn't take a large design, so it used HTTP.
Quality is 39/54 at best: nobody reaches beautiful yet. Sonnet also invented a named customer testimonial.

## Canvas first (2026-11-08)

Branch `canvas-first` (`2b57a79`): SKILL.md makes a page design that reads the queries the default, with surfaces,
designs that set params, kit parts (Picker, Bars, SearchTable, Tabs) and an inspector example; checks replace the
dropped rules. Same prompts, fresh agents, eval notes hidden. A blind judge compared each new Sonnet page with Sonnet's
earlier catalog view of the same request, from desktop and phone pictures.

| request | before form | canvas form | before quality | canvas quality |
|---|---|---|---|---|
| Jarvis data ("Show this data on aurora") | 3 | 5 | 4 | 3 |
| monitor | 3 | 6 | 2 | 5 |
| signups finding | 4 | 6 | 4 | 5 |
| mortgage what-if | 5 | 6 | 3 | 5 |
| **total** | **15/24** | **23/24** | **13/24** | **18/24** |

- On the Jarvis data Sonnet built an inspector like Kush's reference (pick a prompt, candidate bars with the cutoff
  line, a live cutoff slider, a contour surface, a vault tab) from the data alone. Its quality score lost a point to a
  phone overflow.
- The finding now marks the changelog events on the chart with the dip shaded; the monitor's headline is built from the
  data; every control the judge checked feeds the queries.
- **Haiku didn't follow it:** the what-if was static scenarios again and the Jarvis view a catalog dashboard with one
  picker. Canvas-first lifts Sonnet; Haiku needs something stronger than guidance.

**Remaining flaws (judge):**
1. Phone: charts scale down instead of reflowing; labels become unreadable and two pages overflow sideways.
2. Params persist on the server across visitors, so a page can open on someone's leftover slider value (view_e at
   0.24: "0 of 15 would pass" beside "14 passed"). A view should open at its defaults, or say it isn't.
3. False precision (cents on large sums) in one page.
