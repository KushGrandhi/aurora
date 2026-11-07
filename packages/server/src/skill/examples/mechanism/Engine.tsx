import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import { Glass, Glow, Grab, Label, Metal, Paint, type Clock } from "aurora/kit";
import { BORE, CYLS, HEAD, L, LINER_BOTTOM, OFFSET, PIN_UP, PISTON_H, R, SPACING, STROKES, cylAt, rad, type Cyl } from "./model";

const UP = new Vector3(0, 1, 0), pin = new Vector3(), wrist = new Vector3();
const LINER_H = HEAD - LINER_BOTTOM;

// One cylinder: a glass bore with the piston, the gas and the valves inside, leaning with its bank.
// Motion is set every frame from clock.ref (smooth); colours follow clock.t (React state, 20 times a second).
function Cylinder({ c, clock, selected }: { c: Cyl; clock: Clock; selected: boolean }) {
  const piston = useRef<Group>(null), gas = useRef<Group>(null), rod = useRef<Group>(null);
  const intake = useRef<Group>(null), exhaust = useRef<Group>(null);
  useFrame(() => {
    const st = cylAt(c, clock.ref.current);
    const top = st.s + PIN_UP + PISTON_H / 2;
    piston.current!.position.y = st.s + PIN_UP;
    gas.current!.position.y = (top + HEAD) / 2;
    gas.current!.scale.y = Math.max(0.001, HEAD - top);
    intake.current!.position.y = HEAD - 0.04 - st.intakeLift * 0.14;
    exhaust.current!.position.y = HEAD - 0.04 - st.exhaustLift * 0.14;
    // the rod runs from the crank pin to the wrist pin, always exactly L long
    pin.set(...st.pin);
    wrist.set(Math.sin(rad(c.beta)) * st.s, Math.cos(rad(c.beta)) * st.s, c.z);
    rod.current!.position.copy(pin).add(wrist).multiplyScalar(0.5);
    rod.current!.quaternion.setFromUnitVectors(UP, wrist.sub(pin).normalize());
  });
  const st = cylAt(c, clock.t);
  return (
    <>
      <group rotation-z={-rad(c.beta)} position-z={c.z}>
        <mesh position-y={LINER_BOTTOM + LINER_H / 2}>
          <cylinderGeometry args={[BORE + 0.03, BORE + 0.03, LINER_H, 48, 1, true]} />
          <Glass opacity={selected ? 0.24 : 0.1} />
        </mesh>
        <group ref={gas}>
          <mesh>
            <cylinderGeometry args={[BORE - 0.01, BORE - 0.01, 1, 48]} />
            <Glow color={STROKES[st.stroke].color} intensity={st.heat} />
          </mesh>
        </group>
        <group ref={piston}>
          <mesh castShadow>
            <cylinderGeometry args={[BORE - 0.01, BORE - 0.01, PISTON_H, 48]} />
            <Metal tone="aluminium" />
          </mesh>
        </group>
        {[[intake, -0.17], [exhaust, 0.17]].map(([ref, z]) => (
          <group key={z as number} ref={ref as React.RefObject<Group>} position-z={z as number}>
            <mesh><cylinderGeometry args={[0.11, 0.08, 0.04, 32]} /><Metal /></mesh>
            <mesh position-y={0.25}><cylinderGeometry args={[0.02, 0.02, 0.5, 8]} /><Metal /></mesh>
          </group>
        ))}
        <mesh position-y={HEAD + 0.1}><cylinderGeometry args={[0.04, 0.04, 0.3, 12]} /><Metal tone="brass" /></mesh>
      </group>
      <group ref={rod}>
        <mesh castShadow><capsuleGeometry args={[0.07, L - 0.2, 6, 16]} /><Metal tone="dark" /></mesh>
      </group>
    </>
  );
}

// The crankshaft turns as one piece: main shaft, four throws 90° apart, webs, flywheel at the back, pulley at the front.
function Crank({ clock }: { clock: Clock }) {
  const crank = useRef<Group>(null);
  useFrame(() => void (crank.current!.rotation.z = -rad(clock.ref.current)));
  const span = 4 * SPACING + 0.8;
  return (
    <group ref={crank}>
      <mesh rotation-x={Math.PI / 2} castShadow><cylinderGeometry args={[0.2, 0.2, span, 32]} /><Metal /></mesh>
      {[0, 90, 270, 180].map((phi, k) => {
        const z = (k - 1.5) * SPACING;
        return (
          <group key={k} rotation-z={-rad(phi)}>
            <mesh position={[0, R, z]} rotation-x={Math.PI / 2} castShadow><cylinderGeometry args={[0.17, 0.17, 2 * OFFSET + 0.36, 32]} /><Metal /></mesh>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[0, R / 2 - 0.1, z + side * (OFFSET + 0.24)]} castShadow>
                <boxGeometry args={[0.5, R + 0.75, 0.12]} />
                <Metal tone="dark" />
              </mesh>
            ))}
          </group>
        );
      })}
      <mesh position-z={span / 2 + 0.05} rotation-x={Math.PI / 2} castShadow><cylinderGeometry args={[1.35, 1.35, 0.14, 96]} /><Metal /></mesh>
      <mesh position-z={-span / 2 - 0.05} rotation-x={Math.PI / 2} castShadow><cylinderGeometry args={[0.55, 0.55, 0.22, 64]} /><Metal tone="dark" /></mesh>
    </group>
  );
}

const along = (beta: number, d: number, z: number): [number, number, number] => [Math.sin(rad(beta)) * d, Math.cos(rad(beta)) * d, z];

export default function Engine({ clock, selected }: { clock: Clock; selected: number | null }) {
  return (
    <group>
      {/* Take hold of the crank and turn it: the whole engine follows your hand. */}
      <Grab clock={clock} rate={1.5}><Crank clock={clock} /></Grab>
      {CYLS.map((c) => <Cylinder key={c.n} c={c} clock={clock} selected={selected === c.n} />)}
      {[-1, 1].map((bank) => (
        <group key={bank} rotation-z={-rad(bank * 45)} position-z={bank * OFFSET}>
          {/* see-through head so the chambers stay visible from above; one painted cover as the accent */}
          <mesh position-y={HEAD + 0.15}><boxGeometry args={[BORE * 2.6, 0.26, 4 * SPACING + 0.4]} /><Glass opacity={0.22} /></mesh>
          <mesh position={[BORE * 0.9, HEAD + 0.34, 0]} scale={[0.7, 0.35, 1]} rotation-x={Math.PI / 2}><capsuleGeometry args={[0.24, 4 * SPACING - 0.2, 8, 24]} /><Paint /></mesh>
        </group>
      ))}
      <Label at={along(-45, HEAD + 0.55, -1.7)} side="left">cylinder head</Label>
      <Label at={along(45, R + L * 0.55, -1.3)}>connecting rod</Label>
      <Label at={along(45, HEAD - 0.5, 1.7)}>glass bore: piston and burning gas inside</Label>
      <Label at={[0, -1.1, 2.55]}>flywheel</Label>
      <Label at={[-0.5, -0.4, -1.6]} side="left">crankshaft</Label>
    </group>
  );
}
