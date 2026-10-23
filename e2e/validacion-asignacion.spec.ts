import { clienteDeLectura } from "./utilidades/datos-demo"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { MEDIO_SUSPENSION } from "./utilidades/medios"
import { leerAsignacionE2E } from "./utilidades/pauta"
import { PROYECTO_MOVIL, PROYECTO_VALIDACION } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"
import {
  asignacionConMetricaPendienteE2E,
  asignacionValidacionE2E,
  restablecerValidacionE2E,
  rutaFichaAsignacion,
} from "./utilidades/validacion"

/**
 * Ficha de la asignación del equipo AMO (ADM-010, ADM-011, INT-003/004,
 * INT-006; paquete AS) contra `pnpm build && pnpm start`.
 *
 * - Solo lectura (escritorio, tablet y móvil), con la sesión interna (ADMIN)
 *   sobre asignaciones demo: la gestión va en la cabecera desde `sm` y en el
 *   pie fijo del celular; los diálogos de cancelar y de abrir disputa se
 *   abren y se cierran sin escribir; una liquidada explica que hay que anular
 *   antes la liquidación; el filtro «Con alertas» de la lista carga.
 * - Escribe (solo en el proyecto «validacion», en serie), con las fábricas de
 *   la fase: cancela por fraude una asignación publicada del «Medio
 *   Suspensión E2E» y lo suspende en la misma acción (el foco queda en el aviso
 *   del estado); abre una disputa sobre una verificada del «Medio E2E» y la
 *   ficha enlaza a ella y explica por qué ya no se cancela; una métrica con
 *   alerta por múltiplo de seguidores se distingue en la ficha y en el filtro
 *   de la lista. Antes y después, `restablecerValidacionE2E()` limpia las
 *   campañas «Validación E2E» y reactiva al medio.
 */

const RUTA_DISPUTA = /\/operacion\/disputas\/[0-9a-f-]{36}$/

/**
 * Una asignación demo en ese estado (no de las fábricas E2E) de un medio
 * verificado: al cancelar por fraude se ofrece suspenderlo.
 */
async function asignacionDemo(
  estado: "PUBLICADA" | "LIQUIDADA"
): Promise<string> {
  const { data, error } = await clienteDeLectura()
    .from("asignaciones")
    .select(
      "id, campana:campanas!inner ( nombre ), medio:medios!inner ( estado )"
    )
    .eq("estado", estado)
    .eq("medio.estado", "VERIFICADO")
    .not("campana.nombre", "ilike", "%E2E%")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()
  if (error) {
    throw new Error(`No hay una asignación demo ${estado}: ${error.message}`)
  }
  return data.id
}

/** Aviso del estado de la asignación (región nombrada por su título). */
function avisoEstado(page: Page, titulo: string | RegExp): Locator {
  return page.getByRole("region", { name: titulo })
}

/** El pie fijo de acciones del celular. */
function pieAcciones(page: Page): Locator {
  return page.getByRole("region", { name: "Acciones de la asignación" })
}

async function estadoMedio(medioId: string): Promise<string> {
  const { data, error } = await clienteDeLectura()
    .from("medios")
    .select("estado")
    .eq("id", medioId)
    .single()
  if (error) throw new Error(`No se pudo leer el medio: ${error.message}`)
  return data.estado
}

test.describe("ficha de la asignación · solo lectura", () => {
  test.use({ storageState: sesion("interno") })

  test("la gestión va en la cabecera y, en el celular, en el pie fijo", async ({
    page,
  }, info) => {
    await page.goto(rutaFichaAsignacion(await asignacionDemo("PUBLICADA")))
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const movil = info.project.name === PROYECTO_MOVIL
    if (movil) {
      await expect(pieAcciones(page)).toBeVisible()
    } else {
      await expect(pieAcciones(page)).toBeHidden()
    }
    // Una sola copia visible de cada acción, donde corresponde.
    const cancelar = page.getByRole("button", { name: "Cancelar asignación" })
    const disputar = page.getByRole("button", { name: "Abrir disputa" })
    await expect(cancelar).toHaveCount(1)
    await expect(disputar).toHaveCount(1)
    if (movil) {
      await expect(pieAcciones(page)).toContainText("Cancelar asignación")
      await expect(pieAcciones(page)).toContainText("Abrir disputa")
    }
    await esperarSinDesbordeHorizontal(page)

    await test.step("el diálogo de cancelar explica y se cierra sin escribir", async () => {
      await cancelar.click()
      const dialogo = page.getByRole("dialog", {
        name: "¿Cancelar la asignación?",
      })
      await expect(
        dialogo.getByRole("list", { name: "Qué pasa al cancelar" })
      ).toContainText("Libera el cupo y el presupuesto de la oferta.")
      await expect(dialogo.getByRole("radio")).toHaveCount(4)
      await dialogo.getByRole("radio", { name: "Fraude" }).click()
      await expect(
        dialogo.getByRole("checkbox", { name: /^Suspender también a / })
      ).toBeVisible()
      await dialogo.getByRole("button", { name: "Volver" }).click()
      await expect(dialogo).toBeHidden()
      await expect(cancelar).toBeFocused()
    })

    await test.step("el de abrir disputa también", async () => {
      await disputar.click()
      const dialogo = page.getByRole("dialog", { name: "¿Abrir una disputa?" })
      await expect(dialogo.getByRole("radio")).toHaveCount(6)
      await dialogo.getByRole("button", { name: "Abrir disputa" }).click()
      await expect(
        dialogo.getByRole("radiogroup", { name: "Motivo" })
      ).toHaveAccessibleDescription("Elige el motivo de la disputa.")
      await dialogo.getByRole("button", { name: "Volver" }).click()
      await expect(dialogo).toBeHidden()
    })
  })

  test("una liquidada no se cancela: hay que anular antes la liquidación", async ({
    page,
  }) => {
    await page.goto(rutaFichaAsignacion(await asignacionDemo("LIQUIDADA")))
    const cancelar = page.getByRole("button", { name: "Cancelar asignación" })
    await expect(cancelar).toHaveAccessibleDescription(
      /anula primero la liquidación/
    )
    await cancelar.click()
    const bloqueo = page.getByRole("alertdialog", {
      name: "No se puede cancelar ahora",
    })
    await expect(bloqueo).toContainText("anula primero la liquidación")
    await bloqueo.getByRole("button", { name: "Entendido" }).click()
    await expect(bloqueo).toBeHidden()
    await expect(
      page.getByRole("button", { name: "Abrir disputa" })
    ).toHaveCount(0)
  })

  test("el filtro «Con alertas» de la lista carga sin errores", async ({
    page,
  }) => {
    await page.goto("/operacion/asignaciones?alerta=metricas")
    await expect(
      page.getByRole("heading", { level: 1, name: "Asignaciones" })
    ).toBeVisible()
    // La paginación siempre está (con «Sin resultados» si no hay ninguna).
    await expect(
      page.getByRole("navigation", { name: "Paginación de la tabla" })
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })
})

test.describe("gestión de la asignación", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 })
  test.use({ storageState: sesion("interno") })

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_VALIDACION,
      "Cancela asignaciones y suspende un medio compartido: corre solo en el proyecto «validacion», en serie."
    )
    info.setTimeout(120_000)
    await restablecerValidacionE2E()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_VALIDACION) return
    info.setTimeout(120_000)
    await restablecerValidacionE2E()
  })

  test("cancela por fraude y suspende al medio en la misma acción (ADM-010, INT-006)", async ({
    page,
  }) => {
    const asignacion = await asignacionValidacionE2E({
      hasta: "PUBLICADA",
      medio: MEDIO_SUSPENSION,
    })
    await page.goto(rutaFichaAsignacion(asignacion.asignacionId))
    await expect(
      page.getByRole("heading", { level: 1, name: asignacion.oferta.titulo })
    ).toBeVisible()

    await page.getByRole("button", { name: "Cancelar asignación" }).click()
    const dialogo = page.getByRole("dialog", {
      name: "¿Cancelar la asignación?",
    })
    // Sin causa no se envía: el error queda asociado al grupo.
    await dialogo.getByRole("button", { name: "Cancelar asignación" }).click()
    await expect(
      dialogo.getByRole("radiogroup", { name: "Causa" })
    ).toHaveAccessibleDescription("Elige la causa de la cancelación.")

    await dialogo.getByRole("radio", { name: "Fraude" }).click()
    await dialogo
      .getByRole("button", {
        name: /La publicación no existe o no es de la cuenta registrada/,
      })
      .click()
    await expect(dialogo.getByLabel("Motivo")).toHaveValue(
      "La publicación no existe o no es de la cuenta registrada."
    )
    await dialogo
      .getByRole("checkbox", {
        name: `Suspender también a ${MEDIO_SUSPENSION.nombre}`,
      })
      .click()
    await dialogo.getByRole("button", { name: "Cancelar asignación" }).click()
    await expect(dialogo).toBeHidden()

    const aviso = avisoEstado(page, "Cancelada por AMO · Fraude")
    await expect(aviso).toBeVisible()
    // El botón que abrió el diálogo ya no existe: el foco va al estado nuevo.
    await expect(aviso).toBeFocused()
    await expect(aviso).toContainText(
      "La publicación no existe o no es de la cuenta registrada."
    )
    await expect(aviso).toContainText("el medio no recibe el pago")
    await expect(page.getByText("Medio suspendido")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Cancelar asignación" })
    ).toHaveCount(0)

    expect((await leerAsignacionE2E(asignacion.asignacionId)).estado).toBe(
      "CANCELADA"
    )
    expect(await estadoMedio(MEDIO_SUSPENSION.id)).toBe("SUSPENDIDO")
  })

  test("abre una disputa sobre una verificada y la ficha enlaza a ella (ADM-011)", async ({
    page,
  }) => {
    const asignacion = await asignacionValidacionE2E({ hasta: "VERIFICADA" })
    await page.goto(rutaFichaAsignacion(asignacion.asignacionId))

    await page.getByRole("button", { name: "Abrir disputa" }).click()
    const dialogo = page.getByRole("dialog", { name: "¿Abrir una disputa?" })
    await dialogo.getByRole("radio", { name: "Métricas" }).click()
    const descripcion = dialogo.getByLabel("Qué pasó")
    await descripcion.fill("Corto")
    await dialogo.getByRole("button", { name: "Abrir disputa" }).click()
    await expect(descripcion).toHaveAccessibleDescription(/al menos 10/)
    await descripcion.fill(
      "El alcance del corte de 24 horas no coincide con la captura del panel."
    )
    await dialogo.getByRole("button", { name: "Abrir disputa" }).click()
    await expect(dialogo).toBeHidden()

    const aviso = avisoEstado(page, "En disputa")
    await expect(aviso).toBeVisible()
    await expect(aviso).toBeFocused()
    await expect(aviso).toContainText("Estaba en «verificada»")
    await expect(
      aviso.getByRole("link", { name: "Ver la disputa" })
    ).toHaveAttribute("href", RUTA_DISPUTA)
    await expect(
      page.getByRole("link", { name: "Disputa por métricas" })
    ).toHaveAttribute("href", RUTA_DISPUTA)
    expect((await leerAsignacionE2E(asignacion.asignacionId)).estado).toBe(
      "EN_DISPUTA"
    )

    // Ya no se abre otra; cancelarla se explica (se cancela al resolverla).
    await expect(
      page.getByRole("button", { name: "Abrir disputa" })
    ).toHaveCount(0)
    await page.getByRole("button", { name: "Cancelar asignación" }).click()
    const bloqueo = page.getByRole("alertdialog", {
      name: "No se puede cancelar ahora",
    })
    await expect(bloqueo).toContainText("se cancela al resolver la disputa")
    await expect(
      bloqueo.getByRole("link", { name: "Ver la disputa" })
    ).toHaveAttribute("href", RUTA_DISPUTA)
    await bloqueo.getByRole("button", { name: "Entendido" }).click()
    await expect(bloqueo).toBeHidden()
  })

  test("una métrica con alerta se distingue en la ficha y en el filtro de la lista (INT-004)", async ({
    page,
  }) => {
    const metrica = await asignacionConMetricaPendienteE2E({ conAlerta: true })
    expect(metrica.alerta.multiplo).toBe(true)

    await page.goto(rutaFichaAsignacion(metrica.asignacionId))
    await expect(page.getByText("1 métrica con alerta")).toBeVisible()

    await page.goto("/operacion/asignaciones?alerta=metricas")
    await expect(
      page
        .getByRole("region", { name: "Asignaciones", exact: true })
        .locator(`a[href="${rutaFichaAsignacion(metrica.asignacionId)}"]`)
        .filter({ visible: true })
        .first()
    ).toBeVisible()
  })
})
