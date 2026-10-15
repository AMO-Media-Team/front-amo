import { esperarSinDesbordeHorizontal, parametro } from "./utilidades/interfaz"
import {
  expect,
  type Locator,
  type Page,
  respuestaConEstado,
  test,
} from "./utilidades/prueba"
import {
  esTactil,
  PROYECTO_ESCRITORIO,
  PROYECTO_MOVIL,
} from "./utilidades/proyectos"
import { sesion } from "./utilidades/sesiones"

/**
 * Explorador geográfico contra `pnpm build && pnpm start`, con los datos demo
 * reales de `GET /api/geo/metricas` (300 medios en 33 departamentos) y Mapbox
 * dibujado con SwiftShader. La autorización de la API la cubre `route.test.ts`.
 *
 * En escritorio el ranking y el detalle son paneles fijos; en tablet y móvil
 * (táctiles) el ranking se abre con un botón y ambos son hojas inferiores.
 */

const RUTA = "/analitica/mapa"
const API = "**/api/geo/metricas?**"
const CLAVE_COACHMARK = "amo.mapa.coachmark.v1"

function ranking(page: Page): Locator {
  return page.getByRole("list", { name: /^Ranking por/ }).last()
}

function filaRanking(page: Page, nombre: string): Locator {
  return ranking(page).getByRole("button", {
    name: new RegExp(`^\\d+ ${nombre} `),
  })
}

/** Panel lateral (escritorio) u hoja inferior (táctil) con el detalle de la zona. */
function detalleDe(page: Page, zona: string): Locator {
  return page
    .getByRole("complementary", { name: zona, exact: true })
    .or(page.getByRole("dialog", { name: zona, exact: true }))
}

/** Posición actual en las migas del mapa ("Mundo › Colombia › Antioquia"). */
function nivelActual(page: Page): Locator {
  return page
    .getByRole("navigation", { name: "Nivel del mapa" })
    .first()
    .getByRole("listitem")
    .last()
}

async function abrirExplorador(page: Page, ruta = RUTA): Promise<void> {
  await page.goto(ruta)
  await expect(
    page.getByRole("heading", { level: 1, name: "Explorador geográfico" })
  ).toBeAttached()
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible()
  await expect(
    page.getByRole("status").filter({ hasText: /con datos\.$/ })
  ).toBeAttached()
}

/** En pantallas táctiles el ranking vive en una hoja que abre su botón. */
async function mostrarRanking(page: Page, proyecto: string): Promise<void> {
  if (esTactil(proyecto)) {
    await page.getByRole("button", { name: "Ranking", exact: true }).tap()
  }
  await expect(ranking(page)).toBeVisible()
}

/** Toque en pantallas táctiles, clic en escritorio. */
async function pulsar(elemento: Locator, proyecto: string): Promise<void> {
  await (esTactil(proyecto) ? elemento.tap() : elemento.click())
}

test.use({ storageState: sesion("interno") })

test.describe("explorador geográfico", () => {
  // El coachmark se prueba aparte: aquí ya se «vio».
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((clave) => {
      window.localStorage.setItem(clave, "1")
    }, CLAVE_COACHMARK)
  })

  test("del país al departamento con «Explorar»: ranking, detalle y estado en la URL", async ({
    page,
  }, info) => {
    const proyecto = info.project.name
    await abrirExplorador(page)
    await expect(nivelActual(page)).toHaveText("Colombia")

    await mostrarRanking(page, proyecto)
    await expect(
      page.getByRole("heading", { name: "Ranking de departamentos" }).last()
    ).toBeVisible()
    await expect(ranking(page).getByRole("listitem")).toHaveCount(33)

    await pulsar(filaRanking(page, "Antioquia"), proyecto)
    const detalle = detalleDe(page, "Antioquia")
    await expect(detalle).toBeVisible()
    await expect(
      detalle.getByText(/^Puesto \d+ de 33 departamentos/)
    ).toBeVisible()
    await expect(
      detalle.getByRole("region", { name: "Evolución semanal" })
    ).toBeVisible()

    await pulsar(
      detalle.getByRole("button", { name: "Explorar Antioquia" }),
      proyecto
    )
    await expect.poll(() => parametro(page, "nivel")).toBe("departamental")
    expect(parametro(page, "depto")).toBe("05")
    await expect(nivelActual(page)).toHaveText("Antioquia")
    if (esTactil(proyecto)) await expect(detalle).toBeHidden()

    await mostrarRanking(page, proyecto)
    await expect(
      page.getByRole("heading", { name: "Ranking de municipios" }).last()
    ).toBeVisible()
    await expect(filaRanking(page, "Medellín")).toBeVisible()
    if (proyecto === PROYECTO_MOVIL) await esperarSinDesbordeHorizontal(page)

    // El nivel viaja en la URL: el enlace abre el mismo departamento.
    await page.reload()
    await expect(nivelActual(page)).toHaveText("Antioquia")
    await expect(page.locator(".mapboxgl-canvas")).toBeVisible()
  })

  test("el giro del planeta solo existe en la vista mundial, se pausa, se recuerda y respeta el movimiento reducido", async ({
    page,
  }, info) => {
    const proyecto = info.project.name
    const giro = page.getByRole("button", { name: /giro del planeta$/ })

    await abrirExplorador(page)
    await expect(nivelActual(page)).toHaveText("Colombia")
    await expect(giro).toHaveCount(0)

    await abrirExplorador(page, `${RUTA}?nivel=internacional`)
    await expect(giro).toHaveAccessibleName("Pausar el giro del planeta")
    await pulsar(giro, proyecto)
    await expect(giro).toHaveAccessibleName("Reanudar el giro del planeta")

    // La elección se recuerda en el navegador.
    await page.reload()
    await expect(giro).toHaveAccessibleName("Reanudar el giro del planeta")
    await pulsar(giro, proyecto)
    await expect(giro).toHaveAccessibleName("Pausar el giro del planeta")

    // Sin movimiento no hay giro que pausar.
    await page.emulateMedia({ reducedMotion: "reduce" })
    await expect(giro).toHaveCount(0)
  })

  test("un enlace directo abre el nivel, la métrica y el periodo pedidos", async ({
    page,
  }, info) => {
    await abrirExplorador(
      page,
      `${RUTA}?nivel=departamental&depto=76&metrica=gmv&desde=2026-08-01&hasta=2026-08-31`
    )
    await expect(nivelActual(page)).toHaveText("Valle del Cauca")
    await expect(
      page.getByRole("combobox", { name: "Métrica del mapa" })
    ).toHaveText(/GMV/)
    await expect(
      page.getByRole("button", { name: /^Periodo: 1 .*31 de ago de 2026$/ })
    ).toBeVisible()
    await mostrarRanking(page, info.project.name)
    await expect(ranking(page)).toHaveAccessibleName(/GMV comprometido/i)

    // «Subir nivel» vuelve al país y limpia el departamento de la URL.
    if (esTactil(info.project.name)) await page.keyboard.press("Escape")
    await pulsar(
      page.getByRole("button", { name: "Subir nivel" }),
      info.project.name
    )
    await expect.poll(() => parametro(page, "depto")).toBeNull()
    await expect(nivelActual(page)).toHaveText("Colombia")
    expect(parametro(page, "metrica")).toBe("gmv")
  })

  test("un fallo de la API se muestra aislado y «Reintentar» recupera el mapa", async ({
    page,
    guardia,
  }, info) => {
    guardia.permitir(respuestaConEstado(503))
    await page.route(API, (ruta) =>
      ruta.fulfill({
        status: 503,
        json: {
          error: {
            motivo: "no-disponible",
            mensaje: "El explorador no está disponible.",
          },
        },
      })
    )
    await page.goto(RUTA)
    const aviso = page
      .getByRole("alert")
      .filter({ hasText: "No pudimos cargar los datos del mapa" })
    await expect(aviso).toBeVisible()
    // El resto de la aplicación sigue en pie.
    await expect(
      page.getByRole("navigation", { name: "Ruta de navegación" })
    ).toBeVisible()

    await page.unroute(API)
    await pulsar(
      aviso.getByRole("button", { name: "Reintentar" }),
      info.project.name
    )
    await expect(aviso).toBeHidden()
    await mostrarRanking(page, info.project.name)
    await expect(filaRanking(page, "Antioquia")).toBeVisible()
  })
})

test.describe("explorador geográfico en escritorio", () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(
      info.project.name !== PROYECTO_ESCRITORIO,
      "Teclado, paneles fijos y descarga: flujos del escritorio."
    )
    await page.addInitScript((clave) => {
      window.localStorage.setItem(clave, "1")
    }, CLAVE_COACHMARK)
  })

  test("teclado en el ranking: flechas, Enter selecciona y → baja de nivel; Bogotá no baja", async ({
    page,
  }) => {
    await abrirExplorador(page)
    const filas = ranking(page).getByRole("listitem")

    await filas.first().getByRole("button").first().focus()
    await page.keyboard.press("ArrowDown")
    await expect(filas.nth(1).getByRole("button").first()).toBeFocused()

    await filaRanking(page, "Bogotá, D.C.").focus()
    await page.keyboard.press("Enter")
    const bogota = detalleDe(page, "Bogotá, D.C.")
    await expect(bogota).toBeVisible()
    await expect(bogota.getByText(/Bogotá es un solo municipio/)).toBeVisible()
    await expect(bogota.getByRole("button", { name: /^Explorar/ })).toHaveCount(
      0
    )

    // → sobre Bogotá no cambia de nivel; sobre el Valle del Cauca sí.
    await filaRanking(page, "Bogotá, D.C.").focus()
    await page.keyboard.press("ArrowRight")
    expect(parametro(page, "nivel")).toBeNull()
    await filaRanking(page, "Valle del Cauca").focus()
    await page.keyboard.press("ArrowRight")
    await expect.poll(() => parametro(page, "depto")).toBe("76")
    await expect(nivelActual(page)).toHaveText("Valle del Cauca")
  })

  test("Atrás deshace el último nivel y Esc cierra el detalle y luego sube", async ({
    page,
  }) => {
    await abrirExplorador(page)
    await ranking(page)
      .getByRole("button", { name: "Explorar Valle del Cauca" })
      .click()
    await expect.poll(() => parametro(page, "depto")).toBe("76")

    await page.goBack()
    await expect.poll(() => parametro(page, "depto")).toBeNull()
    await expect(nivelActual(page)).toHaveText("Colombia")

    await filaRanking(page, "Antioquia").click()
    await expect(detalleDe(page, "Antioquia")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(detalleDe(page, "Antioquia")).toBeHidden()
    await page.keyboard.press("Escape")
    await expect.poll(() => parametro(page, "nivel")).toBe("internacional")
    await expect(nivelActual(page)).toHaveText("Mundo")
    await expect(
      page.getByRole("heading", { name: "Ranking de países" })
    ).toBeVisible()
    await expect(filaRanking(page, "Colombia")).toBeVisible()
  })

  test("métrica, tasa por 100 mil y modo calor se reflejan en la URL", async ({
    page,
  }) => {
    await abrirExplorador(page)

    await page.getByRole("button", { name: "Calor" }).click()
    await expect.poll(() => parametro(page, "calor")).toBe("true")
    await page.getByRole("button", { name: "Calor" }).click()
    await expect.poll(() => parametro(page, "calor")).toBeNull()

    await page.getByRole("combobox", { name: "Métrica del mapa" }).click()
    await page.getByRole("option", { name: /^GMV comprometido/ }).click()
    await expect.poll(() => parametro(page, "metrica")).toBe("gmv")
    await expect(ranking(page)).toHaveAccessibleName(/GMV comprometido/i)

    await page.getByRole("button", { name: "Por 100 mil hab." }).click()
    await expect.poll(() => parametro(page, "por100k")).toBe("true")
    await expect(page.getByText(/por 100 mil hab\./).first()).toBeVisible()
  })

  test("descarga el mapa como PNG con nombre descriptivo", async ({ page }) => {
    await abrirExplorador(page)
    const boton = page.getByRole("button", {
      name: "Descargar imagen del mapa",
    })
    await expect(boton).toBeEnabled({ timeout: 30_000 })
    const descarga = page.waitForEvent("download")
    await boton.click()
    expect((await descarga).suggestedFilename()).toMatch(
      /^amo-mapa-medios-colombia-\d{4}-\d{2}-\d{2}\.png$/
    )
  })
})

test("el coachmark del mapa aparece una sola vez", async ({ page }, info) => {
  await page.goto(RUTA)
  const coachmark = page.getByRole("dialog", { name: "Cómo usar el mapa" })
  await expect(coachmark).toBeVisible({ timeout: 30_000 })
  await pulsar(
    coachmark.getByRole("button", { name: "Entendido" }),
    info.project.name
  )
  await expect(coachmark).toBeHidden()

  await abrirExplorador(page)
  // Su aparición se demora a propósito: se da margen antes de comprobar que no vuelve.
  await page.waitForTimeout(2_000)
  await expect(coachmark).toHaveCount(0)
})
