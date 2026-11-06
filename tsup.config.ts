import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    login: "src/cli/login.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: ["better-sqlite3"],
  target: "node20",
  splitting: false,
});
