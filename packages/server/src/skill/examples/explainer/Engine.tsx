import { CX, CY, R, HEAD, PISTON_H, engineAt } from "./model";

// Fixed positions for the gas particles, spread over the chamber (u, v in 0..1). Deterministic: no Math.random in render.
const DOTS = Array.from({ length: 30 }, (_, i) => ({ u: 0.08 + ((i * 37) % 84) / 100, v: 0.1 + ((i * 53) % 80) / 100 }));

// One colour per stage, mixed in CSS so it follows the theme. color-mix keeps tokens instead of hard-coded hex.
function gasFor(stage: number, p: number) {
  const pct = Math.round(p * 100);
  if (stage === 0) return { fill: "var(--s1)", alpha: 0.25, share: p };
  if (stage === 1) return { fill: `color-mix(in oklab, var(--s1), var(--s4) ${pct}%)`, alpha: 0.3 + 0.3 * p, share: 1 };
  if (stage === 2) return { fill: `color-mix(in oklab, var(--s4), var(--bad) ${pct}%)`, alpha: 0.7 - 0.4 * p, share: 1 };
  return { fill: "var(--muted)", alpha: 0.3 * (1 - p) + 0.08, share: 1 - p };
}

function Valve({ x, lift }: { x: number; lift: number }) {
  const y = HEAD + lift;
  return (
    <g>
      <line x1={x} y1={30} x2={x} y2={y} stroke="var(--ink-2)" strokeWidth={4} strokeLinecap="round" />
      <path d={`M ${x - 14} ${y} L ${x + 14} ${y} L ${x + 5} ${y - 7} L ${x - 5} ${y - 7} Z`} fill="var(--ink-2)" />
    </g>
  );
}

// A label sits OUTSIDE the drawing with a thin leader line to its part, so moving parts never cover text.
function Label({ x, y, to, children }: { x: number; y: number; to: [number, number]; children: string }) {
  return (
    <g>
      <line x1={x - 4} y1={y - 4} x2={to[0]} y2={to[1]} stroke="var(--line)" strokeWidth={1} />
      <text x={x} y={y} fontSize={12} fill="var(--ink-2)">{children}</text>
    </g>
  );
}

export default function Engine({ deg, t }: { deg: number; t: number }) {
  const e = engineAt(deg);
  const gas = gasFor(e.stage, e.p);
  const chamber = e.top - HEAD;
  const shown = Math.round(DOTS.length * gas.share);
  const flowing = (lift: number) => lift > 1;

  return (
    <svg viewBox="0 0 400 450" className="h-auto w-full" role="img" aria-label="Cross-section of one engine cylinder">
      {/* intake and exhaust ports: a moving dot shows flow only while the valve is open */}
      <path d={`M 16 84 H 158 V ${HEAD}`} fill="none" stroke="var(--s1)" strokeOpacity={flowing(e.intakeLift) ? 0.45 : 0.15} strokeWidth={22} />
      <path d={`M 222 ${HEAD} V 84 H 364`} fill="none" stroke="var(--muted)" strokeOpacity={flowing(e.exhaustLift) ? 0.45 : 0.12} strokeWidth={22} />
      {flowing(e.intakeLift) && [0, 1, 2].map((i) => <circle key={i} cx={16 + ((t * 1.5 + i / 3) % 1) * 142} cy={84} r={3} fill="var(--s1)" />)}
      {flowing(e.exhaustLift) && [0, 1, 2].map((i) => <circle key={i} cx={222 + ((t * 1.5 + i / 3) % 1) * 142} cy={84} r={3} fill="var(--muted)" />)}
      <text x={16} y={64} fontSize={11} fill="var(--muted)">air + fuel in</text>
      <text x={364} y={64} fontSize={11} fill="var(--muted)" textAnchor="end">exhaust out</text>

      {/* head and cylinder walls */}
      <rect x={110} y={96} width={180} height={24} rx={3} fill="var(--line)" />
      <rect x={118} y={HEAD} width={12} height={180} fill="var(--line)" />
      <rect x={250} y={HEAD} width={12} height={180} fill="var(--line)" />

      {/* gas: colour = stage, dot density = how tightly it is packed */}
      <rect x={130} y={HEAD} width={120} height={chamber} fill={gas.fill} opacity={gas.alpha} />
      {DOTS.slice(0, shown).map((d, i) => (
        <circle key={i} cx={130 + d.u * 120 + Math.sin(t * 3 + i) * 1.5} cy={HEAD + d.v * chamber} r={2.2} fill={gas.fill} />
      ))}

      <Valve x={158} lift={e.intakeLift} />
      <Valve x={222} lift={e.exhaustLift} />

      {/* spark plug */}
      <rect x={184} y={34} width={12} height={62} rx={3} fill="var(--raised)" stroke="var(--ink-2)" />
      {e.spark && <circle cx={190} cy={HEAD + 6} r={14} fill="var(--s4)" opacity={0.8} />}

      {/* rod, piston, crank */}
      <line x1={CX} y1={e.wristY} x2={e.pinX} y2={e.pinY} stroke="var(--ink-2)" strokeWidth={10} strokeLinecap="round" />
      <rect x={132} y={e.top} width={116} height={PISTON_H} rx={4} fill="var(--raised)" stroke="var(--ink-2)" strokeWidth={2} />
      {[8, 14].map((d) => <line key={d} x1={132} x2={248} y1={e.top + d} y2={e.top + d} stroke="var(--line)" strokeWidth={1.5} />)}
      <circle cx={CX} cy={CY} r={R + 10} fill="none" stroke="var(--line)" strokeDasharray="3 5" />
      <line x1={CX} y1={CY} x2={e.pinX} y2={e.pinY} stroke="var(--ink-2)" strokeWidth={14} strokeLinecap="round" />
      <circle cx={CX} cy={CY} r={7} fill="var(--raised)" stroke="var(--ink-2)" strokeWidth={3} />

      <text x={190} y={22} fontSize={12} fill="var(--ink-2)" textAnchor="middle">spark plug</text>
      <Label x={300} y={e.top + 26} to={[250, e.top + 22]}>piston</Label>
      <Label x={300} y={CY + 4} to={[CX + R + 12, CY]}>crankshaft</Label>
      <Label x={10} y={HEAD + 46} to={[144, HEAD + e.intakeLift]}>intake valve</Label>
    </svg>
  );
}
