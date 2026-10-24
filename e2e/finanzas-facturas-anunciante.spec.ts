import { ingresarComoAnunciante } from "./utilidades/anunciantes"
import {
  anuncianteDemo,
  anunciantesAjenos,
  clienteDeLectura,
} from "./utilidades/datos-demo"
import {
  campanaFinanzasE2E,
  type CampanaFinanzas,
  facturaFinanzasE2E,
  type FacturaFinanzas,
  MEDIOS_DE_FINANZAS,
  resolucionesPruebaE2E,
  restablecerFinanzasE2E,
} from "./utilidades/finanzas"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { PROYECTO_FINANZAS } from "./utilidades/proyectos"
import {
  expect,
  type Locator,
  type Page,
  respuestaConEstado,
  test,
} from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"

/**
 * Facturas del anunciante (paquete FX: ANU-013) contra `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet y móvil; sesión demo del anunciante):
 *   el listado trae el resumen «Por pagar» / «Vencido» / «Próximo
 *   vencimiento» y cabe en la pantalla; el buscador por fechas lista solo las
 *   facturas emitidas en ese rango, con estado y saldo (ANU-013 c1); la ficha
 *   de una factura con pagos muestra totales, CUFE, pagos y conceptos; la
 *   factura de otra empresa no existe para él.
 * - Escribe (solo en el proyecto «finanzas», en serie, 1.440 px), con
 *   «Anunciante E2E» y las fábricas de la fase 5 (campaña «Finanzas E2E…»):
 *   la factura expedida aparece en el listado filtrado por su campaña con su
 *   número, plazo, CUFE (se copia completo) y PDF (se descarga con un nombre
 *   legible), y su ficha lista el medio y la oferta facturados; el borrador
 *   de la misma campaña no se ve ni por su enlace; el inicio enlaza la factura
 *   por pagar con su número sin repetir el prefijo y lleva a todas.
 *   Antes y después, `restablecerFinanzasE2E()` limpia lo de Finanzas.
 */

const RUTA = "/facturas"

function listado(page: Page): Locator {
  return page.getByRole("region", { name: "Facturas de tu empresa" })
}

/** Enlaces «Factura FE1042» visibles del listado (tabla o tarjetas, según el ancho). */
function enlacesFacturas(page: Page): Locator {
  return listado(page).getByRole("link", { name: /^Factura \S+$/ })
}

/** Separadores de Intl (U+00A0, U+202F) como espacios, para comparar textos. */
function sinEspaciosDuros(texto: string): string {
  return texto.replace(/[  ]/g, " ")
}

interface FacturaDemo {
  id: string
  numero: string
  fechaEmision: string
}

/** Facturas expedidas de la empresa demo, de la más reciente a la más antigua. */
async function facturasDemo(): Promise<FacturaDemo[]> {
  const servicio = clienteDeLectura()
  const empresa = await anuncianteDemo(servicio)
  const { data, error } = await servicio
    .from("facturas")
    .select("id, numero, fecha_emision")
    .eq("anunciante_id", empresa.id)
    .not("consecutivo", "is", null)
    .order("fecha_emision", { ascending: false })
  if (error) throw new Error(`No se leyeron las facturas: ${error.message}`)
  return data.flatMap((fila) =>
    fila.numero && fila.fecha_emision
      ? [{ id: fila.id, numero: fila.numero, fechaEmision: fila.fecha_emision }]
      : []
  )
}

test.describe("facturas del anunciante · solo lectura", () => {
  test.use({ storageState: sesion("anunciante") })

  test("el listado trae el resumen y las facturas, y cabe en la pantalla", async ({
    page,
  }) => {
    await page.goto(RUTA)
    await expect(
      page.getByRole("heading", { level: 1, name: "Facturas" })
    ).toBeVisible()
    const resumen = page.getByRole("region", {
      name: "Resumen de tus facturas",
    })
    for (const titulo of ["Por pagar", "Vencido", "Próximo vencimiento"]) {
      await expect(
        resumen.getByRole("heading", { level: 2, name: titulo })
      ).toBeVisible()
    }
    await expect(
      enlacesFacturas(page).first().or(page.getByText("Aún no tienes facturas"))
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Emitidas en: Todo el historial" })
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })

  test("el buscador por fechas lista solo las emitidas en ese rango, con estado y saldo (ANU-013 c1)", async ({
    page,
  }) => {
    const facturas = await facturasDemo()
    test.skip(
      facturas.length < 2,
      "La empresa demo necesita al menos dos facturas expedidas (pnpm demo:generar)."
    )
    // Un rango que deja fuera la más reciente y la más antigua, si las hay.
    const fechas = [...new Set(facturas.map((f) => f.fechaEmision))].sort()
    const desde = fechas[Math.min(1, fechas.length - 1)]
    const hasta = fechas[Math.max(fechas.length - 2, 0)]
    const esperadas = facturas
      .filter((f) => f.fechaEmision >= desde && f.fechaEmision <= hasta)
      .map((f) => `Factura ${f.numero}`)
      .sort()

    await page.goto(
      `${RUTA}?${new URLSearchParams({ desde, hasta, tamano: "100" })}`
    )
    await expect(
      page.getByRole("button", { name: /^Emitidas en: / })
    ).not.toHaveAccessibleName("Emitidas en: Todo el historial")
    await expect(enlacesFacturas(page)).toHaveCount(esperadas.length)
    const nombres = await enlacesFacturas(page).evaluateAll((enlaces) =>
      enlaces.map((enlace) => enlace.getAttribute("aria-label") ?? "")
    )
    expect(nombres.sort()).toEqual(esperadas)

    // Cada factura dice su estado y su saldo. El `has` se evalúa dentro de la
    // fila: el enlace se busca por su nombre, no a partir del listado.
    const primera = page.getByRole("link", {
      name: nombres.sort()[0],
      exact: true,
    })
    const fila = listado(page)
      .getByRole("row")
      .filter({ has: primera })
      .or(listado(page).getByRole("listitem").filter({ has: primera }))
    await expect(fila).toContainText(
      /Por pagar|Pago parcial|Pagada|Vencida|Anulada/
    )
    await expect(fila).toContainText("$")
    await esperarSinDesbordeHorizontal(page)
  })

  test("la ficha de una factura muestra totales, CUFE, pagos y conceptos", async ({
    page,
  }) => {
    const servicio = clienteDeLectura()
    const empresa = await anuncianteDemo(servicio)
    const { data: pagada } = await servicio
      .from("facturas")
      .select("id, numero, pagos_anunciante ( id )")
      .eq("anunciante_id", empresa.id)
      .not("consecutivo", "is", null)
      .in("estado", ["PAGADA", "PAGADA_PARCIAL"])
      .limit(1)
      .maybeSingle()
    test.skip(!pagada, "La empresa demo no tiene facturas con pagos.")
    if (!pagada) return

    await page.goto(`${RUTA}/${pagada.id}`)
    await expect(
      page.getByRole("heading", { level: 1, name: `Factura ${pagada.numero}` })
    ).toBeVisible()
    for (const seccion of [
      "Totales",
      "Datos de la factura",
      "Pagos",
      "Conceptos",
    ]) {
      await expect(
        page.getByRole("heading", { level: 2, name: seccion })
      ).toBeVisible()
    }
    await expect(
      page.getByRole("button", {
        name: `Copiar el CUFE de la factura ${pagada.numero}`,
      })
    ).toBeVisible()
    await expect(
      page
        .getByRole("list", { name: "Pagos de la factura" })
        .getByRole("listitem")
    ).toHaveCount(pagada.pagos_anunciante.length)
    await expect(
      page
        .getByRole("list", { name: /^Conceptos de / })
        .first()
        .getByRole("listitem")
        .first()
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })

  test("la factura de otra empresa no existe para él", async ({
    page,
    guardia,
  }) => {
    guardia.permitir(respuestaConEstado(404))
    const servicio = clienteDeLectura()
    const ajenos = await anunciantesAjenos(
      servicio,
      await anuncianteDemo(servicio)
    )
    const { data: ajena } = await servicio
      .from("facturas")
      .select("id, numero")
      .in(
        "anunciante_id",
        ajenos.map((ajeno) => ajeno.id)
      )
      .not("consecutivo", "is", null)
      .limit(1)
      .maybeSingle()
    test.skip(!ajena, "No hay facturas de otras empresas en la demo.")
    if (!ajena) return

    await page.goto(`${RUTA}/${ajena.id}`)
    await expect(
      page.getByRole("heading", { name: "No encontramos lo que buscas" })
    ).toBeVisible()
    expect(await page.content()).not.toContain(`Factura ${ajena.numero}`)
  })
})

// ── Escribe: «Anunciante E2E» con las fábricas de Finanzas ──────────────────

test.describe("facturas del anunciante · factura expedida y borrador", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 })

  let campana: CampanaFinanzas | null = null
  let emitida: FacturaFinanzas | null = null
  let borrador: FacturaFinanzas | null = null

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_FINANZAS,
      "Crea facturas de la campaña «Finanzas E2E»: corre solo en el proyecto «finanzas», en serie."
    )
    info.setTimeout(240_000)
    await restablecerFinanzasE2E()
    await resolucionesPruebaE2E()
    campana = await campanaFinanzasE2E()
    emitida = await facturaFinanzasE2E({
      campanaId: campana.id,
      hasta: "EMITIDA",
    })
    // Otra publicación verificada (del otro medio) queda en un borrador.
    borrador = await facturaFinanzasE2E({
      campanaId: campana.id,
      hasta: "BORRADOR",
      medio: "MEDIO_FACTURA",
    })
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_FINANZAS) return
    info.setTimeout(120_000)
    await restablecerFinanzasE2E()
  })

  function preparadas(): {
    campana: CampanaFinanzas
    emitida: FacturaFinanzas & { numero: string; cufe: string }
    borrador: FacturaFinanzas
  } {
    if (!campana || !emitida?.numero || !emitida.cufe || !borrador) {
      throw new Error("Las fábricas de Finanzas no prepararon las facturas.")
    }
    return {
      campana,
      emitida: { ...emitida, numero: emitida.numero, cufe: emitida.cufe },
      borrador,
    }
  }

  test("la expedida aparece con su número, plazo, CUFE y PDF; el borrador no se ve (ANU-013)", async ({
    page,
    guardia,
  }) => {
    const { campana, emitida, borrador } = preparadas()
    expect(emitida.estado).toBe("EMITIDA")
    expect(borrador.estado).toBe("BORRADOR")
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"])

    // Desde la ficha de la campaña se llega con `?campana=` (las consolidadas también cubren).
    await ingresarComoAnunciante(page, {
      destino: `${RUTA}?campana=${campana.id}`,
    })
    await expect(enlacesFacturas(page)).toHaveCount(1)
    // El `has` se evalúa dentro de la fila: el enlace va sin el listado delante.
    const enlace = page.getByRole("link", {
      name: `Factura ${emitida.numero}`,
      exact: true,
    })
    const fila = listado(page).getByRole("row").filter({ has: enlace })
    await expect(fila).toContainText("Por pagar")
    await expect(fila).toContainText(/Vence (en \d+ días|mañana|hoy)/)
    await expect(fila).toContainText(campana.nombre)

    await test.step("copia el CUFE completo", async () => {
      await fila
        .getByRole("button", {
          name: `Copiar el CUFE de la factura ${emitida.numero}`,
        })
        .click()
      await expect(fila.getByRole("status")).toHaveText("CUFE copiado")
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        emitida.cufe
      )
    })

    await test.step("la ficha lista el medio y la oferta facturados", async () => {
      await enlace.click()
      await expect(page).toHaveURL(
        (url) => url.pathname === `${RUTA}/${emitida.facturaId}`
      )
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: `Factura ${emitida.numero}`,
        })
      ).toBeVisible()
      await expect(
        page.getByText(
          "Aún no registramos pagos de esta factura. Cuando AMO reciba tu pago lo verás aquí con su soporte."
        )
      ).toBeVisible()
      const conceptos = page.getByRole("list", {
        name: `Conceptos de ${campana.nombre}`,
      })
      await expect(conceptos.getByRole("listitem")).toHaveCount(
        emitida.asignacionIds.length
      )
      await expect(conceptos).toContainText(
        MEDIOS_DE_FINANZAS.MEDIO_FINANZAS.nombre
      )
      await expect(conceptos).toContainText(campana.ofertaTitulo)
      await expect(page.getByText("Saldo por pagar")).toBeVisible()
    })

    await test.step("descarga el PDF con un nombre legible", async () => {
      const descarga = page.waitForEvent("download")
      await page
        .getByRole("button", {
          name: `Descargar PDF de la factura ${emitida.numero}`,
        })
        .click()
      expect((await descarga).suggestedFilename()).toBe(
        `Factura ${emitida.numero}.pdf`
      )
    })

    await test.step("el borrador no existe ni por su enlace", async () => {
      guardia.permitir(respuestaConEstado(404))
      await page.goto(`${RUTA}/${borrador.facturaId}`)
      await expect(
        page.getByRole("heading", { name: "No encontramos lo que buscas" })
      ).toBeVisible()
    })
  })

  test("el inicio enlaza la factura por pagar sin repetir el prefijo y lleva a todas", async ({
    page,
  }) => {
    const { emitida } = preparadas()
    await ingresarComoAnunciante(page)
    const cartera = page.getByRole("region", { name: "Facturas por pagar" })
    const enlace = cartera.getByRole("link", {
      name: `Factura ${emitida.numero}`,
      exact: true,
    })
    await expect(enlace).toHaveAttribute("href", `${RUTA}/${emitida.facturaId}`)
    expect(sinEspaciosDuros(await cartera.innerText())).not.toContain(
      `Factura ${emitida.numero.replace(/\d+$/, "")}${emitida.numero}`
    )
    await cartera.getByRole("link", { name: "Ver todas tus facturas" }).click()
    await expect(page).toHaveURL((url) => url.pathname === RUTA)
    await expect(
      page.getByRole("heading", { level: 1, name: "Facturas" })
    ).toBeVisible()
  })
})
