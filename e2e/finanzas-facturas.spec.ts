import { randomBytes } from "node:crypto"
import { readFile } from "node:fs/promises"

import { pdfDePrueba } from "./utilidades/archivos"
import {
  asignacionVerificadaFinanzasE2E,
  type CampanaFinanzas,
  campanaFinanzasE2E,
  facturaFinanzasE2E,
  ingresarComoFinanzas,
  leerFacturaFinanzasE2E,
  resolucionesPruebaE2E,
  restablecerFinanzasE2E,
} from "./utilidades/finanzas"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { PROYECTO_FINANZAS } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"

/**
 * Facturas al anunciante y cartera (LIQ-008, ADM-004; paquete FA) contra
 * `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet y móvil), con la sesión interna: el
 *   listado con su resumen y los filtros en la URL, y la cartera a una fecha
 *   de corte con sus edades y las facturas vencidas; nada desborda.
 * - Escribe (solo en el proyecto «finanzas», en serie, 1.440 px), con
 *   Finanzas y la campaña «Finanzas E2E» de las fábricas:
 *   - genera el borrador de la campaña desde «Nueva factura» y lo anula con
 *     motivo (sus asignaciones quedan libres);
 *   - descarga el archivo de carga y registra la factura expedida con su
 *     número, CUFE, total y PDF: queda EMITIDA (LIQ-008 c1); un total que no
 *     coincide se explica en su campo;
 *   - registra un pago parcial (queda PAGADA_PARCIAL con su saldo, LIQ-008
 *     c2) y otro con retenciones que la salda;
 *   - registra la nota crédito que cubre todo el saldo: queda ANULADA con la
 *     referencia de la nota (LIQ-008 c4).
 *   Antes y después, `restablecerFinanzasE2E()` limpia lo de Finanzas E2E.
 */

const RUTA_FACTURAS = "/finanzas/facturas"
const RUTA_CARTERA = "/finanzas/cartera"

function rutaFactura(facturaId: string): string {
  return `${RUTA_FACTURAS}/${facturaId}`
}

/** CUFE/CUDE de prueba: 96 hexadecimales distintos en cada corrida. */
function codigoDian(): string {
  return randomBytes(48).toString("hex")
}

/** Lo que tiene el foco: tras registrar nunca debe quedar en `<body>`. */
function enfocado(page: Page): Locator {
  return page.locator(":focus")
}

function avisoEstado(page: Page, titulo: string | RegExp): Locator {
  return page.getByRole("region", { name: titulo })
}

/** Elige el archivo en la zona del diálogo y espera a que termine de subir. */
async function cargarArchivo(
  dialogo: Locator,
  titulo: string,
  nombre: string
): Promise<void> {
  const [selector] = await Promise.all([
    dialogo.page().waitForEvent("filechooser"),
    dialogo.getByRole("button", { name: "Elegir archivo" }).click(),
  ])
  await selector.setFiles(await pdfDePrueba({ titulo, nombre }))
  await expect(dialogo.getByRole("list", { name: titulo })).toContainText(
    nombre
  )
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Pesos sin separadores (el campo acepta «4.000.000» o «4000000»). */
function pesos(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(2)
}

test.describe("facturas y cartera · solo lectura", () => {
  test.use({ storageState: sesion("interno") })

  test("el listado se abre con el resumen y filtra por estado en la URL", async ({
    page,
  }) => {
    await page.goto(RUTA_FACTURAS)
    await expect(
      page.getByRole("heading", { level: 1, name: "Facturas" })
    ).toBeVisible()
    const resumen = page.getByRole("region", {
      name: "Resumen de la facturación",
    })
    for (const titulo of [
      "Por facturar",
      "Borradores por expedir",
      "Saldo por cobrar",
      "Vencido",
    ]) {
      await expect(
        resumen.getByRole("heading", { name: titulo, exact: true })
      ).toBeVisible()
    }
    const listado = page.getByRole("region", {
      name: "Facturas al anunciante",
      exact: true,
    })
    await expect(
      listado
        .getByRole("table")
        .or(listado.getByRole("list"))
        .or(page.getByText("Aún no hay facturas"))
        .first()
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)

    await test.step("desde el resumen, solo las vencidas", async () => {
      await resumen.getByRole("link", { name: "Vencido" }).click()
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === RUTA_FACTURAS &&
          url.searchParams.get("estado") === "VENCIDA"
      )
      await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
      const otras = listado.getByText(/^(Emitida|Pagada|Borrador|Anulada)$/)
      await expect(otras).toHaveCount(0)
    })
  })

  test("la cartera muestra las edades del saldo y las vencidas a la fecha de corte", async ({
    page,
  }) => {
    await page.goto(RUTA_CARTERA)
    await expect(
      page.getByRole("heading", { level: 1, name: "Cartera" })
    ).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Totales de la cartera" })
    ).toBeVisible()
    await expect(
      page
        .getByRole("heading", { name: "Antigüedad del saldo" })
        .or(page.getByText("Sin saldo por cobrar"))
        .first()
    ).toBeVisible()
    const vencidas = page.getByRole("list", { name: "Facturas vencidas" })
    await expect(
      vencidas
        .or(page.getByText("Ninguna factura tenía saldo vencido a esa fecha."))
        .first()
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)

    await test.step("una vencida lleva a su ficha", async () => {
      if ((await vencidas.count()) === 0) return
      await vencidas.getByRole("link").first().click()
      await expect(page).toHaveURL(/\/finanzas\/facturas\/[0-9a-f-]{36}$/)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    })

    await test.step("un corte anterior viaja en la URL", async () => {
      await page.goto(`${RUTA_CARTERA}?corte=2026-01-31`)
      await expect(
        page.getByRole("button", {
          name: /^Fecha de corte: 31 de enero de 2026/,
        })
      ).toBeVisible()
      await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    })
  })
})

test.describe("facturas · Finanzas", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 })

  let campana: CampanaFinanzas

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_FINANZAS,
      "Genera, expide, cobra y corrige facturas de la campaña «Finanzas E2E»: corre solo en el proyecto «finanzas», en serie."
    )
    info.setTimeout(180_000)
    await restablecerFinanzasE2E()
    await resolucionesPruebaE2E()
    campana = await campanaFinanzasE2E()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_FINANZAS) return
    info.setTimeout(120_000)
    await restablecerFinanzasE2E()
  })

  test("genera el borrador de la campaña desde lo verificado y lo anula con motivo", async ({
    page,
  }) => {
    const asignacion = await asignacionVerificadaFinanzasE2E({
      medio: "MEDIO_FINANZAS",
      campanaId: campana.id,
    })
    await ingresarComoFinanzas(page, { destino: RUTA_FACTURAS })

    await page.getByRole("button", { name: "Nueva factura" }).click()
    const dialogo = page.getByRole("dialog", { name: "Nueva factura" })
    await dialogo.getByRole("radio", { name: /^Anunciante E2E/ }).check()
    await dialogo
      .getByRole("radio", {
        name: new RegExp(`^${escaparRegex(campana.nombre)}`),
      })
      .check()
    await expect(dialogo).toContainText(/Entran \d+ asignaci/)
    await dialogo.getByRole("button", { name: "Generar borrador" }).click()

    await expect(page).toHaveURL(/\/finanzas\/facturas\/[0-9a-f-]{36}$/)
    const facturaId = new URL(page.url()).pathname.split("/").pop() ?? ""
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Borrador para Anunciante E2E",
      })
    ).toBeVisible()
    await expect(avisoEstado(page, "Borrador: falta expedirla")).toBeVisible()
    await expect(
      page.getByRole("list", { name: "Asignaciones facturadas" })
    ).toContainText(asignacion.ofertaTitulo)
    const leida = await leerFacturaFinanzasE2E(facturaId)
    expect(leida).toMatchObject({ estado: "BORRADOR", campanaId: campana.id })
    expect(leida.asignacionIds).toContain(asignacion.asignacionId)

    await page.getByRole("button", { name: "Anular borrador" }).click()
    const anular = page.getByRole("alertdialog", {
      name: "¿Anular el borrador?",
    })
    await anular
      .getByRole("button", { name: /^Se generó con una fecha de corte/ })
      .click()
    await anular.getByRole("button", { name: "Anular borrador" }).click()
    await expect(anular).toBeHidden()
    await expect(avisoEstado(page, "Borrador anulado")).toBeFocused()
    await expect
      .poll(async () => (await leerFacturaFinanzasE2E(facturaId)).estado)
      .toBe("ANULADA")
    expect((await leerFacturaFinanzasE2E(facturaId)).asignacionIds).toEqual([])
  })

  test("descarga el archivo de carga y registra la factura expedida (LIQ-008 c1)", async ({
    page,
  }) => {
    const factura = await facturaFinanzasE2E({
      campanaId: campana.id,
      hasta: "BORRADOR",
    })
    await ingresarComoFinanzas(page, {
      destino: rutaFactura(factura.facturaId),
    })

    await test.step("archivo de carga en JSON", async () => {
      await page.getByRole("button", { name: "Archivo de carga" }).click()
      const [descarga] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("menuitem", { name: /^JSON/ }).click(),
      ])
      expect(descarga.suggestedFilename()).toMatch(
        /^borrador-factura-anunciante-e2e-[0-9a-f]{8}\.json$/
      )
      const contenido = JSON.parse(
        await readFile(await descarga.path(), "utf8")
      )
      expect(contenido).toMatchObject({
        formato: "AMO-FV-1",
        factura: { id: factura.facturaId, moneda: "COP" },
        adquirente: { razon_social: expect.any(String) },
        totales: { total: factura.total },
        cuadra: true,
      })
    })

    await page
      .getByRole("button", { name: "Registrar factura expedida" })
      .click()
    const dialogo = page.getByRole("dialog", {
      name: "Registrar factura expedida",
    })
    // El prefijo y el número llegan sugeridos por la resolución activa.
    await expect(dialogo.getByLabel("Prefijo")).not.toHaveValue("")
    await expect(dialogo.getByLabel("Número")).not.toHaveValue("")
    const cufe = codigoDian()
    await dialogo.getByLabel("CUFE").fill(cufe.toUpperCase())
    const total = dialogo.getByLabel("Total de la factura expedida")
    await total.fill(pesos(factura.total + 1000))
    await cargarArchivo(
      dialogo,
      "PDF de la factura expedida",
      "factura-expedida-e2e.pdf"
    )

    await dialogo.getByRole("button", { name: "Registrar factura" }).click()
    await expect(total).toHaveAccessibleDescription(
      /No coincide con el total del borrador/
    )
    await expect(total).toBeFocused()

    await total.fill(pesos(factura.total))
    await dialogo.getByRole("button", { name: "Registrar factura" }).click()
    await expect(dialogo).toBeHidden()
    await expect(avisoEstado(page, /^Emitida · por cobrar/)).toBeFocused()
    const leida = await leerFacturaFinanzasE2E(factura.facturaId)
    expect(leida).toMatchObject({ estado: "EMITIDA", cufe })
    expect(leida.numero).not.toBeNull()
    await expect(
      page.getByRole("heading", { level: 1, name: leida.numero ?? "" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Copiar CUFE" })
    ).toBeVisible()
  })

  test("un pago parcial deja saldo y otro con retenciones la salda (LIQ-008 c2)", async ({
    page,
  }) => {
    const factura = await facturaFinanzasE2E({
      campanaId: campana.id,
      hasta: "EMITIDA",
    })
    const parcial = Math.round(factura.total * 0.4)
    const restante = Math.round((factura.total - parcial) * 100) / 100
    const retenciones = Math.min(10_000, Math.floor(restante / 2))
    await ingresarComoFinanzas(page, {
      destino: rutaFactura(factura.facturaId),
    })

    await test.step("pago parcial", async () => {
      await page.getByRole("button", { name: "Registrar pago" }).click()
      const dialogo = page.getByRole("dialog", { name: "Registrar pago" })
      await dialogo.getByLabel("Valor recibido").fill(pesos(parcial))
      await expect(dialogo).toContainText(/Queda un saldo de/)
      await dialogo.getByRole("radio", { name: "PSE" }).check()
      await dialogo.getByLabel("Referencia (opcional)").fill("CUS E2E 1")
      await cargarArchivo(dialogo, "Soporte del pago", "soporte-pago-e2e.pdf")
      await dialogo.getByRole("button", { name: "Registrar pago" }).click()
      await expect(dialogo).toBeHidden()
      await expect(avisoEstado(page, /^Pago parcial · saldo/)).toBeFocused()
      const leida = await leerFacturaFinanzasE2E(factura.facturaId)
      expect(leida.estado).toBe("PAGADA_PARCIAL")
      expect(leida.saldo).toBeCloseTo(restante, 2)
      await expect(
        page.getByRole("list", { name: "Pagos registrados" })
      ).toContainText("PSE · CUS E2E 1")
    })

    await test.step("el resto, con las retenciones del anunciante", async () => {
      await page.getByRole("button", { name: "Registrar pago" }).click()
      const dialogo = page.getByRole("dialog", { name: "Registrar pago" })
      await dialogo
        .getByLabel("Valor recibido")
        .fill(pesos(Math.round((restante - retenciones) * 100) / 100))
      await dialogo
        .getByLabel("Retenciones (opcional)")
        .fill(pesos(retenciones))
      await expect(dialogo).toContainText(
        "Con este pago la factura queda pagada."
      )
      await cargarArchivo(dialogo, "Soporte del pago", "soporte-saldo-e2e.pdf")
      await dialogo.getByRole("button", { name: "Registrar pago" }).click()
      await expect(dialogo).toBeHidden()
      await expect(avisoEstado(page, "Pagada")).toBeFocused()
      expect(await leerFacturaFinanzasE2E(factura.facturaId)).toMatchObject({
        estado: "PAGADA",
        saldo: 0,
      })
      // Sin saldo ya no se ofrecen pagos ni notas crédito, y la ficha dice
      // que la devolución o el saldo a favor van por fuera (factura_pagada).
      await expect(
        page.getByRole("button", { name: "Registrar pago" })
      ).toHaveCount(0)
      await expect(
        page.getByRole("button", { name: "Registrar nota crédito" })
      ).toHaveCount(0)
      await expect(
        page.getByText(/ya no admite notas crédito\. Por ahora la devolución/)
      ).toBeVisible()
    })
  })

  test("la nota crédito por todo el saldo anula la factura con su referencia (LIQ-008 c4)", async ({
    page,
  }) => {
    const factura = await facturaFinanzasE2E({
      campanaId: campana.id,
      hasta: "EMITIDA",
    })
    const numero = `NCE2E${randomBytes(3).toString("hex").toUpperCase()}`
    await ingresarComoFinanzas(page, {
      destino: rutaFactura(factura.facturaId),
    })

    await page.getByRole("button", { name: "Registrar nota crédito" }).click()
    const dialogo = page.getByRole("dialog", { name: "Registrar nota crédito" })
    await dialogo.getByLabel("Número").fill(numero)
    await dialogo.getByLabel("CUDE").fill(codigoDian())
    await dialogo.getByRole("button", { name: "Todo el saldo" }).click()
    await expect(dialogo).toContainText(/quedará ANULADA, sale de la cartera/)
    await dialogo
      .getByRole("textbox", { name: "Motivo" })
      .fill("La campaña se canceló por completo a pedido del anunciante (E2E).")
    await cargarArchivo(
      dialogo,
      "PDF de la nota crédito",
      "nota-credito-e2e.pdf"
    )
    await dialogo
      .getByRole("button", { name: "Registrar nota crédito" })
      .click()
    await expect(dialogo).toBeHidden()
    await expect(
      avisoEstado(page, `Anulada con la nota crédito ${numero}`)
    ).toBeFocused()
    await expect(enfocado(page)).toContainText("Salió de la cartera")
    expect(await leerFacturaFinanzasE2E(factura.facturaId)).toMatchObject({
      estado: "ANULADA",
      saldo: 0,
    })
    await expect(
      page.getByRole("list", { name: "Notas crédito registradas" })
    ).toContainText(numero)
  })
})
