import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  // Vite 8 resuelve los alias de tsconfig (`@/*`) de forma nativa; sustituye a
  // `vite-tsconfig-paths`, que ahora solo emite un aviso de obsolescencia.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    // Vercel ejecuta en UTC: los tests también, para detectar fugas de zona horaria.
    env: { TZ: "UTC" },
    css: false,
  },
})
