import { Children, type ReactNode } from "react";
import { motion } from "motion/react";

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Fades and lifts its content in once, on first show. */
export function Reveal({ children, delay = 0, y = 12 }: { children: ReactNode; delay?: number; y?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay }}>
      {children}
    </motion.div>
  );
}

/** Reveals each child in turn, `gap` seconds apart: one orchestrated entrance instead of scattered motion. */
export function Stagger({ children, gap = 0.06 }: { children: ReactNode; gap?: number }) {
  return <>{Children.toArray(children).map((c, i) => <Reveal key={i} delay={i * gap}>{c}</Reveal>)}</>;
}
