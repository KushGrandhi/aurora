# Shaping the story

A view that explains a subject or presents data is a story, not a stack of components. Before you pick a single component, shape the story in your head (not on the page). The look comes next (`references/design-language.md`), and the components come last.

**Scale it to the ask.** "What were sales in March?" gets one number or one chart. "Show me", "explain", "tell me about", "visualize" or "walk me through" gets a story.

## Write the outline first

Keep it to a few lines in your own reasoning:

1. **The one sentence.** What should the reader understand or believe when they reach the end? Every beat serves it. It is usually the view's `summary`.
2. **The six questions, answered silently.** Who is involved (the people, the parts, the actors). What happened or what the thing is. When it happened and how it changed over time. Where it happens and at what scale. Why it matters, or what caused it. How it works. **Never name them on the page**: no "Why it matters" heading, no "Who" section. Weave the answers into the beats, and give the most room to whichever answer is most surprising. Not every story needs all six equally; a mechanism lives on *how*, a market story on *who* and *why*, a history on *when*.
3. **The hook.** Open on the most surprising true thing: one enormous number, the place seen from far away, the object itself, a question the data answers. Not a title card and a row of boxes.
4. **The beats.** Four to seven, each one idea with its own visual change: something moves, zooms, builds, splits or morphs. Each beat should raise the stakes or deepen the understanding of the one before.
5. **The signature moment.** Choose one beat to spend the most craft on: the camera flying in, the scale comparison, the chart that turns into the object, the number the reader drags. People remember one thing; decide what it is.
6. **The pacing.** Alternate big full-screen moments with quiet reading moments. Put interaction where curiosity peaks ("now you try": a value to drag, a part to grab), not everywhere.
7. **The ending.** Land the one sentence, then hand over the means to explore: the full table, the filters, a scene to play with.

## Shapes a story can take

Pick the one the material wants. These are starting points, not templates; mix them.

| Shape | Moves like | Fits |
|---|---|---|
| Zoom | from the whole world down to one detail, or the reverse | places, scale, systems |
| Anatomy | outside in: the object, then its parts, then the one part that matters | machines, organs, products |
| Journey | through time, beat by beat, the scene changing as the years pass | histories, growth, a process |
| Contrast | two things side by side, then the difference that explains everything | comparisons, before and after |
| Reveal | a question or a myth first, the evidence piece by piece, the answer last | surprising findings |
| Build | start with one piece and add until the whole system stands | architectures, recipes, models |

## Turn the outline into a view

Set `"immersive": true` on the view for a story: it becomes one designed page instead of an article. Without a hero the title and summary are a full-screen opening; sections run edge to edge with no alternating bands; aurora's own controls tuck away. Then shape each section:

| Field (on a section) | Values | Use it for |
|---|---|---|
| `height` | `"screen"` | a full-screen moment: one enormous number (`# 65%` in a text item becomes screen-sized type), one sentence |
| `background` | `"page"`, `"surface"`, `"ink"`, `"accent"` | a section on its own ground, edge to edge; its text, charts and designs re-colour to read on it. `ink` inverts the page; `accent` is the one loud moment. Use two or three grounds in a story, not every section |
| `layout: "reel"` | its items | panels that slide sideways as the reader scrolls down: shifts of a day, chapters, three options. Each item is a full screen; a text item's `##` heading becomes display type |
| `layout: "story"` + `variant` | `"behind"`, `"side"`, `"split"` | how the pinned visual sits: `behind` the steps, full screen (the default for a design; the design's kit Panels keep clear of the steps), `side` by side (the default for a chart or diagram), or `split` half and half |
| `steps` (story) | `"left"`, `"right"` | which side the steps are on |

Keep each story step to two or three sentences (about 50 words): it has to fit on one screen over or beside the visual.

- **The hook** is the first screen: a `hero` design, or a section whose first item is the big visual. The view `title` and `summary` sit on it as the headline.
- **Beats that change one visual** are a `story` section: the visual stays pinned and each step moves it (`story.state`, `story.focus`).
- **Beats that each need their own visual** are their own sections, each with a headline that says its point ("East leads, barely", not "Regional data").
- **What-if moments** are numbers the reader drags inside the prose (`{{name}}`, see `references/data.md`).
- **Everything is linked:** use the same names across beats so pointing at one thing lights it up everywhere.
- **Build it beat by beat** with patches, in reading order, so the person watches the story arrive.

## Honest by construction

- Every number comes from a query, never from your memory of the data.
- Motion never distorts a quantity: bars grow from zero, areas scale by area, axes don't jump without saying so.
- Don't invent drama the data doesn't have. If the finding is "nothing changed", the story is about that stability.
