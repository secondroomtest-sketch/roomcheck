import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Project root = folder `kost-app`. Tanpa ini, Turbopack bisa resolve CSS dari
 * `.../SecondRoomV2` dan gagal mencari `tailwindcss` → dev hang/error.
 */
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));
const nodeModulesRoot = path.join(turbopackRoot, "node_modules");

const nextConfig: NextConfig = {
  turbopack: {
    root: turbopackRoot,
    resolveAlias: {
      tailwindcss: path.join(nodeModulesRoot, "tailwindcss"),
      "@tailwindcss/postcss": path.join(nodeModulesRoot, "@tailwindcss", "postcss"),
    },
  },
};

export default nextConfig;
