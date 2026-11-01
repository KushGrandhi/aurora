import { Check } from "lucide-react";
import { motion } from "motion/react";
import type { Steps as StepsC } from "@aurora/spec";
import { SPRING, STAGGER_S } from "../motion.tsx";

export default function Steps({ c }: { c: StepsC }) {
  return (
    <ol className="steps">
      {c.steps.map((s, i) => (
        <motion.li key={i} className={`step ${s.status ?? "todo"}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * STAGGER_S }}>
          <span className="dot" aria-label={s.status ?? "todo"}>{s.status === "done" ? <Check size={13} strokeWidth={3} aria-hidden /> : i + 1}</span>
          <div className="step-body">
            <div className="step-title">{s.title}</div>
            {s.detail && <div className="step-detail">{s.detail}</div>}
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
