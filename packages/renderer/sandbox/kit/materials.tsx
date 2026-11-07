import { useMemo } from "react";
import { Color, DoubleSide } from "three";
import { useToken } from "./tokens.ts";

// Physical base colours: metal and glass look the same in both themes, like real materials do.
const TONES = {
  steel: [0.72, 0.73, 0.76, 0.22],
  dark: [0.17, 0.17, 0.19, 0.45],
  brass: [0.8, 0.62, 0.32, 0.3],
  aluminium: [0.88, 0.88, 0.9, 0.28],
} as const;

/** Polished metal. Use as a mesh child: `<mesh><cylinderGeometry /><Metal tone="steel" /></mesh>`. */
export function Metal({ tone = "steel", rough }: { tone?: keyof typeof TONES; rough?: number }) {
  const [r, g, b, roughness] = TONES[tone];
  const color = useMemo(() => new Color(r, g, b), [r, g, b]);
  return <meshStandardMaterial color={color} metalness={1} roughness={rough ?? roughness} envMapIntensity={1.15} />;
}

/** Clear glass: shows what is inside a part (a cylinder wall, a chamber, a casing). */
export function Glass({ opacity = 0.12 }: { opacity?: number }) {
  return <meshPhysicalMaterial color="white" transparent opacity={opacity} roughness={0.05} metalness={0} clearcoat={1} depthWrite={false} side={DoubleSide} />;
}

/**
 * A glowing, see-through fill for things that are hot, live or flowing: burning gas, current, fluid. `color` is a token
 * name (`--bad`, `--s1`…); `intensity` 0..1 sets how bright and dense it looks.
 */
export function Glow({ color = "--warn", intensity = 1 }: { color?: string; intensity?: number }) {
  const c = useToken(color);
  const k = Math.max(0, Math.min(1, intensity));
  return <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.3 + 2.2 * k} transparent opacity={0.18 + 0.6 * k} depthWrite={false} toneMapped={false} />;
}

/** Glossy painted surface in a token colour (default `--accent`): covers, housings, the one part to look at. */
export function Paint({ color = "--accent" }: { color?: string }) {
  const c = useToken(color);
  return <meshPhysicalMaterial color={c} metalness={0.2} roughness={0.32} clearcoat={1} clearcoatRoughness={0.15} />;
}
