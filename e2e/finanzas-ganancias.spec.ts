import { readFileSync } from "node:fs"

import { pdfDePrueba } from "./utilidades/archivos"
import {
  type AsignacionVerificadaFinanzas,
  asignacionVerificadaFinanzasE2E,
  campanaFinanzasE2E,
  leerLiquidacionFinanzasE2E,
  type LiquidacionFinanzas,
  liquidacionFinanzasE2E,
  restablecerFinanzasE2E,
} from "./utilidades/finanzas"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { ingresarComoMedio } from "./utilidades/medios"
import { PROYECTO_FINANZAS } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"

/**
 * Ganancias del medio (paquete GM: MED-015 y la factura del medio que factura,
 * D83) contra `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet y móvil; sesión del medio demo con 15
 *   meses de historia): el resumen rotula lo por liquidar «Estimado antes de
 *   retenciones», sus pagos salen en tarjetas o en tabla según el ancho, el
 *   detalle de un pago trae pago, documento, desglose y publicaciones, y nada
 *   desborda la pantalla. Los archivos de la demo no existen en Storage: no se
 *   descargan aquí.
 * - Escribe (solo en el proyecto «finanzas», en serie, a 390 px como lo usa el
 *   medio), con las fábricas de la fase 5:
 *   - «Medio Finanzas E2E» (no factura) con una liquidación PAGADA y una
 *     publicación verificada después: la tarjeta dice «Pagada el …», deja
 *     descargar el soporte de pago y el documento soporte (MED-015 c1), y lo
 *     verificado aparece «Por liquidar» como estimado antes de retenciones
 *     (c2); el detalle muestra la fecha, la referencia y el documento con
 *     «Pendiente de transmisión a la DIAN».
 *   - «Medio Factura E2E» (factura) con una liquidación APROBADA: «Carga tu
 *     factura» lleva al formulario, que explica lo que falta junto a cada
 *     campo; con número y PDF queda registrada (la BD lo confirma) y se
 *     descarga.
 *   Antes y después, `restablecerFinanzasE2E()` limpia lo de Finanzas.
 */

const RUTA = "/ganancias"
const MOVIL = { width: 390, height: 844 }

function rutaLiquidacion(id: string): string {
  return `${RUTA}/${id}`
}

/** La tarjeta de una liquidación (celular), por el enlace a su detalle. */
function tarjetaDe(page: Page, liquidacionId: string): Locator {
  return page
    .getByRole("list", { name: "Tus pagos" })
    .getByRole("article")
    .filter({
      has: page.locator(`a[href="${rutaLiquidacion(liquidacionId)}"]`),
    })
}

/** Enlace del periodo de una liquidación («1 – 15 oct 2026»), que abre su detalle. */
const ENLACE_PERIODO = /^\d{1,2} \D.*\d{4}$/

/** Día del mes de una columna `date` ('2026-10-21' → 21), para leer «Pagada el 21 oct 2026». */
function diaDe(fecha: string): number {
  return Number(fecha.slice(8, 10))
}

/** Descarga lo que abre `boton` y devuelve el nombre sugerido y los primeros bytes. */
async function descargar(
  page: Page,
  boton: Locator
): Promise<{ nombre: string; firma: string }> {
  const descarga = page.waitForEvent("download")
  await boton.click()
  const archivo = await descarga
  const contenido = readFileSync(await archivo.path())
  return {
    nombre: archivo.suggestedFilename(),
    firma: contenido.subarray(0, 5).toString("latin1"),
  }
}

test.describe("ganancias · solo lectura", () => {
  test.use({ storageState: sesion("medio") })

  test("el resumen, los pagos, lo por liquidar y la condición tributaria caben en la pantalla", async ({
    page,
  }) => {
    await page.goto(RUTA)
    await expect(
      page.getByRole("heading", { level: 1, name: "Ganancias" })
    ).toBeVisible()
    const resumen = page.getByRole("region", {
      name: "Resumen de tus ganancias",
    })
    await expect(resumen.getByText("Ganado este mes")).toBeVisible()
    // MED-015 c2: lo verificado sin liquidar es un estimado.
    await expect(
      resumen.getByText("Estimado antes de retenciones")
    ).toBeVisible()
    await expect(resumen.getByText(/^Liquidamos cada /)).toBeVisible()

    const pagos = page.getByRole("region", { name: "Tus pagos" })
    await expect(
      pagos
        .getByRole("list", { name: "Tus pagos" })
        .or(pagos.getByRole("table"))
        .or(pagos.getByText("Aún no tienes pagos"))
    ).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Por liquidar" })
    ).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Tu condición tributaria" })
    ).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Tus ganancias", exact: true })
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })

  test("el detalle de un pago trae el pago, el documento, el desglose y las publicaciones", async ({
    page,
  }) => {
    await page.goto(RUTA)
    const pagos = page.getByRole("region", { name: "Tus pagos" })
    const enlaces = pagos.getByRole("link", { name: ENLACE_PERIODO })
    test.skip(
      (await enlaces.count()) === 0,
      "El medio demo necesita liquidaciones (pnpm demo:generar)."
    )
    const periodo = (await enlaces.first().textContent())?.trim() ?? ""
    await enlaces.first().click()
    await expect(page).toHaveURL(/\/ganancias\/[0-9a-f-]{36}$/)
    await expect(
      page.getByRole("heading", { level: 1, name: periodo })
    ).toBeVisible()
    for (const titulo of ["Pago", "Desglose", "Publicaciones"]) {
      await expect(
        page.getByRole("heading", { level: 2, name: titulo, exact: true })
      ).toBeVisible()
    }
    await expect(
      page
        .getByRole("heading", { level: 2, name: "Documento soporte" })
        .or(page.getByRole("heading", { level: 2, name: "Tu factura" }))
    ).toBeVisible()
    await expect(page.getByText("Tu valor antes de retenciones")).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })
})

test.describe("ganancias · el medio cobra", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 })
  test.use({ viewport: MOVIL, hasTouch: true })

  let pagada: LiquidacionFinanzas
  let porLiquidar: AsignacionVerificadaFinanzas
  let porFacturar: LiquidacionFinanzas

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_FINANZAS,
      "Liquida y paga a los medios de Finanzas: corre solo en el proyecto «finanzas», en serie."
    )
    info.setTimeout(360_000)
    await restablecerFinanzasE2E()
    const campana = await campanaFinanzasE2E()
    pagada = await liquidacionFinanzasE2E({
      medio: "MEDIO_FINANZAS",
      hasta: "PAGADA",
      campanaId: campana.id,
    })
    // Después de liquidar: queda verificada y por liquidar.
    porLiquidar = await asignacionVerificadaFinanzasE2E({
      medio: "MEDIO_FINANZAS",
      campanaId: campana.id,
    })
    porFacturar = await liquidacionFinanzasE2E({
      medio: "MEDIO_FACTURA",
      hasta: "APROBADA",
      campanaId: campana.id,
    })
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_FINANZAS) return
    info.setTimeout(120_000)
    await restablecerFinanzasE2E()
  })

  test("una pagada muestra su fecha y deja descargar el soporte y el documento soporte (MED-015)", async ({
    page,
  }) => {
    await ingresarComoMedio(page, { cuenta: "MEDIO_FINANZAS", destino: RUTA })

    await test.step("lo verificado sin liquidar es un estimado (c2)", async () => {
      const resumen = page.getByRole("region", {
        name: "Resumen de tus ganancias",
      })
      await expect(
        resumen.getByText("Estimado antes de retenciones")
      ).toBeVisible()
      const pendientes = page.getByRole("region", { name: "Por liquidar" })
      await expect(
        pendientes.getByRole("link", { name: porLiquidar.ofertaTitulo })
      ).toBeVisible()
      await expect(
        pendientes.getByText(/Estimado antes de retenciones/)
      ).toBeVisible()
    })

    const tarjeta = tarjetaDe(page, pagada.liquidacionId)
    await test.step("la tarjeta dice cuándo se pagó (c1)", async () => {
      await expect(tarjeta).toBeVisible()
      expect(pagada.pago).not.toBeNull()
      await expect(
        tarjeta.getByText(
          new RegExp(`^Pagada el ${diaDe(pagada.pago?.fecha ?? "")} `)
        )
      ).toBeVisible()
      await expect(
        tarjeta.getByText(
          `Documento soporte ${pagada.documentoSoporte?.numero ?? ""}`
        )
      ).toBeVisible()
      await esperarSinDesbordeHorizontal(page)
    })

    await test.step("descarga el soporte de pago y el documento soporte (c1)", async () => {
      const soporte = await descargar(
        page,
        tarjeta.getByRole("button", { name: /^Soporte de pago del periodo / })
      )
      expect(soporte.nombre).toMatch(
        /^Soporte de pago \d{4}-\d{2}-\d{2} a \d{4}-\d{2}-\d{2}\.(pdf|png|jpg)$/
      )
      const documento = await descargar(
        page,
        tarjeta.getByRole("button", {
          name: /^Documento soporte del periodo /,
        })
      )
      expect(documento.nombre).toBe(
        `Documento soporte ${pagada.documentoSoporte?.numero}.pdf`
      )
      expect(documento.firma).toBe("%PDF-")
    })

    await test.step("el detalle trae la fecha, la referencia y el documento", async () => {
      await tarjeta.getByRole("link", { name: ENLACE_PERIODO }).click()
      await expect(page).toHaveURL(
        new RegExp(`${rutaLiquidacion(pagada.liquidacionId)}$`)
      )
      await expect(
        page.getByRole("heading", { level: 2, name: "Pago", exact: true })
      ).toBeVisible()
      await expect(page.getByText("Fecha de pago")).toBeVisible()
      if (pagada.pago?.referencia) {
        await expect(page.getByText(pagada.pago.referencia)).toBeVisible()
      }
      await expect(
        page.getByText(pagada.documentoSoporte?.numero ?? "", { exact: true })
      ).toBeVisible()
      const cuds = pagada.documentoSoporte?.cuds
      await expect(
        page.getByText(cuds ?? "Pendiente de transmisión a la DIAN", {
          exact: true,
        })
      ).toBeVisible()
      await expect(page.getByText("Neto que recibiste")).toBeVisible()
      await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
      await esperarSinDesbordeHorizontal(page)
    })
  })

  test("el medio que factura carga su factura desde «Carga tu factura» (D83)", async ({
    page,
  }) => {
    await ingresarComoMedio(page, { cuenta: "MEDIO_FACTURA", destino: RUTA })
    const tarjeta = tarjetaDe(page, porFacturar.liquidacionId)
    await expect(tarjeta.getByText("Aprobada · por pagar")).toBeVisible()
    await tarjeta.getByRole("link", { name: /^Carga tu factura/ }).click()
    await expect(page).toHaveURL(
      new RegExp(`${rutaLiquidacion(porFacturar.liquidacionId)}#factura$`)
    )

    const formulario = page.getByRole("form", { name: "Carga tu factura" })
    const numero = formulario.getByRole("textbox", {
      name: "Número de la factura",
    })

    await test.step("explica lo que falta junto a cada campo", async () => {
      await formulario.getByRole("button", { name: "Enviar factura" }).click()
      await expect(numero).toBeFocused()
      await expect(numero).toHaveAttribute("aria-invalid", "true")
      await expect(
        formulario.getByText("Escribe el número de tu factura.")
      ).toBeVisible()
      await expect(
        formulario.getByText("Adjunta el PDF de tu factura.")
      ).toBeVisible()
      await esperarSinDesbordeHorizontal(page)
    })

    await test.step("con número y PDF queda registrada", async () => {
      await numero.fill("fe-e2e 101")
      const [selector] = await Promise.all([
        page.waitForEvent("filechooser"),
        formulario.getByRole("button", { name: "Elegir archivo" }).click(),
      ])
      await selector.setFiles(
        await pdfDePrueba({
          titulo: "Factura electrónica FE-E2E 101",
          nombre: "factura-e2e.pdf",
        })
      )
      await expect(
        formulario.getByRole("button", {
          name: "Quitar el PDF factura-e2e.pdf",
        })
      ).toBeFocused()
      await formulario.getByRole("button", { name: "Enviar factura" }).click()

      const constancia = page.getByRole("status").filter({
        hasText: "Factura registrada",
      })
      await expect(constancia).toBeFocused({ timeout: 30_000 })
      await expect(constancia).toContainText("FE-E2E 101")
      await expect
        .poll(
          async () =>
            (await leerLiquidacionFinanzasE2E(porFacturar.liquidacionId))
              .facturaMedio?.numero ?? null
        )
        .toBe("FE-E2E 101")
    })

    await test.step("se descarga y se puede reemplazar mientras no se pague", async () => {
      const factura = await descargar(
        page,
        page.getByRole("button", { name: /^Tu factura del periodo / })
      )
      expect(factura.nombre).toBe("Factura FE-E2E 101.pdf")
      expect(factura.firma).toBe("%PDF-")
      await expect(
        page.getByRole("button", { name: "Reemplazar factura" })
      ).toBeVisible()
    })

    await test.step("en la lista ya no pide la factura", async () => {
      await page.goto(RUTA)
      const actualizada = tarjetaDe(page, porFacturar.liquidacionId)
      await expect(actualizada.getByText(/^Factura FE-E2E 101/)).toBeVisible()
      await expect(
        actualizada.getByRole("link", { name: /^Carga tu factura/ })
      ).toHaveCount(0)
    })
  })
})
