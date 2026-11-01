import { motion } from "motion/react";
import { ArrowRight, Search, Sparkles } from "lucide-react";

const rise = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] as const } });

// No images in the sandbox: the hero visual is a small product mockup built from the same tokens.
function Mockup() {
  const notes = [["Trip to Lisbon", "Flights, the tile museum, that bakery…", "s2"], ["Q3 planning", "Three bets, one owner each", "s1"], ["Reading list", "Seeing Like a State; The Dawn of Everything", "s3"]];
  return (
    <motion.div {...rise(3)} className="mx-auto mt-14 max-w-4xl rounded-2xl bg-surface p-2 shadow-card ring-1 ring-hair">
      <div className="grid overflow-hidden rounded-xl bg-raised ring-1 ring-hair md:grid-cols-[240px_1fr]">
        <div className="hidden border-r border-hair p-4 md:block">
          <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-muted ring-1 ring-hair"><Search size={14} /> Search notes</div>
          <div className="mt-4 space-y-1">
            {notes.map(([title, , c], i) => (
              <div key={title} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${i === 0 ? "bg-surface font-medium ring-1 ring-hair" : "text-ink-2"}`}>
                <span className="h-2 w-2 rounded-full" style={{ background: `var(--${c})` }} /> {title}
              </div>
            ))}
          </div>
        </div>
        <div className="p-6 text-left md:p-8">
          <div className="text-xs font-medium uppercase tracking-wider text-muted">Edited just now</div>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight">Trip to Lisbon</h3>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">Flights land Friday 9:40. Tile museum Saturday morning, then the bakery Ana mentioned in Alfama.</p>
          <div className="mt-5 flex items-start gap-3 rounded-xl bg-surface p-4 ring-1 ring-hair">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-sm text-ink-2"><span className="font-medium text-ink">Related:</span> "Lisbon restaurants" from 2023 and 2 photos from Ana's message.</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function Hero() {
  return (
    <section className="px-6 pb-20 pt-16 text-center md:pt-24">
      <motion.div {...rise(0)} className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-2 ring-1 ring-hair">
        <span className="h-1.5 w-1.5 rounded-full bg-good" /> New: related notes surface on their own
      </motion.div>
      <motion.h1 {...rise(1)} className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">Notes that find each other.</motion.h1>
      <motion.p {...rise(2)} className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-2">Lumen is a calm place to write. As you type, it quietly brings back what you wrote before, so nothing you learn gets lost.</motion.p>
      <motion.div {...rise(2)} className="mt-8 flex flex-wrap justify-center gap-3">
        <button onClick={() => window.aurora?.send("cta", { where: "hero" })} className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:opacity-90">Start writing free <ArrowRight size={16} /></button>
        <button className="rounded-xl bg-raised px-5 py-3 text-sm font-medium ring-1 ring-hair hover:bg-surface">See how it works</button>
      </motion.div>
      <Mockup />
    </section>
  );
}
