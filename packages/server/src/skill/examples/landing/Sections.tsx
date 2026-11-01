import { useState } from "react";
import { Check, ChevronDown, Feather, Link2, Lock, NotebookPen } from "lucide-react";

const Wrap = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <div className={`mx-auto max-w-6xl px-6 ${className}`}>{children}</div>;
const Eyebrow = ({ children }: { children: string }) => <div className="text-xs font-medium uppercase tracking-wider text-accent">{children}</div>;

export function Nav() {
  return (
    <nav className="sticky top-0 z-10 border-b border-hair bg-page/80 backdrop-blur">
      <Wrap className="flex h-14 items-center justify-between">
        <div className="flex items-center gap-2 font-semibold"><NotebookPen size={18} className="text-accent" /> Lumen</div>
        <div className="hidden gap-6 text-sm text-ink-2 md:flex"><a>Features</a><a>Pricing</a><a>FAQ</a></div>
        <button className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-page">Sign up</button>
      </Wrap>
    </nav>
  );
}

export function Proof() {
  return (
    <Wrap className="pb-16 text-center">
      <p className="text-sm text-muted">Used daily by writers and teams at</p>
      <div className="mt-4 flex flex-wrap justify-center gap-x-10 gap-y-3 text-lg font-semibold tracking-tight text-ink-2/70">
        {["Northwind", "Halcyon", "Field Notes Co.", "Parallel", "Oakline"].map((n) => <span key={n}>{n}</span>)}
      </div>
    </Wrap>
  );
}

export function Features() {
  const items = [
    { icon: Link2, title: "Related notes, automatically", body: "Lumen links what you're writing to what you've already written. No folders to maintain." },
    { icon: Feather, title: "Quiet by design", body: "No badges, no feeds. A blank page that opens in under a second and gets out of the way." },
    { icon: Lock, title: "Yours, on your device", body: "Notes are stored locally and encrypted end to end when they sync." },
  ];
  return (
    <Wrap className="py-20">
      <Eyebrow>Why Lumen</Eyebrow>
      <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight">Write once. Find it when it matters.</h2>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {items.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-2xl bg-surface p-6 shadow-card ring-1 ring-hair">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-raised ring-1 ring-hair"><Icon size={18} className="text-accent" /></div>
            <h3 className="mt-4 font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{body}</p>
          </div>
        ))}
      </div>
    </Wrap>
  );
}

export function How() {
  const steps = [["Write", "Open Lumen and start typing. Markdown works, nothing is required."], ["Connect", "Related notes appear beside your text as you write."], ["Recall", "Search by meaning, not exact words: \"that bakery in Lisbon\"."]];
  return (
    <section className="border-y border-hair bg-surface py-20">
      <Wrap>
        <Eyebrow>How it works</Eyebrow>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {steps.map(([t, b], i) => (
            <div key={t}>
              <div className="text-sm font-medium tabular-nums text-muted">0{i + 1}</div>
              <h3 className="mt-2 text-xl font-semibold tracking-tight">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{b}</p>
            </div>
          ))}
        </div>
      </Wrap>
    </section>
  );
}

export function Pricing() {
  const tiers = [
    { name: "Free", price: "$0", note: "forever", features: ["Unlimited notes", "Related notes", "One device"], cta: "Start free" },
    { name: "Plus", price: "$6", note: "per month", features: ["Everything in Free", "Sync across devices", "Search by meaning"], cta: "Try Plus", featured: true },
    { name: "Team", price: "$10", note: "per person / month", features: ["Everything in Plus", "Shared spaces", "Admin and SSO"], cta: "Talk to us" },
  ];
  return (
    <Wrap className="py-20">
      <div className="text-center"><Eyebrow>Pricing</Eyebrow><h2 className="mt-2 text-3xl font-semibold tracking-tight">Simple, and free to start</h2></div>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {tiers.map((t) => (
          <div key={t.name} className={`flex flex-col rounded-2xl p-6 ring-1 ${t.featured ? "bg-raised shadow-card ring-accent" : "bg-surface ring-hair"}`}>
            <div className="flex items-center justify-between"><h3 className="font-semibold">{t.name}</h3>{t.featured && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white">Popular</span>}</div>
            <div className="mt-4 flex items-baseline gap-1"><span className="text-4xl font-semibold tracking-tight tabular-nums">{t.price}</span><span className="text-sm text-muted">{t.note}</span></div>
            <ul className="mt-6 flex-1 space-y-2 text-sm text-ink-2">{t.features.map((f) => <li key={f} className="flex gap-2"><Check size={16} className="mt-0.5 text-good" />{f}</li>)}</ul>
            <button onClick={() => window.aurora?.send("plan", { plan: t.name })} className={`mt-6 rounded-xl px-4 py-2.5 text-sm font-medium ${t.featured ? "bg-accent text-white hover:opacity-90" : "bg-raised ring-1 ring-hair hover:bg-page"}`}>{t.cta}</button>
          </div>
        ))}
      </div>
    </Wrap>
  );
}

export function Faq() {
  const qa = [["Can I import from other apps?", "Yes: Markdown folders, Apple Notes and Notion exports."], ["Does Lumen read my notes?", "Related notes are computed on your device. Nothing is sent to a server to do it."], ["What happens if I stop paying?", "You keep every note. Sync pauses; everything stays readable and exportable."]];
  const [open, setOpen] = useState(0);
  return (
    <Wrap className="max-w-3xl pb-20">
      <h2 className="text-center text-3xl font-semibold tracking-tight">Questions</h2>
      <div className="mt-8 divide-y divide-hair rounded-2xl bg-surface ring-1 ring-hair">
        {qa.map(([q, a], i) => (
          <button key={q} onClick={() => setOpen(open === i ? -1 : i)} className="block w-full px-6 py-4 text-left">
            <div className="flex items-center justify-between font-medium">{q}<ChevronDown size={16} className={`text-muted transition-transform ${open === i ? "rotate-180" : ""}`} /></div>
            {open === i && <p className="mt-2 text-sm leading-relaxed text-ink-2">{a}</p>}
          </button>
        ))}
      </div>
    </Wrap>
  );
}

export function CTA() {
  return (
    <Wrap className="pb-20">
      <div className="rounded-3xl bg-ink px-8 py-14 text-center text-page">
        <h2 className="text-3xl font-semibold tracking-tight">Start your first note in ten seconds.</h2>
        <p className="mx-auto mt-3 max-w-md opacity-70">Free forever for one device. No card needed.</p>
        <button onClick={() => window.aurora?.send("cta", { where: "footer" })} className="mt-8 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:opacity-90">Start writing free</button>
      </div>
    </Wrap>
  );
}

export function Footer() {
  return <footer className="border-t border-hair py-8 text-center text-sm text-muted">© Lumen Labs · Privacy · Terms</footer>;
}
