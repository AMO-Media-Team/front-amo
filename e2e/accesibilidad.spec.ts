import AxeBuilder from "@axe-core/playwright"

import { fijarTema, type Tema } from "./utilidades/interfaz"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { type NombreSesion, sesion } from "./utilidades/sesiones"

/**
 * Accesibilidad automática (axe-core, WCAG 2.2 AA) de las páginas clave en
 * los dos temas y en los tres tamaños de pantalla. Complementa, no sustituye,
 * la revisión con teclado y lector de pantalla.
 */

const NORMAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]
/** El oscuro es el tema de AMO mientras el navegador no elija otro. */
const TEMA_PREDETERMINADO: Tema = "dark"
const TEMA_ALTERNO: Tema = "light"

/** El lienzo WebGL y los controles de Mapbox no son de AMO. */
const AJENOS = [".mapboxgl-canvas-container", ".mapboxgl-control-container"]

interface Pagina {
  ruta: string
  /** Lo último que la página termina de pintar (llega en streaming). */
  lista: (page: Page) => Locator
}

const paginacion = (page: Page) =>
  page.getByRole("navigation", { name: "Paginación de la tabla" })
const region = (nombre: string) => (page: Page) =>
  page.getByRole("region", { name: nombre, exact: true })

const PAGINAS: Readonly<Record<NombreSesion | "publico", readonly Pagina[]>> = {
  publico: [
    {
      ruta: "/ingresar",
      lista: (page) => page.getByRole("button", { name: "Ingresar" }),
    },
    {
      ruta: "/recuperar",
      lista: (page) => page.getByRole("heading", { level: 1 }),
    },
  ],
  interno: [
    { ruta: "/inicio", lista: region("Actividad reciente") },
    {
      ruta: "/analitica/mapa",
      lista: (page) =>
        page.getByRole("status").filter({ hasText: /con datos\.$/ }),
    },
    { ruta: "/reportes", lista: region("Seguridad") },
    { ruta: "/reportes/finanzas", lista: paginacion },
    { ruta: "/operacion/medios", lista: paginacion },
    { ruta: "/operacion/asignaciones", lista: paginacion },
    { ruta: "/administracion/usuarios", lista: paginacion },
    { ruta: "/administracion/roles", lista: region("Resumen de roles") },
    { ruta: "/administracion/auditoria", lista: paginacion },
    {
      ruta: "/administracion/configuracion",
      lista: region("Comisiones de excepción"),
    },
  ],
  anunciante: [{ ruta: "/inicio", lista: region("Cobertura territorial") }],
  medio: [{ ruta: "/inicio", lista: region("Tu reputación") }],
}

async function infracciones(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(NORMAS)
    .exclude(AJENOS)
    .analyze()
  return violations.map(
    ({ id, impact, help, nodes }) =>
      `${id} (${impact}): ${help} → ${nodes.map((nodo) => nodo.target.join(" ")).join(" | ")}`
  )
}

async function revisarTema(
  page: Page,
  { ruta, lista }: Pagina,
  tema: Tema
): Promise<void> {
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${tema}\\b`))
  await expect(lista(page)).toBeVisible()
  expect(await infracciones(page), `${ruta} (${tema})`).toEqual([])
}

function revisar(paginas: readonly Pagina[]): void {
  for (const pagina of paginas) {
    test(`${pagina.ruta} cumple WCAG 2.2 AA en tema oscuro y claro`, async ({
      page,
    }) => {
      // Una carga por tema: abandonar una página a medio pintar no cancela sus
      // consultas, que seguirían compitiendo con las de la siguiente.
      await page.goto(pagina.ruta)
      await revisarTema(page, pagina, TEMA_PREDETERMINADO)
      await fijarTema(page, TEMA_ALTERNO)
      await revisarTema(page, pagina, TEMA_ALTERNO)
    })
  }
}

// Sin animaciones de entrada: a medio aparecer, un texto aún translúcido
// daría un contraste falso.
test.use({ contextOptions: { reducedMotion: "reduce" } })

test.describe("sin sesión", () => {
  revisar(PAGINAS.publico)
})

for (const nombre of ["interno", "anunciante", "medio"] as const) {
  test.describe(`sesión de ${nombre}`, () => {
    test.use({ storageState: sesion(nombre) })
    revisar(PAGINAS[nombre])
  })
}
