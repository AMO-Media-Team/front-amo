import { defineConfig, devices } from "@playwright/test"

import {
  exigirFueraDeProduccion,
  supabaseUrlDe,
} from "./scripts/bootstrap/produccion"
import {
  PROYECTO_ALTA_MEDIO,
  PROYECTO_ANUNCIANTE,
  PROYECTO_CHROME_ANDROID,
  PROYECTO_CIERRE,
  PROYECTO_ESCRITORIO,
  PROYECTO_FINANZAS,
  PROYECTO_FIREFOX,
  PROYECTO_MOVIL,
  PROYECTO_PAUTA_MEDIO,
  PROYECTO_PREPARACION,
  PROYECTO_SAFARI,
  PROYECTO_SAFARI_IOS,
  PROYECTO_TABLET,
  PROYECTO_VALIDACION,
  SPECS_ALTA_MEDIO,
  SPECS_ANUNCIANTE,
  SPECS_CIERRE,
  SPECS_FINANZAS,
  SPECS_MATRIZ,
  SPECS_PAUTA_MEDIO,
  SPECS_VALIDACION,
} from "./e2e/utilidades/proyectos"

/**
 * Puerto del servidor de pruebas. Con `AMO_E2E_PUERTO` la suite levanta su
 * build de producción en otro puerto y no toca lo que ya escuche en el 3000:
 * Playwright reutilizaría un `next dev` en uso, que no es lo que se prueba.
 * Las pruebas del mapa necesitan que el token de Mapbox admita ese origen.
 */
const PUERTO = Number(process.env.AMO_E2E_PUERTO ?? 3000)

// Antes de compilar la app: la suite crea usuarios, roles y bitácora.
exigirFueraDeProduccion(supabaseUrlDe(), "La suite E2E")
const URL_BASE = `http://localhost:${PUERTO}`

// SwiftShader permite renderizar WebGL (Mapbox) en navegadores headless sin GPU.
const OPCIONES_LANZAMIENTO = {
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
}

/**
 * Matriz de navegadores (RNF-COM-01): solo lectura (humo, navegación, inicio y
 * mapa) en Firefox, Safari de escritorio, Safari de iOS y Chrome para Android.
 * Corre con `pnpm test:e2e:navegadores` (AMO_E2E_NAVEGADORES=1), aparte de la
 * suite completa.
 */
const MATRIZ_NAVEGADORES = process.env.AMO_E2E_NAVEGADORES
  ? [
      {
        name: PROYECTO_FIREFOX,
        dependencies: [PROYECTO_PREPARACION],
        testMatch: SPECS_MATRIZ,
        use: {
          ...devices["Desktop Firefox"],
          viewport: { width: 1440, height: 900 },
        },
      },
      {
        name: PROYECTO_SAFARI,
        dependencies: [PROYECTO_PREPARACION],
        testMatch: SPECS_MATRIZ,
        use: {
          ...devices["Desktop Safari"],
          viewport: { width: 1440, height: 900 },
        },
      },
      {
        name: PROYECTO_SAFARI_IOS,
        dependencies: [PROYECTO_PREPARACION],
        testMatch: SPECS_MATRIZ,
        use: { ...devices["iPhone 13"] },
      },
      {
        name: PROYECTO_CHROME_ANDROID,
        dependencies: [PROYECTO_PREPARACION],
        testMatch: SPECS_MATRIZ,
        use: { ...devices["Pixel 7"], launchOptions: OPCIONES_LANZAMIENTO },
      },
    ]
  : []

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
      // Las pruebas que escriben del alta del medio, en serie (comparten «Medio
      // Nuevo E2E»); sus pruebas de solo lectura corren también en los demás.
      name: PROYECTO_ALTA_MEDIO,
      dependencies: [PROYECTO_PREPARACION],
      testMatch: SPECS_ALTA_MEDIO,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: OPCIONES_LANZAMIENTO,
      },
    },
    {
      // Las pruebas que escriben del portal del anunciante, en serie (comparten
      // las cuentas y la empresa de prueba).
      name: PROYECTO_ANUNCIANTE,
      dependencies: [PROYECTO_PREPARACION],
      testMatch: SPECS_ANUNCIANTE,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: OPCIONES_LANZAMIENTO,
      },
    },
    {
      // La pauta del medio (aceptar, publicar, métricas), en serie: comparte
      // «Medio E2E» y las ofertas de las fábricas. A 390 px, como se usa.
      name: PROYECTO_PAUTA_MEDIO,
      dependencies: [PROYECTO_PREPARACION],
      testMatch: SPECS_PAUTA_MEDIO,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        launchOptions: OPCIONES_LANZAMIENTO,
      },
    },
    {
      // El equipo AMO (validación, verificación, disputas, suspensión), en
      // serie y después de la pauta del medio y del anunciante: usa asignaciones
      // del mismo «Medio E2E».
      name: PROYECTO_VALIDACION,
      dependencies: [
        PROYECTO_PREPARACION,
        PROYECTO_PAUTA_MEDIO,
        PROYECTO_ANUNCIANTE,
      ],
      testMatch: SPECS_VALIDACION,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: OPCIONES_LANZAMIENTO,
      },
    },
    {
      // Finanzas (liquidaciones, documento soporte, pagos, facturas) y lo que ven
      // el medio y el anunciante, en serie y al final: los cortes por periodo no
      // admiten traslapes y las fábricas comparten la campaña de la fase.
      name: PROYECTO_FINANZAS,
      dependencies: [
        PROYECTO_PREPARACION,
        PROYECTO_PAUTA_MEDIO,
        PROYECTO_ANUNCIANTE,
        PROYECTO_VALIDACION,
      ],
      testMatch: SPECS_FINANZAS,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions: OPCIONES_LANZAMIENTO,
      },
    },
    {
      // Cierre de la Entrega 3 (gestión asistida, privacidad, reputación, aviso
      // en vivo), en serie y al final: usan las cuentas y campañas de las fases
      // anteriores y cuentas desechables propias.
      name: PROYECTO_CIERRE,
      dependencies: [
        PROYECTO_PREPARACION,
        PROYECTO_PAUTA_MEDIO,
        PROYECTO_ANUNCIANTE,
        PROYECTO_VALIDACION,
        PROYECTO_FINANZAS,
      ],
      testMatch: SPECS_CIERRE,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
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
    ...MATRIZ_NAVEGADORES,
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
