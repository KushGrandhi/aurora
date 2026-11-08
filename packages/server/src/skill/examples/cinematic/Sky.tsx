import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import { Glow, Label, useScroll, useToken } from "aurora/kit";
import { at } from "./model";

const SUN: [number, number, number] = [-4.6, 0, 0];
const EARTH: [number, number, number] = [3, 0, 0];
const ORBIT = 1.8;
// Where the moon's shadow lands: on the earth's face toward the sun, turned a little toward the camera so it shows.
const SPOT: [number, number, number] = [EARTH[0] - 0.62, 0, 0.4];

/** Sun, earth and moon. Every frame the moon's place comes from the scroll position, eased by the kit. */
export default function Sky() {
  const s = useScroll(); // a live value: read it inside useFrame, never as React state
  const moon = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const earthColor = useToken("--s2");
  const moonColor = useToken("--muted");
  useFrame(() => {
    const k = at(s.position);
    if (moon.current) moon.current.position.set(EARTH[0] + Math.cos(k.angle) * ORBIT, k.tilt, Math.sin(k.angle) * ORBIT);
    if (shadow.current) {
      (shadow.current.material as MeshStandardMaterial).opacity = 0.85 * k.shadow;
      shadow.current.visible = k.shadow > 0.01;
    }
  });
  return (
    <group>
      <mesh position={SUN}><sphereGeometry args={[1.5, 64, 64]} /><Glow color="--accent" intensity={1} /></mesh>
      <mesh position={SUN}><sphereGeometry args={[2.3, 48, 48]} /><Glow color="--accent" intensity={0.12} /></mesh>
      <pointLight position={SUN} intensity={60} distance={30} />
      <mesh position={EARTH} castShadow receiveShadow><sphereGeometry args={[0.75, 64, 64]} /><meshStandardMaterial color={earthColor} roughness={0.7} /></mesh>
      {/* the umbra: a dark patch where the moon's shadow lands */}
      <mesh ref={shadow} position={SPOT}><sphereGeometry args={[0.2, 32, 32]} /><meshStandardMaterial color="#000" transparent opacity={0} /></mesh>
      <group ref={moon}><mesh castShadow><sphereGeometry args={[0.22, 48, 48]} /><meshStandardMaterial color={moonColor} roughness={0.9} /></mesh></group>
      <Label at={[SUN[0] + 1.2, 1.5, 0]} side="right">the sun</Label>
      <Label at={[EARTH[0] + 0.5, -0.9, 0]} side="right">the earth</Label>
    </group>
  );
}
