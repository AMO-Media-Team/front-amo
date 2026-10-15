import {
  type Anunciante,
  anuncianteDemo,
  anunciantesAjenos,
  clienteDeLectura,
} from "./utilidades/datos-demo"
import {
  elegirPeriodoRapido,
  esperarSinDesbordeHorizontal,
  parametro,
} from "./utilidades/interfaz"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"

/**
 * Operación (medios, anunciantes, campañas y asignaciones) contra
 * `pnpm build && pnpm start` y los datos demo reales: listados con búsqueda y
 * filtros en la URL, y la ficha de cada tipo. Solo lectura.
 */

interface Listado {
  seccion: "medios" | "anunciantes" | "campanas" | "asignaciones"
  titulo: string
  /** Nombre de la región que envuelve la tabla (su `<caption>`). */
  tabla: string
  buscador: string
  filtro: { boton: string; opcion: string; clave: string; valor: string }
  /** Lo que identifica a la ficha de este tipo. */
  ficha: (page: Page) => Locator[]
}

const LISTADOS: readonly Listado[] = [
  {
    seccion: "medios",
    titulo: "Medios",
    tabla: "Medios de la red",
    buscador: "Buscar medio por nombre",
    filtro: {
      boton: "Estado",
      opcion: "Suspendido",
      clave: "estado",
      valor: "SUSPENDIDO",
    },
    ficha: (page) => [
      page.getByRole("region", { name: "Indicadores del medio" }),
      page.getByRole("tab", { name: /^Cuentas sociales/ }),
      page.getByRole("heading", { level: 2, name: "Perfil del medio" }),
    ],
  },
  {
    seccion: "anunciantes",
    titulo: "Anunciantes",
    tabla: "Anunciantes",
    buscador: "Buscar por nombre o NIT",
    filtro: {
      boton: "Verificación",
      opcion: "Suspendido",
      clave: "estado",
      valor: "SUSPENDIDO",
    },
    ficha: (page) => [
      page.getByRole("tab", { name: "Cartera" }),
      page.getByRole("heading", { level: 2, name: "Empresa" }),
      page.getByRole("heading", { level: 2, name: "Facturación" }),
    ],
  },
  {
    seccion: "campanas",
    titulo: "Campañas",
    tabla: "Campañas",
    buscador: "Buscar por campaña o marca",
    filtro: {
      boton: "Estado",
      opcion: "Finalizada",
      clave: "estado",
      valor: "FINALIZADA",
    },
    ficha: (page) => [
      page.getByRole("region", { name: "Indicadores de la campaña" }),
      page.getByRole("tab", { name: "Ofertas" }),
      page.getByRole("tab", { name: "Desempeño" }),
    ],
  },
  {
    seccion: "asignaciones",
    titulo: "Asignaciones",
    tabla: "Asignaciones",
    buscador: "Buscar medio, campaña o marca",
    filtro: {
      boton: "Plataforma",
      opcion: "TikTok",
      clave: "plataforma",
      valor: "TIKTOK",
    },
    ficha: (page) => [
      page.getByRole("region", { name: "Avance de la asignación" }),
      page.getByRole("heading", { level: 2, name: "Línea de tiempo" }),
    ],
  },
]

const TOTAL = /^1–\d+ de ([\d.]+)$/

/** Total de resultados que anuncia la paginación ("1–20 de 252" → 252). */
async function totalDe(page: Page): Promise<number> {
  const resumen = page
    .getByRole("navigation", { name: "Paginación de la tabla" })
    .getByText(TOTAL)
  await expect(resumen).toBeVisible()
  const total = (await resumen.innerText()).match(TOTAL)?.[1] ?? ""
  return Number(total.replaceAll(".", ""))
}

/** Enlace a la primera ficha del listado (fila en escritorio, tarjeta en móvil). */
function primeraFicha(page: Page, { seccion, tabla }: Listado): Locator {
  return page
    .getByRole("region", { name: tabla, exact: true })
    .locator(`a[href^="/operacion/${seccion}/"]`)
    .filter({ visible: true })
    .first()
}

test.describe("equipo interno", () => {
  test.use({ storageState: sesion("interno") })

  for (const listado of LISTADOS) {
    const { seccion, titulo, tabla, buscador, filtro, ficha } = listado

    test(`${titulo}: busca, filtra y abre una ficha`, async ({ page }) => {
      await page.goto(`/operacion/${seccion}`)
      await expect(
        page.getByRole("heading", { level: 1, name: titulo })
      ).toBeVisible()
      const todos = await totalDe(page)
      expect(todos).toBeGreaterThan(20)

      await test.step("el filtro queda en la URL y reduce el listado", async () => {
        const region = page.getByRole("region", { name: tabla, exact: true })
        await region
          .getByRole("button", { name: filtro.boton, exact: true })
          .first()
          .click()
        await page
          .getByRole("option", { name: filtro.opcion, exact: true })
          .click()
        await expect
          .poll(() => parametro(page, filtro.clave))
          .toBe(filtro.valor)
        await page.keyboard.press("Escape")
        await expect.poll(() => totalDe(page)).toBeLessThan(todos)
        await region.getByRole("button", { name: "Limpiar" }).click()
        await expect.poll(() => parametro(page, filtro.clave)).toBeNull()
        await expect.poll(() => totalDe(page)).toBe(todos)
      })

      const nombre = (await primeraFicha(page, listado).innerText()).trim()

      await test.step("la búsqueda queda en la URL y encuentra la fila", async () => {
        await page.getByRole("searchbox", { name: buscador }).fill(nombre)
        await expect.poll(() => parametro(page, "q")).toBe(nombre)
        await expect.poll(() => totalDe(page)).toBeLessThan(todos)
        await expect(primeraFicha(page, listado)).toHaveText(nombre)
        await esperarSinDesbordeHorizontal(page)
      })

      await test.step("la ficha muestra sus bloques y su ruta", async () => {
        await primeraFicha(page, listado).click()
        await expect(page).toHaveURL(
          new RegExp(`/operacion/${seccion}/[0-9a-f-]{36}$`)
        )
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        for (const bloque of ficha(page)) await expect(bloque).toBeVisible()
        const migas = page.getByRole("navigation", {
          name: "Ruta de navegación",
        })
        await expect(migas.getByRole("link", { name: titulo })).toBeVisible()
        await expect(migas).not.toContainText("Detalle")
        await esperarSinDesbordeHorizontal(page)
      })
    })
  }

  test("Asignaciones: el periodo y el grupo de estados filtran la vista", async ({
    page,
  }) => {
    await page.goto("/operacion/asignaciones")
    const todas = await totalDe(page)

    await elegirPeriodoRapido(page, "Últimos 30 días")
    await expect.poll(() => parametro(page, "periodo")).toBe("ultimos30")
    await expect(
      page.getByRole("button", { name: "Creadas en: Últimos 30 días" })
    ).toBeVisible()
    await expect.poll(() => totalDe(page)).toBeLessThan(todas)
    const delPeriodo = await totalDe(page)

    await page
      .getByRole("region", { name: "Asignaciones por grupo de estados" })
      .getByRole("button", { name: /^Cumplidas/ })
      .click()
    await expect.poll(() => parametro(page, "estado")).not.toBeNull()
    await expect.poll(() => totalDe(page)).toBeLessThan(delPeriodo)
  })
})

test.describe("anunciante", () => {
  test.use({ storageState: sesion("anunciante") })

  let propio: Anunciante
  let ajenos: Awaited<ReturnType<typeof anunciantesAjenos>>

  test.beforeAll(async () => {
    const servicio = clienteDeLectura()
    propio = await anuncianteDemo(servicio)
    ajenos = await anunciantesAjenos(servicio, propio)
  })

  test("no ve la operación ni los datos de otros anunciantes", async ({
    page,
  }) => {
    const [ajeno] = ajenos
    const rutas = [
      ...LISTADOS.map(({ seccion }) => `/operacion/${seccion}`),
      `/operacion/anunciantes/${ajeno.id}`,
      `/operacion/campanas/${ajeno.campanaId}`,
      // Ni siquiera su propia ficha: la operación es del equipo interno.
      `/operacion/anunciantes/${propio.id}`,
    ]
    for (const ruta of rutas) {
      await page.goto(ruta)
      await expect(
        page.getByRole("heading", {
          name: "No tienes permiso para ver esta sección",
        })
      ).toBeVisible()
      // Nada de otras empresas llegó en el HTML ni en el flujo RSC.
      const html = await page.content()
      for (const { nombre } of ajenos) {
        expect(html, `${ruta}: datos de ${nombre}`).not.toContain(nombre)
      }
    }
  })
})
