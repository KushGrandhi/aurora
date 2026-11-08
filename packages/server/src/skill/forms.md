# Choosing the form

The first decision is not which components to use, and not whether to tell a story. It is: **what will the reader do with this?** The same data can need a number, a story, a monitor or a tool, depending on the reader's job. Decide the job, and the form follows.

## Read the job

Look at three things:

1. **What they asked, and how.** "What was…", "how many…" wants an answer. "Explain", "why", "walk me through" wants understanding. "Keep an eye on", "track", "dashboard", "monitor" wants to watch over time. "Let me dig into", "break down by", "slice" wants to explore. "Which should we…", "compare", "A or B" wants to decide. "What if", "how much would" wants to try. "Pitch", "landing page", "sell" wants to persuade.
2. **What the data is.** One striking finding suggests a story. Many measures over time suggest a monitor. Many rows and several dimensions suggest an explorer. Two to five alternatives suggest a comparison. A formula or a model with inputs suggests a tool. A physical thing or a process suggests an explainer.
3. **Whether they will come back.** Something they will open every morning is a monitor, not a story. Something they will read once is a story or an answer, not a monitor.

When the signals disagree, ask what the reader most needs in the first five seconds, and serve that first.

## Forms

| The reader wants to… | Form | How it is built | It works when |
|---|---|---|---|
| get one answer | **Answer** | the number or one chart, with a one-line headline that says it; no sections to scroll | the answer is visible without scrolling |
| understand a finding | **Story** | `references/story.md`: a hook, beats, a signature moment, an ending; `immersive`, screen moments, pinned visuals | the reader ends knowing one thing they didn't |
| see how something works | **Explainer** | a story whose pinned visual is a design (3D or drawing) driven by the steps and the scroll | the mechanism is visible, not described |
| watch something over time | **Monitor** | a `density: "compact"` grid section: the few numbers that matter first (tiles with sparklines, up to six a row), then the trends, then what needs attention; no narrative, no immersive opening | it reads in one glance, top left to bottom right |
| dig in and slice | **Explorer** | a `density: "compact"` section: a few linked charts that answer the obvious questions, the full table last; the view's filters sit at its top and stay on screen while it scrolls | every question the reader has is one click away |
| compare and decide | **Comparison** | the options side by side (a grid of equal columns, a `split` story, or a `reel` of options), the same measures in the same order for each, the trade-off stated up front | the difference that decides it is the biggest thing on screen |
| try what-ifs | **Tool** | numbers the reader drags in the prose (`{{name}}`, `references/data.md`) or a design with controls; the result updates as they change | the reader can change an input and see the result at once |
| look things up | **Reference** | `tabs`, a table, `cards`; search or a select filter; headings that match what people look for | the reader finds their item in seconds |
| be persuaded | **Pitch** | a whole-page `design` (`display: "page"`) | one promise, proven, with one thing to do next |

## Blend when it serves the reader

A view is made of sections, and each section can be a different form. Blending is often the best answer:

- **Story, then explorer:** three screens that tell the finding, then filters and the table so the reader can check it and look further. The common answer to "analyse this data".
- **Answer, then the why:** the number first, then a short story of what drives it.
- **Monitor with a note:** a dense monitor, with one callout at the top for what changed since yesterday.
- **Comparison, then a tool:** the options side by side, then a calculator to try your own numbers.
- **Explainer, then a reference:** how it works, then the parts in a table to look up.

A compact section carries the view's filters at its top (the first compact section, if there are several), so in a story that hands over to an explorer the filters appear where the exploring starts.

Lead with whatever the reader needs first. Don't blend for variety's sake: every section must serve the job.

## The look follows the form

Every form gets an art direction (`references/design-language.md`): its own colours and type. But beauty differs by form. A story is cinematic: scale, pacing, one big moment. A monitor is calm and dense: aligned numbers, quiet colour, the one alert in colour. An explorer is clear: the filters obvious, the charts consistent. A tool is immediate: the input and its effect side by side. A reference is scannable: strong headings, nothing in the way.
