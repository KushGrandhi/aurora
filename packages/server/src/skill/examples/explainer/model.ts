// The mechanism as pure functions of one number (the crank angle). The drawing and the panel only read from here.
export const CX = 190, CY = 345, R = 42, L = 120; // crank centre, crank radius, rod length
export const HEAD = 120; // y of the cylinder head
export const PISTON_H = 44;

export const STAGES = [
  { name: "Intake", color: "var(--s1)", text: "The piston moves down and the intake valve opens. Air and a fine mist of fuel are drawn in." },
  { name: "Compression", color: "var(--s4)", text: "Both valves close. The piston rises and squeezes the mixture into a much smaller space." },
  { name: "Power", color: "var(--bad)", text: "The spark plug fires. The burning gas expands and drives the piston down. Only this stroke makes power." },
  { name: "Exhaust", color: "var(--muted)", text: "The exhaust valve opens and the rising piston pushes the burnt gas out." },
];

export const CYCLE = 720; // degrees in one full cycle (two crank turns)

export function engineAt(raw: number) {
  const deg = ((raw % CYCLE) + CYCLE) % CYCLE || 0; // always 0..720, never NaN or negative
  const rad = (deg * Math.PI) / 180;
  const pinX = CX + R * Math.sin(rad);
  const pinY = CY - R * Math.cos(rad);
  const wristY = CY - (R * Math.cos(rad) + Math.sqrt(L * L - (R * Math.sin(rad)) ** 2));
  const stage = Math.min(3, Math.floor(deg / 180));
  const p = (deg % 180) / 180; // progress through the current stage, 0..1
  return {
    deg, rad, pinX, pinY, wristY, stage, p,
    top: wristY - PISTON_H / 2,
    intakeLift: stage === 0 ? Math.sin(p * Math.PI) * 14 : 0,
    exhaustLift: stage === 3 ? Math.sin(p * Math.PI) * 14 : 0,
    spark: deg >= 350 && deg <= 388,
  };
}
