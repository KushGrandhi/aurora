import { motion } from "motion/react";
import { humanizeField, inferFormat, type Cards as CardsC } from "@genui/spec";
import { formatValue } from "../format.ts";
import { SPRING, STAGGER_S } from "../motion.tsx";
import type { RenderCtx } from "../registry.tsx";

type Card = { title: string; subtitle?: string; image?: string; tags: string[]; fields: [string, string][] };

const str = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
const isUrl = (s: string) => /^https?:\/\//i.test(s);

function cardsOf(c: CardsC, ctx: RenderCtx): Card[] {
  if (c.items) {
    return c.items.map((i) => ({ title: i.title, subtitle: i.subtitle, image: i.image, tags: i.tags ?? [], fields: Object.entries(i.fields ?? {}).map(([k, v]) => [humanizeField(k), String(v)]) }));
  }
  const q = c.query!;
  return (ctx.results[q.id]?.rows ?? []).map((r) => ({
    title: str(r[q.title]) ?? "—",
    subtitle: q.subtitle ? str(r[q.subtitle]) : undefined,
    image: q.image ? str(r[q.image]) : undefined,
    tags: q.tags ? (Array.isArray(r[q.tags]) ? (r[q.tags] as unknown[]).map(String) : (str(r[q.tags]) ?? "").split(",").map((t) => t.trim()).filter(Boolean)) : [],
    fields: (q.fields ?? []).map((f) => [humanizeField(f), formatValue(r[f], inferFormat(f))]),
  }));
}

export default function Cards({ c, ctx }: { c: CardsC; ctx: RenderCtx }) {
  const cards = cardsOf(c, ctx);
  return (
    <div className={`cards ${c.layout ?? "grid"}`}>
      {cards.map((card, i) => {
        const src = card.image ? ctx.media(card.image) ?? (isUrl(card.image) ? card.image : undefined) : undefined;
        return (
          <motion.article key={i} className="card-tile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: Math.min(i, 12) * STAGGER_S }}>
            {src && <img src={src} alt="" loading="lazy" />}
            <div className="card-body">
              <div className="card-name">{card.title}</div>
              {card.subtitle && <div className="card-sub">{card.subtitle}</div>}
              {card.tags.length > 0 && <div className="tags">{card.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
              {card.fields.length > 0 && (
                <dl className="fields">{card.fields.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
              )}
            </div>
          </motion.article>
        );
      })}
    </div>
  );
}
