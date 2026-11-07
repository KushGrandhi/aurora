import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { Glass, Glow, Label, Metal, type Clock } from "aurora/kit";

export type Row = { region: string; revenue: number; units: number };
const COLORS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"];

// One bar: a glass column with a glowing fill that grows to its value. Height eases toward the target every frame,
// so when a filter changes the data the bars glide to their new size instead of jumping.
function Bar({ x, target, color, active, onPick, onHover }: { x: number; target: number; color: string; active: boolean; onPick(): void; onHover(on: boolean): void }) {
  const fill = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = fill.current!;
    const h = g.scale.y + (Math.max(0.02, target) - g.scale.y) * Math.min(1, dt * 4);
    g.scale.y = h;
    g.position.y = h / 2;
  });
  return (
    <group position-x={x} onClick={(e) => (e.stopPropagation(), onPick())}
      onPointerOver={(e) => (e.stopPropagation(), onHover(true))} onPointerOut={() => onHover(false)}>
      <mesh position-y={1.6}>
        <boxGeometry args={[0.8, 3.2, 0.8]} />
        <Glass opacity={active ? 0.2 : 0.08} />
      </mesh>
      <group ref={fill} scale-y={0.02}>
        <mesh castShadow>
          <boxGeometry args={[0.7, 1, 0.7]} />
          <Glow color={color} intensity={active ? 1 : 0.55} />
        </mesh>
      </group>
      <mesh position-y={-0.06}>
        <boxGeometry args={[0.9, 0.12, 0.9]} />
        <Metal tone="dark" />
      </mesh>
    </group>
  );
}

/** Revenue by region as glowing glass columns. Reads rows from the view's query, so filters reshape it live. */
export default function Bars({ rows, selected, onPick, onHover }: { rows: Row[]; selected: string | null; onPick(region: string): void; onHover(region: string | null): void; clock: Clock }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  const gap = 1.3;
  const x0 = -((rows.length - 1) * gap) / 2;
  return (
    <group position-y={-1.2}>
      <mesh position-y={-0.14} receiveShadow>
        <boxGeometry args={[rows.length * gap + 0.8, 0.08, 2.2]} />
        <Metal tone="aluminium" rough={0.5} />
      </mesh>
      {rows.map((r, i) => (
        <group key={r.region}>
          <Bar x={x0 + i * gap} target={(r.revenue / max) * 3} color={COLORS[i % COLORS.length]} active={selected === r.region} onPick={() => onPick(r.region)} onHover={(on) => onHover(on ? r.region : null)} />
          <Label at={[x0 + i * gap, (r.revenue / max) * 3 + 0.25, 0.45]}>{r.region}</Label>
        </group>
      ))}
    </group>
  );
}
