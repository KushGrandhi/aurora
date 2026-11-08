// The story's moments as keyframes: where the moon is at each step. The scene interpolates between them with the
// reader's scroll position, so the moon glides from one moment to the next instead of jumping.
export type Key = { angle: number; tilt: number; shadow: number };

// angle: the moon's place on its orbit around the earth (radians, 0 = on the far side from the sun).
// tilt: how far above the sun-earth line it passes (its orbit is tilted about 5°). shadow: how much of its shadow reaches us.
export const KEYS: Key[] = [
  { angle: Math.PI * 0.5, tilt: 0, shadow: 0 },    // 0: the moon circles us
  { angle: Math.PI * 0.92, tilt: 0.9, shadow: 0 }, // 1: a new moon passes above the sun
  { angle: Math.PI * 0.96, tilt: 0.35, shadow: 0 },// 2: the paths begin to cross
  { angle: Math.PI, tilt: 0, shadow: 1 },          // 3: totality, the shadow touches the earth
];

export const STEPS = ["The moon circles us", "New moon, off the line", "The paths cross", "Totality"];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

/** The moon's keyframe at a story position (1.4 = 40% of the way from step 1 to step 2). */
export function at(position: number): Key {
  const p = Math.max(0, Math.min(KEYS.length - 1, position));
  const i = Math.min(KEYS.length - 2, Math.floor(p));
  const t = ease(p - i);
  const a = KEYS[i], b = KEYS[i + 1];
  return { angle: lerp(a.angle, b.angle, t), tilt: lerp(a.tilt, b.tilt, t), shadow: lerp(a.shadow, b.shadow, t) };
}
