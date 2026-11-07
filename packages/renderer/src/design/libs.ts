/** Bare imports a design may use → the file under aurora's /lib/ that provides it (built by vite.sandbox.config.ts). */
export const IMPORT_MAP: Record<string, string> = {
  react: "react.js",
  "react-dom": "react-dom.js",
  "react-dom/client": "react-dom-client.js",
  "react/jsx-runtime": "jsx-runtime.js",
  "react/jsx-dev-runtime": "jsx-dev-runtime.js",
  motion: "motion.js",
  "motion/react": "motion-react.js",
  "framer-motion": "motion-react.js",
  "lucide-react": "lucide-react.js",
  three: "three.js",
  d3: "d3.js",
  gsap: "gsap.js",
  "@react-three/fiber": "r3f.js",
  "@react-three/drei": "drei.js",
  "aurora/kit": "kit.js",
};
