// Builds what sandboxed design frames load from aurora's /lib/: the importable libraries (one shared React),
// the frame runtime, Tailwind's browser build and the Inter font. Nothing comes from a CDN.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const require = createRequire(import.meta.url);
const ESM_ENTRIES = ["motion", "motion-react", "lucide-react", "three", "d3", "gsap"];
// CommonJS packages: `export *` would drop their named exports, so each entry re-exports them by name.
const CJS_ENTRIES: Record<string, string> = {
  react: "react",
  "react-dom": "react-dom",
  "react-dom-client": "react-dom/client",
  "jsx-runtime": "react/jsx-runtime",
  "jsx-dev-runtime": "react/jsx-dev-runtime",
};
const CJS_PREFIX = "aurora-cjs:";

function cjsEntries(): Plugin {
  return {
    name: "aurora-sandbox-cjs",
    resolveId(id) {
      const at = id.indexOf(CJS_PREFIX); // library mode hands entries over as absolute paths
      return at >= 0 ? "\0" + id.slice(at) : null;
    },
    load(id) {
      if (!id.startsWith("\0" + CJS_PREFIX)) return null;
      const pkg = id.slice(1 + CJS_PREFIX.length);
      const names = Object.keys(require(pkg)).filter((k) => k !== "default" && /^[A-Za-z_$][\w$]*$/.test(k));
      return `import m from ${JSON.stringify(pkg)};\nexport const { ${names.join(", ")} } = m;\nexport default m;\n`;
    },
  };
}

function copyStatic(): Plugin {
  let outDir = "";
  return {
    name: "aurora-sandbox-static",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    writeBundle() {
      copyFileSync(require.resolve("@tailwindcss/browser"), path.join(outDir, "tailwind.js"));
      const fontDir = path.dirname(require.resolve("@fontsource-variable/inter/index.css"));
      mkdirSync(path.join(outDir, "fonts", "files"), { recursive: true });
      const css = readFileSync(path.join(fontDir, "index.css"), "utf8");
      for (const [, f] of css.matchAll(/url\(\.\/(files\/[^)]+)\)/g)) copyFileSync(path.join(fontDir, f), path.join(outDir, "fonts", f));
      writeFileSync(path.join(outDir, "fonts", "inter.css"), css);
    },
  };
}

export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [cjsEntries(), copyStatic()],
  build: {
    outDir: "dist/lib",
    emptyOutDir: true,
    copyPublicDir: false,
    chunkSizeWarningLimit: 4000,
    lib: {
      formats: ["es"],
      entry: {
        ...Object.fromEntries(ESM_ENTRIES.map((e) => [e, `sandbox/${e}.ts`])),
        ...Object.fromEntries(Object.entries(CJS_ENTRIES).map(([name, pkg]) => [name, CJS_PREFIX + pkg])),
        runtime: "sandbox/frameRuntime.ts",
      },
    },
    rollupOptions: { output: { entryFileNames: "[name].js", chunkFileNames: "chunks/[name]-[hash].js" } },
  },
});
