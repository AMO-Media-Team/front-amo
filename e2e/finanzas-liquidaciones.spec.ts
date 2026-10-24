import { pdfDePrueba } from "./utilidades/archivos"
import {
  asignacionVerificadaFinanzasE2E,
  type CampanaFinanzas,
  campanaFinanzasE2E,
  ingresarComoFinanzas,
  leerLiquidacionFinanzasE2E,
  liquidacionFinanzasE2E,
  type LiquidacionFinanzas,
  MEDIOS_DE_FINANZAS,
  restablecerFinanzasE2E,
} from "./utilidades/finanzas"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { PROYECTO_FINANZAS } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"

/**
 * Liquidaciones de Finanzas (LIQ-001, LIQ-002, LIQ-003, LIQ-004 factura del
 * medio, LIQ-007; paquete LQ) contra `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet y móvil), con la sesión interna (ADMIN):
 *   las cinco vistas con su contador van en la URL, «Generar corte» propone el
 *   último periodo cerrado y dice cuántos medios entran (se cancela: un corte
 *   real liquidaría también a los medios de la demo), y la ficha de una
 *   pagada muestra montos, retenciones y pago sin desbordar la pantalla.
 * - Escribe (solo en el proyecto «finanzas», en serie, 1.440 px), con los
 *   medios de las fábricas de la fase:
 *   - Finanzas liquida el «Medio Finanzas E2E» desde «Por liquidar» con el
 *     periodo que termina hoy (lo verificado hoy solo entra así): abre su
 *     ficha en borrador, que no puede aprobar porque la generó (D17), ni
 *     elegir en «Por aprobar»; la anula con motivo y el medio vuelve a «Por
 *     liquidar» (LIQ-007).
 *   - Aprueba en lote el borrador del «Medio Factura E2E» que generó el ADMIN
 *     E2E y ve el resultado por liquidación (LIQ-003).
 *   - Registra por el medio que factura su factura (número y PDF): la ficha
 *     queda lista para el pago (LIQ-004).
 *   Antes y después, `restablecerFinanzasE2E()` limpia lo de Finanzas.
 */

const RUTA = "/finanzas/liquidaciones"
const MEDIO_FINANZAS = MEDIOS_DE_FINANZAS.MEDIO_FINANZAS
const MEDIO_FACTURA = MEDIOS_DE_FINANZAS.MEDIO_FACTURA

function rutaVista(vista: string, q?: string): string {
  const parametros = new URLSearchParams({ vista })
  if (q) parametros.set("q", q)
  return `${RUTA}?${parametros.toString()}`
}

/** Hoy en Bogotá (`AAAA-MM-DD`), como lo calcula la app. */
function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function vistas(page: Page): Locator {
  return page.getByRole("navigation", { name: "Vistas de liquidaciones" })
}

/** Lo que tiene el foco: tras decidir nunca debe quedar en `<body>`. */
function enfocado(page: Page): Locator {
  return page.locator(":focus")
}

async function estado(liquidacionId: string): Promise<string> {
  return (await leerLiquidacionFinanzasE2E(liquidacionId)).estado
}

test.describe("liquidaciones · solo lectura", () => {
  test.use({ storageState: sesion("interno") })

  test("las cinco vistas van en la URL con su contador y caben en la pantalla", async ({
    page,
  }) => {
    await page.goto(RUTA)
    await expect(
      page.getByRole("heading", { level: 1, name: "Liquidaciones" })
    ).toBeVisible()
    await expect(vistas(page).getByRole("link")).toHaveCount(5)
    await expect(
      vistas(page).getByRole("link", { name: /^Por liquidar: / })
    ).toHaveAttribute("aria-current", "page")
    await expect(
      page.getByRole("heading", { level: 2, name: "Por liquidar" })
    ).toBeVisible()
    await expect(
      page
        .getByRole("table", { name: "Medios por liquidar" })
        .or(page.getByText("No hay nada por liquidar"))
        .first()
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)

    for (const [nombre, vista, titulo] of [
      ["Por aprobar", "borrador", "Por aprobar"],
      ["Aprobadas", "aprobadas", "Aprobadas"],
      ["Pagadas", "pagadas", "Pagadas"],
      ["Anuladas", "anuladas", "Anuladas"],
    ] as const) {
      await test.step(nombre, async () => {
        await vistas(page)
          .getByRole("link", { name: new RegExp(`^${nombre}: `) })
          .click()
        await expect(page).toHaveURL(new RegExp(`[?&]vista=${vista}\\b`))
        await expect(
          page.getByRole("heading", { level: 2, name: titulo })
        ).toBeVisible()
        await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
        await esperarSinDesbordeHorizontal(page)
      })
    }
  })

  test("«Generar corte» propone el último periodo cerrado y dice cuántos medios entran", async ({
    page,
  }) => {
    await page.goto(rutaVista("pendientes"))
    const generar = page.getByRole("button", { name: "Generar corte" })
    await expect(generar).toBeVisible()
    test.skip(
      await generar.isDisabled(),
      "La base no tiene medios con verificadas por liquidar."
    )
    await generar.click()
    const dialogo = page.getByRole("dialog", { name: "Generar el corte" })
    await expect(dialogo.getByLabel("Primer día")).toHaveValue(
      /^\d{4}-\d{2}-\d{2}$/
    )
    await expect(dialogo.getByLabel("Último día")).toHaveValue(
      /^\d{4}-\d{2}-\d{2}$/
    )
    await expect(
      dialogo
        .getByText(/entran? en el corte/)
        .or(dialogo.getByText("Ningún medio tiene asignaciones verificadas"))
        .first()
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)
    // No se genera: liquidaría también a los medios de la demo.
    await dialogo.getByRole("button", { name: "Cancelar" }).click()
    await expect(dialogo).toBeHidden()
  })

  test("la ficha de una pagada muestra montos, retenciones y pago", async ({
    page,
  }) => {
    await page.goto(rutaVista("pagadas"))
    const tabla = page.getByRole("table", { name: "Liquidaciones pagadas" })
    const vacia = page.getByText("Aún no hay liquidaciones pagadas")
    await expect(tabla.or(vacia).first()).toBeVisible()
    test.skip(
      await vacia.isVisible(),
      "La base no tiene liquidaciones pagadas."
    )

    // En el teléfono la tabla se ve como tarjetas: se abre la primera ficha.
    await page
      .getByRole("link", { name: /, periodo / })
      .filter({ visible: true })
      .first()
      .click()
    await expect(page).toHaveURL(/\/finanzas\/liquidaciones\/[0-9a-f-]{36}$/)
    await expect(page.getByRole("region", { name: /^Pagada/ })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Montos" })).toBeVisible()
    await expect(page.getByText("Neto a pagar")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Pago" })).toBeVisible()
    await expect(page.getByText("Fecha de pago")).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Asignaciones incluidas" })
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })
})

test.describe("liquidaciones · decisiones de Finanzas", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 })

  let campana: CampanaFinanzas
  let borradorFactura: LiquidacionFinanzas

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_FINANZAS,
      "Liquida y aprueba con los medios de Finanzas: corre solo en el proyecto «finanzas», en serie."
    )
    info.setTimeout(180_000)
    await restablecerFinanzasE2E()
    campana = await campanaFinanzasE2E()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_FINANZAS) return
    info.setTimeout(120_000)
    await restablecerFinanzasE2E()
  })

  test("liquida un medio, no puede aprobar lo que generó (D17) y lo anula con motivo", async ({
    page,
  }) => {
    await asignacionVerificadaFinanzasE2E({
      medio: "MEDIO_FINANZAS",
      campanaId: campana.id,
    })
    await ingresarComoFinanzas(page, {
      destino: rutaVista("pendientes", MEDIO_FINANZAS.nombre),
    })
    const tabla = page.getByRole("table", { name: "Medios por liquidar" })
    const fila = tabla.getByRole("row", {
      name: new RegExp(MEDIO_FINANZAS.nombre),
    })
    await expect(fila.getByText("Documento soporte")).toBeVisible()

    await fila
      .getByRole("button", { name: `Liquidar ${MEDIO_FINANZAS.nombre}` })
      .click()
    const dialogo = page.getByRole("dialog", {
      name: `Liquidar ${MEDIO_FINANZAS.nombre}`,
    })
    // Lo verificado hoy solo entra con un periodo que termina hoy.
    const hoy = hoyBogota()
    await dialogo.getByLabel("Primer día").fill(hoy)
    await dialogo.getByLabel("Último día").fill(hoy)
    await dialogo
      .getByRole("button", { name: "Generar la liquidación" })
      .click()

    await expect(page).toHaveURL(/\/finanzas\/liquidaciones\/[0-9a-f-]{36}$/)
    const liquidacionId = new URL(page.url()).pathname.split("/").pop()!
    await expect(
      page.getByRole("heading", { level: 1, name: MEDIO_FINANZAS.nombre })
    ).toBeVisible()
    const aviso = page.getByRole("region", {
      name: "En borrador: falta aprobarla",
    })
    await expect(
      aviso.getByText(
        "La generaste tú: otra persona del equipo debe aprobarla."
      )
    ).toBeVisible()
    const aprobar = page.getByRole("button", { name: "Aprobar" })
    await expect(aprobar).toBeDisabled()
    await expect(aprobar).toHaveAccessibleDescription(
      "La generaste tú: otra persona del equipo debe aprobarla."
    )
    expect(await estado(liquidacionId)).toBe("BORRADOR")

    await test.step("en «Por aprobar» tampoco se puede elegir", async () => {
      await page.goto(rutaVista("borrador", MEDIO_FINANZAS.nombre))
      await expect(
        page
          .getByRole("table", { name: "Liquidaciones por aprobar" })
          .getByRole("checkbox", {
            name: `No puedes aprobar la liquidación de ${MEDIO_FINANZAS.nombre}: la generaste tú`,
          })
      ).toHaveAttribute("aria-disabled", "true")
    })

    await test.step("la anula con motivo y vuelve a «Por liquidar»", async () => {
      await page.goto(`${RUTA}/${liquidacionId}`)
      await page.getByRole("button", { name: "Anular" }).click()
      const anular = page.getByRole("alertdialog", {
        name: "¿Anular la liquidación?",
      })
      await anular
        .getByRole("textbox", { name: "Motivo" })
        .fill("Prueba E2E: el corte se generó con un periodo equivocado.")
      await anular.getByRole("button", { name: "Anular" }).click()
      await expect.poll(() => estado(liquidacionId)).toBe("ANULADA")
      await expect(enfocado(page)).toHaveAttribute("id", "estado-liquidacion")
      await expect(
        page.getByRole("region", { name: /^Anulada el / })
      ).toBeVisible()

      await page.goto(rutaVista("pendientes", MEDIO_FINANZAS.nombre))
      await expect(
        page
          .getByRole("table", { name: "Medios por liquidar" })
          .getByRole("row", { name: new RegExp(MEDIO_FINANZAS.nombre) })
      ).toBeVisible()
    })
  })

  test("aprueba en lote el borrador que generó otra persona (LIQ-003)", async ({
    page,
  }) => {
    borradorFactura = await liquidacionFinanzasE2E({
      medio: "MEDIO_FACTURA",
      hasta: "BORRADOR",
      campanaId: campana.id,
    })
    await ingresarComoFinanzas(page, {
      destino: rutaVista("borrador", MEDIO_FACTURA.nombre),
    })
    const tabla = page.getByRole("table", { name: "Liquidaciones por aprobar" })
    await tabla
      .getByRole("checkbox", {
        name: `Seleccionar la liquidación de ${MEDIO_FACTURA.nombre}`,
      })
      .click()
    await page
      .getByRole("region", { name: "Acciones sobre la selección" })
      .getByRole("button", { name: "Aprobar" })
      .click()
    const dialogo = page.getByRole("dialog", {
      name: "¿Aprobar 1 liquidación?",
    })
    await dialogo.getByRole("button", { name: "Aprobar" }).click()

    const resultado = page.getByRole("dialog", {
      name: "Resultado de la aprobación",
    })
    await expect(resultado.getByText("Se aprobó 1 liquidación.")).toBeVisible()
    await expect(
      resultado.getByRole("heading", { name: "Resultado de la aprobación" })
    ).toBeFocused()
    expect(await estado(borradorFactura.liquidacionId)).toBe("APROBADA")
    await resultado.getByRole("button", { name: "Listo" }).click()
    await expect(
      page.getByRole("heading", { level: 2, name: "Por aprobar" })
    ).toBeFocused()
  })

  test("registra la factura del medio que factura y queda lista para pagar (LIQ-004)", async ({
    page,
  }) => {
    test.skip(!borradorFactura, "Depende de la aprobación anterior.")
    await ingresarComoFinanzas(page, {
      destino: `${RUTA}/${borradorFactura.liquidacionId}`,
    })
    await expect(
      page
        .getByRole("region", { name: /^Aprobada/ })
        .getByText("Falta la factura del medio para poder pagarla.")
    ).toBeVisible()
    await page.getByRole("button", { name: "Registrar la factura" }).click()
    const dialogo = page.getByRole("dialog", {
      name: `Registrar la factura de ${MEDIO_FACTURA.nombre}`,
    })
    await dialogo.getByLabel("Número de la factura").fill("fe-e2e-101")
    const [selector] = await Promise.all([
      page.waitForEvent("filechooser"),
      dialogo.getByRole("button", { name: "Elegir archivo" }).click(),
    ])
    await selector.setFiles(
      await pdfDePrueba({ titulo: "Factura E2E", nombre: "factura-e2e.pdf" })
    )
    await expect(dialogo.getByText("factura-e2e.pdf")).toBeVisible()
    await dialogo.getByRole("button", { name: "Registrar la factura" }).click()
    await expect(dialogo).toBeHidden({ timeout: 30_000 })

    await expect
      .poll(
        async () =>
          (await leerLiquidacionFinanzasE2E(borradorFactura.liquidacionId))
            .facturaMedio?.numero ?? null
      )
      .toBe("FE-E2E-101")
    await expect(page.getByText("FE-E2E-101", { exact: true })).toBeVisible()
    await expect(
      page
        .getByRole("region", { name: /^Aprobada/ })
        .getByText("Lista para el archivo de pagos y el registro del pago.")
    ).toBeVisible()
    await expect(
      page.getByRole("button", {
        name: "Descargar PDF de la factura del medio",
      })
    ).toBeVisible()
  })
})
