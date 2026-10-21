import { defineConfig, devices } from "@playwright/test"

import {
  PROYECTO_ESCRITORIO,
  PROYECTO_MOVIL,
  PROYECTO_PREPARACION,
  PROYECTO_TABLET,
} from "./e2e/utilidades/proyectos"

/**
 * Puerto del servidor de pruebas. Con `AMO_E2E_PUERTO` la suite levanta su
 * build de producción en otro puerto y no toca lo que ya escuche en el 3000:
 * Playwright reutilizaría un `next dev` en uso, que no es lo que se prueba.
 * Las pruebas del mapa necesitan que el token de Mapbox admita ese origen.
 */
const PUERTO = Number(process.env.AMO_E2E_PUERTO ?? 3000)
const URL_BASE = `http://localhost:${PUERTO}`

// SwiftShader permite renderizar WebGL (Mapbox) en navegadores headless sin GPU.
const OPCIONES_LANZAMIENTO = {
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
}

export default defineConfig({
  testDir: "./e2e",
  // Todos los proyectos comparten un Supabase remoto pequeño con
  // `statement_timeout` de 8 s, y un panel de Inicio lanza una docena de
  // consultas analíticas. Con tres navegadores a la vez sobre paneles y
  // reportes llegan a cancelarse (57014) y los bloques muestran su aviso de
  // error: dos archivos en paralelo y, dentro de cada uno, una prueba tras otra.
  fullyParallel: false,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // El backend es el proyecto Supabase real: un ingreso, un panel o un reporte
  // encadenan varias consultas remotas y, con los proyectos en paralelo, pasan
  // de los 5 s (expect) y 30 s (prueba) que Playwright da por defecto.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: URL_BASE,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    colorScheme: "dark",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      // Abre las sesiones compartidas una sola vez (e2e/preparacion.setup.ts).
      name: PROYECTO_PREPARACION,
      testMatch: /.*\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: OPCIONES_LANZAMIENTO,
      },
    },
    {
      name: PROYECTO_ESCRITORIO,
      dependencies: [PROYECTO_PREPARACION],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: OPCIONES_LANZAMIENTO,
      },
    },
    {
      name: PROYECTO_TABLET,
      dependencies: [PROYECTO_PREPARACION],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 834, height: 1112 },
        hasTouch: true,
        launchOptions: OPCIONES_LANZAMIENTO,
      },
    },
    {
      name: PROYECTO_MOVIL,
      dependencies: [PROYECTO_PREPARACION],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
        launchOptions: OPCIONES_LANZAMIENTO,
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PUERTO}`,
    // robots.txt siempre responde 200; "/" redirige y depende de la sesión.
    url: `${URL_BASE}/robots.txt`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
  },
})
