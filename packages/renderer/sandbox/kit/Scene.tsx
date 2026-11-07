import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { BackSide, Box3, type Group } from "three";

type Vec3 = [number, number, number];
export type SceneProps = { children: ReactNode; camera?: Vec3; target?: Vec3; autoRotate?: boolean; shadows?: boolean; className?: string };

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function Fallback() {
  return (
    <div data-kit-fallback className="grid h-full min-h-40 w-full place-items-center rounded-2xl bg-surface p-6 text-center text-sm text-muted ring-1 ring-hair">
      3D needs WebGL, which this browser has turned off.
    </div>
  );
}

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}

/** A soft studio built from light panels: metal and glass need something to reflect, and nothing is downloaded. */
function Studio() {
  return (
    <Environment resolution={256}>
      {/* a soft grey room behind the light panels, so metal never reflects pure black */}
      <mesh scale={40}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshBasicMaterial color={[0.22, 0.22, 0.24]} side={BackSide} />
      </mesh>
      <Lightformer form="rect" intensity={4} position={[0, 6, 1]} rotation-x={Math.PI / 2} scale={[12, 4, 1]} />
      <Lightformer form="rect" intensity={2} position={[-7, 2, 2]} rotation-y={Math.PI / 2} scale={[4, 10, 1]} />
      <Lightformer form="rect" intensity={1.6} position={[7, 2, -2]} rotation-y={-Math.PI / 2} scale={[4, 10, 1]} />
      <Lightformer form="rect" intensity={1} position={[0, 1, 9]} scale={[10, 3, 1]} />
    </Environment>
  );
}

/** Measures the scene once it has drawn and lays the soft contact shadow just under its lowest point. */
function Floor({ of }: { of: React.RefObject<Group> }) {
  const [y, setY] = useState<number>();
  const frames = useRef(0);
  useFrame(() => {
    if (y !== undefined || !of.current || ++frames.current < 3) return;
    const box = new Box3().setFromObject(of.current);
    setY(Number.isFinite(box.min.y) ? box.min.y - 0.02 : 0);
  });
  return y === undefined ? null : <ContactShadows position={[0, y, 0]} opacity={0.4} scale={24} blur={2.6} far={12} resolution={512} />;
}

function Controls({ target, autoRotate }: { target: Vec3; autoRotate: boolean }) {
  const [spin, setSpin] = useState(autoRotate);
  const timer = useRef<number>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <OrbitControls
      makeDefault
      target={target}
      enableDamping
      dampingFactor={0.08}
      autoRotate={spin}
      autoRotateSpeed={0.6}
      minDistance={2}
      maxDistance={60}
      onStart={() => (clearTimeout(timer.current), setSpin(false))}
      onEnd={() => autoRotate && (timer.current = window.setTimeout(() => setSpin(true), 3000))}
    />
  );
}

/**
 * A lit, shadowed, orbitable 3D stage with aurora's look and no setup: studio reflections, a soft key light, a contact
 * shadow under whatever you put inside, and drag-to-turn. It fills its parent, so give the parent a height.
 */
export function Scene({ children, camera = [6, 4, 8], target = [0, 0, 0], autoRotate = true, shadows = true, className = "" }: SceneProps) {
  const [ok] = useState(hasWebGL);
  const group = useRef<Group>(null);
  if (!ok) return <Fallback />;
  return (
    <div data-kit-scene className={`relative h-full w-full ${className}`}>
      <Guard>
        <Canvas shadows={shadows} dpr={[1, 2]} camera={{ position: camera, fov: 35 }} gl={{ antialias: true, alpha: true }} style={{ touchAction: "none" }}>
          <Studio />
          <ambientLight intensity={0.25} />
          <directionalLight castShadow={shadows} position={[5, 9, 6]} intensity={1.5} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}>
            <orthographicCamera attach="shadow-camera" args={[-8, 8, 8, -8, 0.5, 40]} />
          </directionalLight>
          <group ref={group}>{children}</group>
          {shadows && <Floor of={group} />}
          <Controls target={target} autoRotate={autoRotate} />
        </Canvas>
      </Guard>
    </div>
  );
}
