import { Bars, Picker, SearchTable, Surface, Tabs, fmt, useParamState, useQuery } from "aurora/kit";
import { useState } from "react";

type Email = { id: string; subject: string; sender: string; score: number };
type Rule = { rule: string; why: string; points: number; running: number };
type Tally = { flagged: number; total: number };

/** An inspector: pick one case, walk it through the steps that decide it, and tune the knob that decides them all. */
export default function App() {
  const [pick, setPick] = useParamState<string>("pick");
  const [cutoff, setCutoff] = useParamState<number>("cutoff");
  const emails = useQuery<Email>("emails");
  const rules = useQuery<Rule>("picked_rules");
  const tally = useQuery<Tally>("tally")[0];
  const [tab, setTab] = useState("inspect");
  const current = emails.find((e) => e.id === pick);
  const flagged = current && cutoff !== undefined && current.score >= cutoff;

  return (
    <Surface kind="dots" className="min-h-screen bg-page text-ink">
      <div className="mx-auto max-w-6xl px-5 py-12 md:py-16">
        <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-sm text-muted">mail filter · rule-by-rule</p>
            <h1 className="mt-2 font-display text-4xl md:text-6xl font-semibold tracking-tight">Why did this land in spam?</h1>
            <p className="mt-3 text-ink-2">Pick an email to see every rule that scored it. Move the cutoff to see what else would be caught.</p>
          </div>
          {/* the knob that decides every case, with its consequence right beside it */}
          <label className="w-full md:w-80 rounded-2xl bg-raised/80 p-4 ring-1 ring-hair backdrop-blur">
            <span className="flex items-baseline justify-between text-sm text-ink-2">Spam cutoff <b className="font-mono text-ink">{fmt(cutoff)}</b></span>
            <input type="range" min={1} max={10} step={0.5} value={cutoff ?? 5} onChange={(e) => setCutoff(Number(e.target.value))} className="mt-2 w-full accent-[var(--accent)]" />
            {tally && <span className="text-sm text-muted">{fmt(tally.flagged, "integer")} of {fmt(tally.total, "integer")} emails caught</span>}
          </label>
        </header>

        <div className="mt-10">
          <Tabs tabs={[{ id: "inspect", label: "One email" }, { id: "all", label: "All emails" }]} value={tab} onChange={setTab}>
            {tab === "inspect" ? (
              <div className="grid gap-8 md:grid-cols-[280px_minmax(0,1fr)]">
                <Picker label="Email" value={pick} onChange={setPick} items={emails.map((e) => ({ id: e.id, label: e.subject, hint: e.sender, badge: cutoff !== undefined && e.score >= cutoff ? "spam" : undefined }))} />
                <div className="flex flex-col gap-6">
                  {current && (
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <h2 className="font-display text-2xl font-semibold tracking-tight">{current.subject}</h2>
                      <span className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${flagged ? "text-bad ring-bad" : "text-good ring-good"}`}>
                        {flagged ? "Spam" : "Inbox"} · score {fmt(current.score)}
                      </span>
                    </div>
                  )}
                  {/* the score builds rule by rule: each bar is the running total, so the line shows where it crosses */}
                  <Bars rows={rules} label={(r) => `${r.rule} (${r.points > 0 ? "+" : ""}${fmt(r.points)})`} value="running" threshold={cutoff} thresholdLabel="cutoff" highlight={(r) => cutoff !== undefined && r.running >= cutoff} />
                  <ol className="grid gap-2 text-sm text-ink-2">
                    {rules.map((r) => <li key={r.rule}><b className="text-ink">{r.rule}.</b> {r.why}</li>)}
                  </ol>
                </div>
              </div>
            ) : (
              <SearchTable rows={emails} search={["subject", "sender"]} onPick={(r) => { setPick(r.id); setTab("inspect"); }} picked={(r) => r.id === pick}
                columns={[{ key: "subject", label: "Subject" }, { key: "sender", label: "From" }, { key: "score", label: "Score", format: "number" }]} />
            )}
          </Tabs>
        </div>
      </div>
    </Surface>
  );
}
