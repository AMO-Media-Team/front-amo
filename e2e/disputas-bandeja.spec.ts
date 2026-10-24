import { supabaseUrlDe } from "../scripts/bootstrap/produccion"
import { esBaseLocal } from "../scripts/bootstrap/validacion-e2e"
import { clienteDeLectura } from "./utilidades/datos-demo"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { PROYECTO_VALIDACION } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"
import {
  abrirDisputaE2E,
  asignacionListaParaVerificarE2E,
  asignacionValidacionE2E,
  ingresarComoOperaciones,
  leerDisputaE2E,
  mensajeDisputaE2E,
  restablecerValidacionE2E,
  vencerAsignacionE2E,
} from "./utilidades/validacion"

/**
 * Bandeja y ficha de disputas del equipo AMO (ADM-011, ADM-012; paquete DI)
 * contra `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet y móvil), con la sesión interna: la
 *   bandeja se abre sin desbordar la pantalla, con el resumen por estado y
 *   los filtros en la URL.
 * - Escribe (solo en el proyecto «validacion», en serie): sobre asignaciones
 *   del «Medio E2E» que preparan las fábricas del paquete E0 (campañas
 *   «Validación E2E»). OPERACIONES encuentra la disputa en la bandeja, abre
 *   el adjunto del medio, la toma en revisión, deja una nota interna y un
 *   mensaje, y la resuelve verificando la asignación; una vencida reclamada
 *   por el medio se reabre con plazo para la evidencia (solo base local); una
 *   disputa se cancela con causa y otra se descarta. Tras cada decisión el
 *   foco queda en el aviso del estado (el botón que abrió el diálogo ya no
 *   existe). `restablecerValidacionE2E()` limpia antes y después.
 */

const RUTA_BANDEJA = "/operacion/disputas"

/** Marca única por corrida para reconocer lo que escribe esta prueba. */
const MARCA = Date.now().toString(36)

/** Aviso del estado de la disputa (región nombrada por su título). */
function avisoEstado(page: Page, titulo: string | RegExp): Locator {
  return page.getByRole("region", { name: titulo, exact: true })
}

function hilo(page: Page): Locator {
  return page.getByRole("list", { name: "Mensajes de la disputa" })
}

function rutaFicha(disputaId: string): string {
  return `${RUTA_BANDEJA}/${disputaId}`
}

/** Elige el resultado, escribe la explicación y confirma en «Resolver la disputa». */
async function resolver(
  page: Page,
  {
    resultado,
    causa,
    explicacion,
  }: { resultado: string; causa?: string; explicacion: string }
): Promise<void> {
  await page.getByRole("button", { name: "Resolver", exact: true }).click()
  const dialogo = page.getByRole("dialog", { name: "Resolver la disputa" })
  await dialogo.getByRole("radio", { name: resultado }).click()
  if (causa) await dialogo.getByRole("radio", { name: causa }).click()
  await dialogo.getByLabel("Explicación de la decisión").fill(explicacion)
  await dialogo.getByRole("button", { name: "Resolver", exact: true }).click()
  await expect(dialogo).toBeHidden()
}

async function fechaLimitePublicacion(asignacionId: string): Promise<Date> {
  const { data, error } = await clienteDeLectura()
    .from("asignaciones")
    .select("estado, fecha_limite_publicacion")
    .eq("id", asignacionId)
    .single()
  if (error || !data.fecha_limite_publicacion) {
    throw new Error(`No se pudo leer la asignación ${asignacionId}.`)
  }
  return new Date(data.fecha_limite_publicacion)
}

test.describe("bandeja de disputas · solo lectura", () => {
  test.use({ storageState: sesion("interno") })

  test("la bandeja se abre con el resumen por estado y cabe en la pantalla", async ({
    page,
  }) => {
    await page.goto(RUTA_BANDEJA)
    await expect(
      page.getByRole("heading", { level: 1, name: "Disputas" })
    ).toBeVisible()
    const resumen = page.getByRole("region", { name: "Disputas por estado" })
    for (const grupo of [/^Abiertas: /, /^En revisión: /, /^Cerradas: /]) {
      await expect(resumen.getByRole("button", { name: grupo })).toBeVisible()
    }
    // En el celular la tabla genérica se pinta como lista de tarjetas.
    const bandeja = page.getByRole("region", { name: "Disputas", exact: true })
    await expect(
      bandeja
        .getByRole("table")
        .or(bandeja.getByRole("list"))
        .or(page.getByText("No hay disputas"))
        .first()
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })

  test("el filtro por estado viaja en la URL", async ({ page }) => {
    await page.goto(`${RUTA_BANDEJA}?estado=cerradas`)
    const cerradas = page
      .getByRole("region", { name: "Disputas por estado" })
      .getByRole("button", { name: /^Cerradas: / })
    await expect(cerradas).toHaveAttribute("aria-pressed", "true")
    await cerradas.click()
    await expect(page).toHaveURL(
      (url) => url.pathname === RUTA_BANDEJA && !url.searchParams.has("estado")
    )
    await expect(cerradas).toHaveAttribute("aria-pressed", "false")
  })
})

test.describe("disputas del equipo AMO", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 })

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_VALIDACION,
      "Abre y resuelve disputas del Medio E2E: corre solo en el proyecto «validacion», en serie."
    )
    await restablecerValidacionE2E()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_VALIDACION) return
    await restablecerValidacionE2E()
  })

  test("OPERACIONES la toma, deja una nota interna, responde y la resuelve verificando la asignación", async ({
    page,
  }) => {
    // 1. El anunciante disputa las métricas de una asignación lista para verificar
    //    y el medio responde con la captura del panel.
    const asignacion = await asignacionListaParaVerificarE2E()
    const descripcion = `El alcance reportado no coincide con lo que vemos (${MARCA}).`
    const disputaId = await abrirDisputaE2E({
      asignacionId: asignacion.asignacionId,
      como: "ANUNCIANTE",
      motivo: "METRICAS",
      descripcion,
    })
    const respuestaMedio = `Adjunto la captura del panel de estadísticas (${MARCA}).`
    await mensajeDisputaE2E({
      disputaId,
      como: "MEDIO",
      mensaje: respuestaMedio,
      adjunto: "imagen",
    })

    // 2. OPERACIONES la encuentra en la bandeja (buscando la oferta) y abre su ficha.
    await ingresarComoOperaciones(page, { destino: RUTA_BANDEJA })
    await page.goto(
      `${RUTA_BANDEJA}?${new URLSearchParams({ estado: "abiertas", q: asignacion.oferta.titulo })}`
    )
    const tabla = page.getByRole("table", { name: /^Disputas/ })
    await tabla
      .getByRole("link", { name: asignacion.medio.nombre, exact: true })
      .first()
      .click()
    await expect(page).toHaveURL((url) => url.pathname === rutaFicha(disputaId))
    await expect(
      page.getByRole("heading", { level: 1, name: asignacion.oferta.titulo })
    ).toBeVisible()
    await expect(avisoEstado(page, "Espera que alguien la tome")).toContainText(
      "La abrió el anunciante."
    )
    await expect(hilo(page)).toContainText(descripcion)
    await expect(hilo(page)).toContainText(respuestaMedio)

    // El adjunto del medio se firma y se ve al abrirlo.
    await hilo(page)
      .getByRole("button", { name: "Ver la imagen adjunta" })
      .click()
    const visor = page.getByRole("dialog", { name: "Imagen adjunta" })
    await expect(
      visor.getByRole("img", { name: "Imagen adjunta" })
    ).toBeVisible()
    await visor.getByRole("button", { name: "Cerrar" }).click()
    await expect(visor).toBeHidden()

    // 3. La toma en revisión: el botón desaparece y el foco va al estado nuevo.
    await page.getByRole("button", { name: "Tomar en revisión" }).click()
    const tomar = page.getByRole("alertdialog", {
      name: "¿Tomar la disputa en revisión?",
    })
    await tomar.getByRole("button", { name: "Tomar en revisión" }).click()
    await expect(tomar).toBeHidden()
    await expect(avisoEstado(page, "En revisión")).toBeFocused()
    expect((await leerDisputaE2E(disputaId)).estado).toBe("EN_REVISION")

    // En el celular la decisión queda tras la conversación, con un atajo.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(
      page.getByRole("link", { name: "Ir a la decisión" })
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)
    await page.setViewportSize({ width: 1440, height: 900 })

    // 4. Nota interna (solo el equipo) y mensaje para las partes.
    const nota = `Comparé la captura con el panel: cifras coherentes (${MARCA}).`
    await page
      .getByRole("checkbox", { name: "Nota interna: solo la ve el equipo AMO" })
      .click()
    const cajaNota = page.getByRole("form", { name: "Nueva nota interna" })
    await cajaNota.getByLabel("Nota interna", { exact: true }).fill(nota)
    await cajaNota.getByRole("button", { name: "Guardar nota" }).click()
    // El botón también tiene un estado (el indicador de envío): se busca el del resultado.
    await expect(
      cajaNota.getByRole("status").filter({ hasText: /\S/ })
    ).toHaveText("Nota interna guardada.")
    await expect(
      hilo(page).getByRole("listitem").filter({ hasText: nota })
    ).toContainText("Nota interna · Solo la ve el equipo AMO")

    // La marca de nota interna se conserva tras guardar: se quita para responder.
    await page
      .getByRole("checkbox", { name: "Nota interna: solo la ve el equipo AMO" })
      .click()
    const mensaje = `Revisamos la captura: verificaremos la publicación (${MARCA}).`
    const caja = page.getByRole("form", { name: "Responder en la disputa" })
    await caja.getByLabel("Mensaje", { exact: true }).fill(mensaje)
    await caja.getByRole("button", { name: "Enviar" }).click()
    await expect(caja.getByRole("status").filter({ hasText: /\S/ })).toHaveText(
      "Mensaje enviado."
    )
    await expect(hilo(page)).toContainText(mensaje)
    expect((await leerDisputaE2E(disputaId)).mensajes.slice(-2)).toMatchObject([
      { parte: "ADMIN", mensaje: nota, interno: true },
      { parte: "ADMIN", mensaje, interno: false },
    ])

    // 5. La resuelve verificando la asignación.
    await resolver(page, {
      resultado: "Verificar la asignación",
      explicacion: `Las cifras coinciden con la captura del panel (${MARCA}).`,
    })
    await expect(avisoEstado(page, "Resuelta: quedó verificada")).toBeFocused()
    await expect(avisoEstado(page, "Resuelta: quedó verificada")).toContainText(
      "Las cifras coinciden con la captura del panel"
    )
    expect(await leerDisputaE2E(disputaId)).toMatchObject({
      estado: "RESUELTA",
      estadoAsignacionResultante: "VERIFICADA",
    })
    // Cerrada: las partes ya no escriben y el equipo solo deja notas.
    await expect(
      page.getByRole("form", { name: "Nueva nota interna" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Resolver", exact: true })
    ).toHaveCount(0)
  })

  test("el reclamo de una vencida se reabre con plazo para la evidencia", async ({
    page,
  }) => {
    test.skip(
      !esBaseLocal(supabaseUrlDe()),
      "Vencer una asignación solo se puede en la base local."
    )
    const asignacion = await asignacionValidacionE2E({
      hasta: "CONTENIDO_ENTREGADO",
    })
    await vencerAsignacionE2E({ asignacionId: asignacion.asignacionId })
    const disputaId = await abrirDisputaE2E({
      asignacionId: asignacion.asignacionId,
      como: "MEDIO",
      motivo: "OTRO",
      descripcion: `Sí publiqué y no se registró (${MARCA}).`,
    })

    await ingresarComoOperaciones(page, { destino: rutaFicha(disputaId) })
    await expect(avisoEstado(page, "Espera que alguien la tome")).toContainText(
      "para reclamar una asignación vencida"
    )

    await page.getByRole("button", { name: "Resolver", exact: true }).click()
    const dialogo = page.getByRole("dialog", { name: "Resolver la disputa" })
    const reabrir = dialogo.getByRole("radio", {
      name: "Reabrir la publicación",
    })
    await expect(reabrir).toHaveAccessibleDescription(
      /tiene 24 horas para cargar la evidencia/
    )
    await reabrir.click()
    await dialogo
      .getByRole("button", {
        name: "El medio demostró que publicó a tiempo: la evidencia no se registró por un error.",
      })
      .click()
    const antes = Date.now()
    await dialogo.getByRole("button", { name: "Resolver", exact: true }).click()
    await expect(dialogo).toBeHidden()

    const reabierta = avisoEstado(page, "Resuelta: se reabrió la publicación")
    await expect(reabierta).toBeFocused()
    await expect(reabierta).toContainText("El medio tiene hasta el")
    expect(await leerDisputaE2E(disputaId)).toMatchObject({
      estado: "RESUELTA",
      estadoAsignacionOrigen: "VENCIDA_SIN_PUBLICAR",
      estadoAsignacionResultante: "CONTENIDO_ENTREGADO",
    })
    // ADM-012 c1: al menos 24 horas para cargar la evidencia.
    const limite = await fechaLimitePublicacion(asignacion.asignacionId)
    expect(limite.getTime()).toBeGreaterThanOrEqual(
      antes + 24 * 3_600_000 - 60_000
    )
  })

  test("cancelar exige la causa y descartar restaura el estado previo", async ({
    page,
  }) => {
    // Cancelación con causa.
    const aCancelar = await asignacionValidacionE2E({
      hasta: "EVIDENCIA_VALIDADA",
    })
    const disputaCancelar = await abrirDisputaE2E({
      asignacionId: aCancelar.asignacionId,
      como: "ANUNCIANTE",
      motivo: "CONTENIDO",
      descripcion: `La publicación no usa el creativo entregado (${MARCA}).`,
    })
    await ingresarComoOperaciones(page, { destino: rutaFicha(disputaCancelar) })
    await page.getByRole("button", { name: "Resolver", exact: true }).click()
    const dialogo = page.getByRole("dialog", { name: "Resolver la disputa" })
    await dialogo.getByRole("radio", { name: "Cancelar la asignación" }).click()
    await dialogo
      .getByLabel("Explicación de la decisión")
      .fill(`El medio publicó otra pieza (${MARCA}).`)
    await dialogo.getByRole("button", { name: "Resolver", exact: true }).click()
    await expect(dialogo.getByRole("alert")).toHaveText(
      "Elige la causa de la cancelación."
    )
    await dialogo
      .getByRole("radio", { name: "Incumplimiento del medio" })
      .click()
    await dialogo.getByRole("button", { name: "Resolver", exact: true }).click()
    await expect(dialogo).toBeHidden()
    const cancelada = avisoEstado(page, "Resuelta: se canceló la asignación")
    await expect(cancelada).toBeFocused()
    await expect(cancelada).toContainText("Causa: incumplimiento del medio.")
    expect(
      (await leerDisputaE2E(disputaCancelar)).estadoAsignacionResultante
    ).toBe("CANCELADA")

    // Descarte: la asignación vuelve al estado que tenía al abrirse.
    const aDescartar = await asignacionValidacionE2E({ hasta: "PUBLICADA" })
    const disputaDescartar = await abrirDisputaE2E({
      asignacionId: aDescartar.asignacionId,
      como: "MEDIO",
      motivo: "PAGO",
      descripcion: `No entiendo cuánto voy a recibir (${MARCA}).`,
    })
    await page.goto(rutaFicha(disputaDescartar))
    await page.getByRole("button", { name: "Descartar" }).click()
    const descartar = page.getByRole("alertdialog", {
      name: "¿Descartar la disputa?",
    })
    await descartar
      .getByRole("button", {
        name: "Las partes ya lo aclararon en la conversación.",
      })
      .click()
    await descartar.getByRole("button", { name: "Descartar" }).click()
    await expect(descartar).toBeHidden()
    await expect(avisoEstado(page, "Descartada")).toBeFocused()
    await expect(avisoEstado(page, "Descartada")).toContainText(
      "la asignación volvió a «publicada»"
    )
    expect(await leerDisputaE2E(disputaDescartar)).toMatchObject({
      estado: "DESCARTADA",
      estadoAsignacionResultante: "PUBLICADA",
    })
  })
})
