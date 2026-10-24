import { randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"

import { rutaLiquidacion } from "../src/features/liquidaciones/rutas"
import { clienteDeLectura } from "./utilidades/datos-demo"
import {
  ingresarComoFinanzas,
  leerLiquidacionFinanzasE2E,
  type LiquidacionFinanzas,
  liquidacionFinanzasE2E,
  resolucionesPruebaE2E,
  restablecerFinanzasE2E,
} from "./utilidades/finanzas"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { pdfDePrueba } from "./utilidades/archivos"
import { PROYECTO_FINANZAS } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"

/**
 * Documento soporte de la liquidación (paquete DS: LIQ-004, D38 y D75 del RF) contra
 * `pnpm build && pnpm start`. La sección vive en la ficha de la liquidación
 * (`/finanzas/liquidaciones/{id}`):
 *
 * - Solo lectura (escritorio, tablet y móvil; sesión interna, ADMIN): un documento demo emitido muestra
 *   su estado, número, valor y descargas, y la ficha cabe en la pantalla. No se pulsa nada.
 * - Escribe (solo en el proyecto «finanzas», en serie, 1.440 px), con «Medio Finanzas E2E» (no factura) y
 *   la numeración de la plataforma:
 *   - Finanzas emite el documento de una liquidación aprobada: queda EMITIDO con número de la resolución,
 *     PDF y archivo `AMO-DS-1` para el proveedor (se descargan con nombre legible), el foco va al estado
 *     del documento y la bitácora registra el revelado de los datos del medio y las URL firmadas.
 *   - Registra el CUDS (el error de formato queda junto al campo): el PDF se rehace desde el archivo
 *     `AMO-DS-1` ya guardado (el que se transmitió), que no se reemplaza, y no se vuelven a revelar los
 *     datos del medio. Con CUDS no se anula sin nota de ajuste: registra la nota con su PDF, anula el
 *     documento con un motivo, el anulado queda en el historial y se emite otro con un número nuevo.
 *   Antes y después, `restablecerFinanzasE2E()` limpia lo de los medios de Finanzas.
 */

/** La tarjeta que encabeza el título «Documento soporte» (no es un landmark con nombre). */
function seccion(page: Page): Locator {
  return page
    .getByRole("heading", { level: 2, name: "Documento soporte", exact: true })
    .locator("xpath=ancestor::section[1]")
}

/** Rutas de los archivos del documento vigente de la liquidación (leídas como servicio). */
async function archivosDelDocumento(liquidacionId: string): Promise<{
  pdf: string | null
  proveedor: string | null
}> {
  const { data, error } = await clienteDeLectura()
    .from("documentos_soporte")
    .select("archivo_path, archivo_proveedor_path")
    .eq("liquidacion_id", liquidacionId)
    .neq("estado", "ANULADO")
    .single()
  if (error) throw new Error(`No se pudo leer el documento (${error.code}).`)
  return { pdf: data.archivo_path, proveedor: data.archivo_proveedor_path }
}

/** El estado del documento: recibe el foco tras cada cambio. */
function estado(page: Page): Locator {
  return page.locator("#estado-documento-soporte")
}

async function esperarEstado(page: Page, titulo: string): Promise<void> {
  await expect(
    estado(page).getByRole("heading", { level: 3, name: titulo })
  ).toBeVisible()
}

function cudsNuevo(): string {
  return randomBytes(48).toString("hex")
}

// ── Solo lectura: un documento demo emitido ──────────────────────────────────

test.describe("documento soporte · solo lectura", () => {
  test.use({ storageState: sesion("interno") })

  test("un documento emitido muestra su estado, número, valor y descargas, y cabe en la pantalla", async ({
    page,
  }) => {
    const { data, error } = await clienteDeLectura()
      .from("documentos_soporte")
      .select("id, numero, liquidacion:liquidaciones!inner ( id, estado )")
      .eq("estado", "EMITIDO")
      .eq("liquidacion.estado", "APROBADA")
      .not("archivo_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`No se pudo leer la demo: ${error.message}`)
    test.skip(!data?.numero, "La demo no tiene documentos soporte emitidos.")
    const documento = data as { numero: string; liquidacion: { id: string } }

    await page.goto(rutaLiquidacion(documento.liquidacion.id))
    const tarjeta = seccion(page)
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta.getByText("Emitido", { exact: true })).toBeVisible()
    await expect(
      tarjeta.getByText(documento.numero, { exact: true })
    ).toBeVisible()
    await expect(estado(page).getByRole("heading", { level: 3 })).toHaveText(
      /^(Pendiente de transmisión a la DIAN|Transmitido a la DIAN)$/
    )
    await expect(
      tarjeta
        .getByRole("group", { name: "Descargas del documento soporte" })
        .getByRole("button", {
          name: `PDF del documento (${documento.numero})`,
        })
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)
  })
})

// ── Escribe: Finanzas emite, registra el CUDS, corrige y vuelve a emitir ─────

test.describe("documento soporte · emisión y corrección", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 })

  let liquidacion: LiquidacionFinanzas | null = null
  /** Número del primer documento, que se anula en la segunda prueba. */
  let primerNumero: string | null = null

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_FINANZAS,
      "Emite y anula documentos soporte del «Medio Finanzas E2E»: corre solo en el proyecto «finanzas», en serie."
    )
    info.setTimeout(240_000)
    await restablecerFinanzasE2E()
    await resolucionesPruebaE2E()
    liquidacion = await liquidacionFinanzasE2E({
      medio: "MEDIO_FINANZAS",
      hasta: "APROBADA",
    })
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_FINANZAS) return
    info.setTimeout(120_000)
    await restablecerFinanzasE2E()
  })

  function preparada(): LiquidacionFinanzas {
    if (!liquidacion) {
      throw new Error("Las fábricas de Finanzas no prepararon la liquidación.")
    }
    return liquidacion
  }

  test("emite el documento con su PDF y su archivo para el proveedor (LIQ-004)", async ({
    page,
  }) => {
    const aprobada = preparada()
    expect(aprobada.estado).toBe("APROBADA")
    expect(aprobada.requiereDocumentoSoporte).toBe(true)
    const inicio = new Date().toISOString()

    await ingresarComoFinanzas(page, {
      destino: rutaLiquidacion(aprobada.liquidacionId),
    })
    const tarjeta = seccion(page)
    await esperarEstado(page, "Documento soporte requerido")

    await tarjeta
      .getByRole("button", { name: "Emitir documento soporte" })
      .click()
    const dialogo = page.getByRole("alertdialog", {
      name: "¿Emitir el documento soporte?",
    })
    await expect(dialogo).toContainText("no se vuelve a usar")
    await dialogo.getByRole("button", { name: "Emitir documento" }).click()
    await expect(dialogo).toBeHidden()

    // El botón ya no existe: el foco queda en el estado del documento.
    await expect(estado(page)).toBeFocused()
    await esperarEstado(page, "Pendiente de transmisión a la DIAN")
    await expect
      .poll(async () => {
        const leida = await leerLiquidacionFinanzasE2E(aprobada.liquidacionId)
        return leida.documentoSoporte?.estado === "EMITIDO" &&
          leida.documentoSoporte.archivoPath
          ? leida.documentoSoporte.numero
          : null
      })
      .not.toBeNull()
    const emitida = await leerLiquidacionFinanzasE2E(aprobada.liquidacionId)
    const documento = emitida.documentoSoporte
    if (!documento?.numero) throw new Error("El documento no quedó numerado.")
    primerNumero = documento.numero
    await expect(
      tarjeta.getByText(documento.numero, { exact: true })
    ).toBeVisible()
    await expect(tarjeta.getByText("Emitido", { exact: true })).toBeVisible()

    const descargas = tarjeta.getByRole("group", {
      name: "Descargas del documento soporte",
    })

    await test.step("el PDF se descarga con un nombre legible", async () => {
      const descarga = page.waitForEvent("download")
      await descargas
        .getByRole("button", {
          name: `PDF del documento (${documento.numero})`,
        })
        .click()
      const archivo = await descarga
      expect(archivo.suggestedFilename()).toBe(
        `Documento soporte ${documento.numero}.pdf`
      )
      const contenido = readFileSync(await archivo.path())
      expect(contenido.subarray(0, 5).toString("latin1")).toBe("%PDF-")
      // El título del documento va en sus metadatos (sin comprimir).
      expect(contenido.toString("latin1")).toContain(
        `Documento soporte ${documento.numero}`
      )
    })

    await test.step("el archivo para el proveedor sigue el formato AMO-DS-1", async () => {
      const descarga = page.waitForEvent("download")
      await descargas
        .getByRole("button", {
          name: `Archivo para el proveedor (${documento.numero})`,
        })
        .click()
      const archivo = await descarga
      expect(archivo.suggestedFilename()).toBe(
        `Documento soporte ${documento.numero} para el proveedor.json`
      )
      const json = JSON.parse(readFileSync(await archivo.path(), "utf8")) as {
        formato: string
        documento: { numero: string; cuds: string | null }
        vendedor: { numero_documento: string | null; nombre: string | null }
        items: unknown[]
        totales: { valor_bruto: number; neto_a_pagar: number }
      }
      expect(json.formato).toBe("AMO-DS-1")
      expect(json.documento).toMatchObject({
        numero: documento.numero,
        cuds: null,
      })
      expect(json.items).toHaveLength(aprobada.asignacionIds.length)
      expect(json.totales).toEqual(
        expect.objectContaining({
          valor_bruto: aprobada.montoMedio,
          neto_a_pagar: aprobada.montoNeto,
        })
      )
      // Los datos reservados del medio solo viajan dentro del archivo.
      expect(json.vendedor.numero_documento).toMatch(/^\w+$/)
      expect(json.vendedor.nombre).toBeTruthy()
    })

    await test.step("la bitácora registra el revelado y las URL firmadas", async () => {
      const servicio = clienteDeLectura()
      const { data: revelados } = await servicio
        .from("bitacora")
        .select("id")
        .eq("accion", "REVELAR_DATO")
        .eq("entidad", "medios_privado")
        .eq("entidad_id", aprobada.medioId)
        .gte("created_at", inicio)
      expect(revelados?.length ?? 0).toBeGreaterThan(0)
      const { data: firmadas } = await servicio
        .from("bitacora")
        .select("id")
        .eq("accion", "URL_FIRMADA")
        .eq("entidad", "documentos_soporte")
        .eq("entidad_id", documento.id)
        .gte("created_at", inicio)
      expect(firmadas?.length ?? 0).toBeGreaterThanOrEqual(2)
    })
  })

  test("registra el CUDS y, con CUDS, se corrige con nota de ajuste antes de anular (D38)", async ({
    page,
  }) => {
    const aprobada = preparada()
    if (!primerNumero)
      throw new Error("La prueba anterior no emitió el documento.")
    const numero = primerNumero
    const cuds = cudsNuevo()
    await ingresarComoFinanzas(page, {
      destino: rutaLiquidacion(aprobada.liquidacionId),
    })
    const tarjeta = seccion(page)
    await esperarEstado(page, "Pendiente de transmisión a la DIAN")
    const antes = await archivosDelDocumento(aprobada.liquidacionId)
    const desde = new Date().toISOString()

    await test.step("el CUDS mal copiado se explica junto al campo", async () => {
      await tarjeta.getByRole("button", { name: "Registrar CUDS" }).click()
      const dialogo = page.getByRole("dialog", { name: "Registrar el CUDS" })
      const campo = dialogo.getByRole("textbox", { name: "CUDS" })
      await campo.fill("abc")
      await dialogo.getByRole("button", { name: "Registrar CUDS" }).click()
      await expect(campo).toHaveAccessibleDescription(
        /^El CUDS tiene 96 caracteres; el que pegaste tiene 3\./
      )
      await expect(campo).toBeFocused()
      // Pegado en mayúsculas y partido en dos líneas: se normaliza solo.
      await campo.fill(`${cuds.slice(0, 48).toUpperCase()}\n${cuds.slice(48)}`)
      await dialogo.getByRole("button", { name: "Registrar CUDS" }).click()
      await expect(dialogo).toBeHidden()
      await expect(estado(page)).toBeFocused()
      await esperarEstado(page, "Transmitido a la DIAN")
      await expect(tarjeta.getByText(cuds, { exact: true })).toBeVisible()
      await expect
        .poll(
          async () =>
            (await leerLiquidacionFinanzasE2E(aprobada.liquidacionId))
              .documentoSoporte?.cuds
        )
        .toBe(cuds)
    })

    await test.step("el PDF nuevo sale del archivo transmitido, que no se reemplaza", async () => {
      await expect
        .poll(
          async () => (await archivosDelDocumento(aprobada.liquidacionId)).pdf
        )
        .not.toBe(antes.pdf)
      const despues = await archivosDelDocumento(aprobada.liquidacionId)
      expect(despues.proveedor).toBe(antes.proveedor)
      // Sin volver a revelar los datos del medio.
      const { data: revelados } = await clienteDeLectura()
        .from("bitacora")
        .select("id")
        .eq("accion", "REVELAR_DATO")
        .eq("entidad", "medios_privado")
        .eq("entidad_id", aprobada.medioId)
        .gte("created_at", desde)
      expect(revelados ?? []).toEqual([])
    })

    await test.step("con CUDS no se ofrece anular: primero la nota de ajuste", async () => {
      await expect(
        tarjeta.getByRole("button", { name: "Anular documento" })
      ).toHaveCount(0)
      await tarjeta
        .getByRole("button", { name: "Registrar nota de ajuste" })
        .click()
      const dialogo = page.getByRole("dialog", {
        name: "Registrar nota de ajuste",
      })
      await dialogo
        .getByRole("textbox", { name: "Número de la nota" })
        .fill(`na-e2e-${Date.now()}`)
      const [selector] = await Promise.all([
        page.waitForEvent("filechooser"),
        dialogo.getByRole("button", { name: "Elegir archivo" }).click(),
      ])
      await selector.setFiles(
        await pdfDePrueba({
          titulo: "Nota de ajuste E2E",
          nombre: "nota-ajuste.pdf",
        })
      )
      await expect(
        dialogo.getByRole("button", { name: "Quitar nota-ajuste.pdf" })
      ).toBeFocused()
      await dialogo.getByRole("button", { name: "Registrar nota" }).click()
      await expect(dialogo).toBeHidden({ timeout: 30_000 })
      await esperarEstado(page, "Nota de ajuste registrada")
      await expect(
        tarjeta
          .getByRole("group", { name: "Descargas del documento soporte" })
          .getByRole("button", { name: `Nota de ajuste (${numero})` })
      ).toBeVisible()
    })

    await test.step("se anula con un motivo y sigue a la vista con su nota", async () => {
      await tarjeta.getByRole("button", { name: "Anular documento" }).click()
      const dialogo = page.getByRole("alertdialog", {
        name: `¿Anular el documento soporte ${numero}?`,
      })
      await dialogo
        .getByRole("button", { name: "Los datos del vendedor estaban mal." })
        .click()
      await dialogo.getByRole("button", { name: "Anular documento" }).click()
      await expect(dialogo).toBeHidden()
      await expect(estado(page)).toBeFocused()
      await esperarEstado(page, "Documento soporte requerido")
      await expect(estado(page)).toContainText(
        `El documento ${numero} se anuló.`
      )
      // Mientras no haya otro, el anulado es el último documento de la liquidación: se ve con su nota.
      await expect(tarjeta).toContainText(numero)
      await expect(tarjeta).toContainText("Anulado")
      await expect(tarjeta).toContainText("NA-E2E-")
    })

    await test.step("se emite otro con un número nuevo", async () => {
      await tarjeta
        .getByRole("button", { name: "Emitir documento soporte" })
        .click()
      const dialogo = page.getByRole("alertdialog", {
        name: "¿Emitir el documento soporte?",
      })
      await dialogo.getByRole("button", { name: "Emitir documento" }).click()
      await expect(dialogo).toBeHidden()
      await esperarEstado(page, "Pendiente de transmisión a la DIAN")
      await expect
        .poll(async () => {
          const leida = await leerLiquidacionFinanzasE2E(aprobada.liquidacionId)
          return leida.documentoSoporte?.estado === "EMITIDO"
            ? leida.documentoSoporte.numero
            : null
        })
        .toMatch(/\S/)
      const nueva = await leerLiquidacionFinanzasE2E(aprobada.liquidacionId)
      expect(nueva.documentoSoporte?.numero).not.toBe(numero)
      // El anulado pasa al historial, con su nota de ajuste.
      const historial = tarjeta.getByRole("region", {
        name: "Documentos anteriores",
      })
      await expect(historial).toContainText(numero)
      await expect(historial).toContainText("nota de ajuste NA-E2E-")
    })
  })
})
