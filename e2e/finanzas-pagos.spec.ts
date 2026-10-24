import { readFileSync } from "node:fs"

import { pdfDePrueba } from "./utilidades/archivos"
import { clienteDeLectura } from "./utilidades/datos-demo"
import {
  ingresarComoFinanzas,
  leerLiquidacionFinanzasE2E,
  type LiquidacionFinanzas,
  liquidacionFinanzasE2E,
  MEDIOS_DE_FINANZAS,
  resolucionesPruebaE2E,
  restablecerFinanzasE2E,
} from "./utilidades/finanzas"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { PROYECTO_FINANZAS } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"

/**
 * Pagos a medios (paquete PG: LIQ-005, LIQ-006) contra `pnpm build && pnpm
 * start`, solo en el proyecto «finanzas» (en serie, 1.440 px): la página
 * exige `liquidaciones.registrar_pago` (Finanzas; el ADMIN de la sesión
 * interna no lo tiene) y todo lo de aquí escribe.
 *
 * - «Por pagar» explica qué le falta a cada liquidación: la del medio que
 *   factura sin su factura muestra «Falta documento soporte o factura» y su
 *   «Registrar pago» deshabilitado con «Documento soporte requerido: …».
 * - Finanzas genera el archivo de pagos con la liquidación del «Medio Finanzas
 *   E2E» (documento emitido): se descarga un CSV con la referencia
 *   `LIQ-{AAAAMMDD}-{id}` y el neto en pesos, la fila queda «Archivo del …» y
 *   la bitácora lleva un REVELAR_DATO por medio y un EXPORTAR (N + 1, LIQ-005
 *   c1). Incluirla otra vez exige confirmarlo («Incluirlas otra vez»).
 * - Registra el pago con fecha, referencia y soporte: la liquidación queda
 *   PAGADA, sale de la lista y el foco vuelve al título de la vista (LIQ-006).
 * - El historial muestra el archivo, su ficha lista la liquidación pagada y
 *   lo descarga otra vez. A 390 px nada desborda.
 *
 * Antes y después, `restablecerFinanzasE2E()` limpia lo de los medios de
 * Finanzas (incluidos sus archivos de pagos).
 */

const RUTA = "/finanzas/pagos"
const MEDIO = MEDIOS_DE_FINANZAS.MEDIO_FINANZAS
const MEDIO_FACTURA = MEDIOS_DE_FINANZAS.MEDIO_FACTURA

function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** La tabla acotada a un medio por la búsqueda (hay también datos demo). */
async function buscarMedio(
  page: Page,
  nombre: string,
  buscador = "Buscar medio"
): Promise<void> {
  await page.getByRole("searchbox", { name: buscador }).fill(nombre)
  await expect(page).toHaveURL(/[?&]q=/)
}

function tabla(page: Page): Locator {
  return page.getByRole("table", { name: "Liquidaciones por pagar" })
}

function filaDe(page: Page, nombre: string): Locator {
  return tabla(page).getByRole("row").filter({ hasText: nombre })
}

async function eventosBitacora(opciones: {
  accion: string
  entidad: string
  entidadId: string
  desde: string
  origen?: string
}): Promise<number> {
  let consulta = clienteDeLectura()
    .from("bitacora")
    .select("id", { count: "exact", head: true })
    .eq("accion", opciones.accion)
    .eq("entidad", opciones.entidad)
    .eq("entidad_id", opciones.entidadId)
    .gte("created_at", opciones.desde)
  if (opciones.origen) {
    consulta = consulta.eq("metadatos->>origen", opciones.origen)
  }
  const { count, error } = await consulta
  if (error) throw new Error(`No se pudo leer la bitácora: ${error.message}`)
  return count ?? 0
}

test.describe("pagos a medios", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 })

  let lista: LiquidacionFinanzas
  let sinFactura: LiquidacionFinanzas

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_FINANZAS,
      "Genera archivos de pagos y registra pagos de los medios de Finanzas: corre solo en el proyecto «finanzas», en serie."
    )
    info.setTimeout(300_000)
    await restablecerFinanzasE2E()
    await resolucionesPruebaE2E()
    // Documento soporte emitido: lista para el archivo de pagos.
    lista = await liquidacionFinanzasE2E({
      medio: "MEDIO_FINANZAS",
      hasta: "EMITIDA",
    })
    // Aprobada, pero el medio que factura aún no carga su factura.
    sinFactura = await liquidacionFinanzasE2E({
      medio: "MEDIO_FACTURA",
      hasta: "APROBADA",
    })
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_FINANZAS) return
    info.setTimeout(120_000)
    await restablecerFinanzasE2E()
  })

  test("«Por pagar» explica qué falta y no deja pagar sin documento soporte ni factura (LIQ-006)", async ({
    page,
  }) => {
    await ingresarComoFinanzas(page, { destino: RUTA })
    await expect(
      page.getByRole("heading", { level: 1, name: "Pagos a medios" })
    ).toBeVisible()
    await expect(
      page
        .getByRole("navigation", { name: "Vistas de pagos a medios" })
        .getByRole("link", { name: /^Por pagar: / })
    ).toHaveAttribute("aria-current", "page")

    await buscarMedio(page, MEDIO_FACTURA.nombre)
    const fila = filaDe(page, MEDIO_FACTURA.nombre)
    await expect(fila).toContainText("Falta documento soporte o factura")
    await expect(fila).toContainText("Factura del medio")
    const pagar = fila.getByRole("button", {
      name: `Registrar pago de ${MEDIO_FACTURA.nombre}`,
    })
    await expect(pagar).toHaveAttribute("aria-disabled", "true")
    await expect(pagar).toHaveAccessibleDescription(
      /^Documento soporte requerido: /
    )
    expect(
      (await leerLiquidacionFinanzasE2E(sinFactura.liquidacionId)).estado
    ).toBe("APROBADA")
  })

  test("genera el archivo de pagos y lo descarga; la bitácora lleva N + 1 eventos (LIQ-005 c1)", async ({
    page,
  }) => {
    await ingresarComoFinanzas(page, { destino: RUTA })
    await buscarMedio(page, MEDIO.nombre)
    const fila = filaDe(page, MEDIO.nombre)
    await expect(fila).toContainText("Documento listo")
    await expect(fila).toContainText("Datos de pago listos")
    await expect(fila).toContainText("Sin archivo")

    await fila
      .getByRole("checkbox", {
        name: new RegExp(`^Seleccionar ${MEDIO.nombre}`),
      })
      .click()
    await page
      .getByRole("region", { name: "Acciones sobre la selección" })
      .getByRole("button", { name: "Generar archivo de pagos" })
      .click()
    const dialogo = page.getByRole("alertdialog", {
      name: "¿Generar el archivo de pagos?",
    })
    await expect(dialogo).toContainText("1 liquidación de 1 medio")
    await expect(dialogo).toContainText("revela los datos bancarios")

    const desde = new Date(Date.now() - 1_000).toISOString()
    const descarga = page.waitForEvent("download")
    await dialogo.getByRole("button", { name: "Generar archivo" }).click()
    const archivo = await descarga
    expect(archivo.suggestedFilename()).toBe(`archivo-pagos-${hoyBogota()}.csv`)
    const csv = readFileSync(await archivo.path(), "utf8").replace(/^﻿/, "")
    const [encabezado, ...filas] = csv.split("\r\n")
    expect(encabezado).toBe(
      "Tipo de documento;Número de documento;Titular;Método;Banco o billetera;Tipo de cuenta;Número de cuenta;Valor;Referencia;Medio"
    )
    expect(filas).toHaveLength(1)
    const celdas = filas[0].split(";")
    expect(celdas[7]).toBe(String(Math.round(lista.montoNeto)))
    expect(celdas[8]).toBe(
      `LIQ-${hoyBogota().replaceAll("-", "")}-${lista.liquidacionId.slice(0, 8)}`
    )
    expect(celdas[9]).toBe(MEDIO.nombre)
    expect(celdas[6]).toMatch(/^\d{5,20}$/)

    const resultado = page.getByRole("heading", {
      name: "Archivo de pagos generado",
    })
    await expect(resultado).toBeFocused()
    await page.getByRole("button", { name: "Listo" }).click()
    await expect(filaDe(page, MEDIO.nombre)).toContainText(/Archivo del /)

    const leida = await leerLiquidacionFinanzasE2E(lista.liquidacionId)
    expect(leida.dispersionId).not.toBeNull()
    // Un REVELAR_DATO por medio y un EXPORTAR por el archivo.
    expect(
      await eventosBitacora({
        accion: "REVELAR_DATO",
        entidad: "medios_privado",
        entidadId: MEDIO.id,
        origen: "dispersion",
        desde,
      })
    ).toBe(1)
    expect(
      await eventosBitacora({
        accion: "EXPORTAR",
        entidad: "dispersiones",
        entidadId: leida.dispersionId ?? "",
        desde,
      })
    ).toBe(1)
  })

  test("incluirla otra vez en un archivo exige confirmarlo con tesorería", async ({
    page,
  }) => {
    const anterior = (await leerLiquidacionFinanzasE2E(lista.liquidacionId))
      .dispersionId
    await ingresarComoFinanzas(page, { destino: RUTA })
    await buscarMedio(page, MEDIO.nombre)
    await filaDe(page, MEDIO.nombre)
      .getByRole("checkbox", {
        name: new RegExp(`^Seleccionar ${MEDIO.nombre}`),
      })
      .click()
    await page
      .getByRole("region", { name: "Acciones sobre la selección" })
      .getByRole("button", { name: "Generar archivo de pagos" })
      .click()
    const dialogo = page.getByRole("alertdialog", {
      name: "¿Generar el archivo de pagos?",
    })
    await expect(dialogo).toContainText(
      /Una ya está en el archivo de pagos del .+: confirma con tesorería que el banco no la pagó/
    )
    const descarga = page.waitForEvent("download")
    await dialogo.getByRole("button", { name: "Incluirlas otra vez" }).click()
    await descarga
    await expect(
      page.getByRole("heading", { name: "Archivo de pagos generado" })
    ).toBeFocused()
    await page.getByRole("button", { name: "Listo" }).click()
    const nueva = (await leerLiquidacionFinanzasE2E(lista.liquidacionId))
      .dispersionId
    expect(nueva).not.toBeNull()
    expect(nueva).not.toBe(anterior)
  })

  test("registra el pago con fecha, referencia y soporte (LIQ-006)", async ({
    page,
  }) => {
    await ingresarComoFinanzas(page, { destino: RUTA })
    await buscarMedio(page, MEDIO.nombre)
    await filaDe(page, MEDIO.nombre)
      .getByRole("button", { name: `Registrar pago de ${MEDIO.nombre}` })
      .click()
    const dialogo = page.getByRole("dialog", { name: "Registrar el pago" })
    await expect(dialogo.getByLabel("Fecha del pago")).toHaveValue(hoyBogota())

    // Sin referencia ni soporte: los errores quedan junto a su campo.
    await dialogo.getByRole("button", { name: "Registrar pago" }).click()
    const referencia = dialogo.getByRole("textbox", {
      name: "Referencia del pago",
    })
    await expect(referencia).toBeFocused()
    await expect(referencia).toHaveAccessibleDescription(
      /^Escribe la referencia del pago/
    )

    const valorReferencia = `TRF-E2E-${Date.now()}`
    await referencia.fill(valorReferencia)
    const [selector] = await Promise.all([
      page.waitForEvent("filechooser"),
      dialogo.getByRole("button", { name: "Elegir archivo" }).click(),
    ])
    await selector.setFiles(
      await pdfDePrueba({
        titulo: "Comprobante de la transferencia",
        nombre: "comprobante-e2e.pdf",
      })
    )
    await expect(dialogo.getByText("comprobante-e2e.pdf")).toBeVisible()
    await dialogo.getByRole("button", { name: "Registrar pago" }).click()
    await expect(dialogo).toBeHidden({ timeout: 30_000 })

    await expect
      .poll(
        async () =>
          (await leerLiquidacionFinanzasE2E(lista.liquidacionId)).estado
      )
      .toBe("PAGADA")
    const pagada = await leerLiquidacionFinanzasE2E(lista.liquidacionId)
    expect(pagada.pago).toMatchObject({
      fecha: hoyBogota(),
      referencia: valorReferencia,
    })
    expect(pagada.pago?.soportePath).toMatch(
      new RegExp(`^liquidacion/${lista.liquidacionId}/pago/`)
    )
    // Sale de «Por pagar»; el foco vuelve al título de la vista.
    await expect(filaDe(page, MEDIO.nombre)).toHaveCount(0)
    await expect(
      page.getByRole("heading", { level: 2, name: "Por pagar" })
    ).toBeFocused()
  })

  test("el historial muestra el archivo con su liquidación pagada y lo descarga otra vez", async ({
    page,
  }) => {
    const { dispersionId } = await leerLiquidacionFinanzasE2E(
      lista.liquidacionId
    )
    await ingresarComoFinanzas(page, { destino: `${RUTA}?vista=dispersiones` })
    await expect(
      page
        .getByRole("navigation", { name: "Vistas de pagos a medios" })
        .getByRole("link", { name: /^Archivos de pagos: / })
    ).toHaveAttribute("aria-current", "page")
    await buscarMedio(page, MEDIO.nombre, "Buscar por medio")
    await page
      .getByRole("table", { name: "Archivos de pagos generados" })
      .getByRole("link")
      .first()
      .click()
    await expect(page).toHaveURL(new RegExp(`${RUTA}/${dispersionId}$`))
    await expect(
      page.getByRole("heading", { level: 1, name: /^Archivo del / })
    ).toBeVisible()
    const filas = page.getByRole("table", { name: "Liquidaciones del archivo" })
    await expect(
      filas.getByRole("row").filter({ hasText: MEDIO.nombre })
    ).toContainText(/Pagada el /)

    const descarga = page.waitForEvent("download")
    await page.getByRole("button", { name: "Descargar archivo" }).click()
    expect((await descarga).suggestedFilename()).toBe(
      `archivo-pagos-${hoyBogota()}.csv`
    )
  })

  test("a 390 px «Por pagar» y el historial caben sin desplazamiento horizontal", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await ingresarComoFinanzas(page, { destino: RUTA })
    await expect(
      page.getByRole("heading", { level: 2, name: "Por pagar" })
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
    await page
      .getByRole("navigation", { name: "Vistas de pagos a medios" })
      .getByRole("link", { name: /^Archivos de pagos: / })
      .click()
    await expect(page).toHaveURL(/[?&]vista=dispersiones\b/)
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })
})
