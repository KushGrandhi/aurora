// The mechanism as pure functions of one number, the crank angle θ in degrees (0..720 is one full cycle).
// The 3D scene and the panels only read from here, so the drawing can never disagree with the explanation.
export const R = 0.55; // crank throw radius
export const L = 1.7; // connecting rod length
export const BORE = 0.46; // piston radius
export const PISTON_H = 0.42;
export const PIN_UP = 0.06; // the wrist pin sits a little below the piston's centre
export const HEAD = R + L + PIN_UP + PISTON_H / 2 + 0.14; // crank centre to cylinder head, along the bore
export const LINER_BOTTOM = L - R + PIN_UP - PISTON_H / 2 - 0.04;
export const SPACING = 1.0; // between crank throws
export const OFFSET = 0.22; // the left and right cylinders on one throw sit side by side
export const BANK = 45; // each bank leans 45° from vertical: a 90° V

export const mod = (x: number, n: number) => ((x % n) + n) % n; // always 0..n, even for negative x
export const rad = (d: number) => (d * Math.PI) / 180;

const PHI = [0, 90, 270, 180]; // cross-plane crank: the four throws point 90° apart
// The crank angle at which each cylinder fires. One fires every 90°, alternating banks unevenly (the V8 burble).
const FIRE: Record<string, number> = { L1: 315, L2: 225, L3: 45, L4: 495, R1: 405, R2: 675, R3: 135, R4: 585 };

export type Cyl = { n: number; bank: -1 | 1; beta: number; phi: number; z: number; fire: number };

export const CYLS: Cyl[] = [1, 2, 3, 4].flatMap((k) =>
  ([-1, 1] as const).map((bank) => ({
    n: bank < 0 ? 2 * k - 1 : 2 * k, // left bank 1 3 5 7, right bank 2 4 6 8, front to back
    bank,
    beta: bank * BANK,
    phi: PHI[k - 1],
    z: (k - 2.5) * SPACING + bank * OFFSET,
    fire: FIRE[(bank < 0 ? "L" : "R") + k],
  })),
);

const byFire = [...CYLS].sort((a, b) => a.fire - b.fire).map((c) => c.n);
export const FIRING_ORDER = [...byFire.slice(byFire.indexOf(1)), ...byFire.slice(0, byFire.indexOf(1))];
export const cyl = (n: number) => CYLS.find((c) => c.n === n) ?? CYLS[0];

export const STROKES = [
  { name: "Power", color: "--bad", text: "The spark fires. Burning gas expands and shoves the piston down. This is the only stroke that turns the crank." },
  { name: "Exhaust", color: "--muted", text: "The exhaust valve opens and the rising piston pushes the burnt gas out." },
  { name: "Intake", color: "--s1", text: "The intake valve opens and the falling piston draws in air and fuel." },
  { name: "Compression", color: "--warn", text: "Both valves shut. The rising piston squeezes the mixture, ready for the spark." },
];

/** Where one cylinder is in its own cycle at crank angle θ. phase 0 is the spark, at top dead centre. */
export function cylAt(c: Cyl, theta: number) {
  const phase = mod(theta - c.fire, 720);
  const stroke = Math.min(3, Math.floor(phase / 180));
  const f = (phase % 180) / 180; // progress through this stroke, 0..1
  const a = rad(mod(theta - c.fire, 360)); // crank angle since this cylinder's top dead centre
  const s = R * Math.cos(a) + Math.sqrt(L * L - (R * Math.sin(a)) ** 2); // crank centre to wrist pin
  const psi = rad(theta + c.phi); // where this cylinder's crank pin points
  return {
    phase, stroke, f, s,
    pin: [R * Math.sin(psi), R * Math.cos(psi), c.z] as [number, number, number],
    heat: stroke === 0 ? (1 - f) ** 1.5 : stroke === 3 ? 0.35 * f : stroke === 1 ? 0.25 * (1 - f) : 0.15 + 0.2 * f,
    intakeLift: stroke === 2 ? Math.sin(f * Math.PI) : 0,
    exhaustLift: stroke === 1 ? Math.sin(f * Math.PI) : 0,
  };
}

/** The cylinder that fired most recently: the one earliest in its cycle. */
export const lastFired = (theta: number) => CYLS.reduce((a, b) => (cylAt(b, theta).phase < cylAt(a, theta).phase ? b : a));
