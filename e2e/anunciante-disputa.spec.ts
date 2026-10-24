import { ingresarComoAnunciante } from "./utilidades/anunciantes"
import { pdfDePrueba } from "./utilidades/archivos"
import { clienteDeLectura } from "./utilidades/datos-demo"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { MEDIO_VERIFICADO } from "./utilidades/medios"
import {
  borrarPautaE2E,
  leerAsignacionE2E,
  PREFIJO_PAUTA_ANUNCIANTE,
} from "./utilidades/pauta"
import { PROYECTO_ANUNCIANTE } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import {
  abrirDisputaE2E,
  asignacionValidacionE2E,
  leerDisputaE2E,
  mensajeDisputaE2E,
  MOTIVO_RESOLUCION,
  resolverDisputaE2E,
} from "./utilidades/validacion"

/**
 * Disputas del anunciante (paquete DX de la fase 4, ADM-011) contra `pnpm
 * build && pnpm start`, solo en el proyecto «anunciante» (en serie), con
 * «Anunciante E2E» y asignaciones del «Medio E2E» en campañas «Seguimiento
 * E2E…» (las borra `borrarPautaE2E` con ese prefijo, no la limpieza del equipo
 * AMO):
 *
 * - Desde el seguimiento, «Reportar un problema» en un estado disputable: los
 *   motivos del anunciante (Incumplimiento, Métricas, Contenido, Permanencia,
 *   Otro), el aviso «Mientras dure la disputa, esta publicación no se verifica
 *   ni se liquida. Lo que escribas lo verán el medio y el equipo AMO.» y una
 *   prueba en PDF como primer mensaje; al enviar, el foco pasa al estado y la
 *   tarjeta dice «En disputa» con «Ver la disputa». Las migas de la página
 *   llevan de vuelta a la tarjeta del seguimiento.
 * - La disputa que abrió el medio: la empresa la ve con el nombre del medio,
 *   le responde y, cancelada la asignación, ve el resultado en su voz (no se
 *   le cobra) con la conversación cerrada.
 */

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function rutaDisputa(campanaId: string, asignacionId: string): string {
  return `/campanas/${campanaId}/asignaciones/${asignacionId}/disputa`
}

function rutaSeguimiento(campanaId: string, asignacionId: string): string {
  return `/campanas/${campanaId}?pestana=seguimiento&asignacion=${asignacionId}`
}

function tarjetaDelMedio(page: Page): Locator {
  return page
    .getByRole("tabpanel", { name: "Seguimiento" })
    .getByRole("article", { name: MEDIO_VERIFICADO.nombre, exact: true })
}

function conversacion(page: Page): Locator {
  return page.getByRole("region", { name: "Conversación" })
}

async function ultimaDisputa(asignacionId: string): Promise<string> {
  const { data, error } = await clienteDeLectura()
    .from("disputas")
    .select("id")
    .eq("asignacion_id", asignacionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()
  if (error) {
    throw new Error(
      `No se pudo leer la disputa de ${asignacionId}: ${error.message}`
    )
  }
  return data.id
}

test.describe("disputas del anunciante", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 })

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_ANUNCIANTE,
      "Abre disputas del Anunciante E2E: corre solo en el proyecto «anunciante», en serie."
    )
    info.setTimeout(120_000)
    await borrarPautaE2E({ prefijo: PREFIJO_PAUTA_ANUNCIANTE })
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_ANUNCIANTE) return
    await borrarPautaE2E({ prefijo: PREFIJO_PAUTA_ANUNCIANTE })
  })

  test("reportar un problema desde el seguimiento: motivos, aviso, prueba en PDF y «En disputa»", async ({
    page,
  }) => {
    const asignacion = await asignacionValidacionE2E({
      hasta: "METRICAS_CARGADAS",
      prefijo: PREFIJO_PAUTA_ANUNCIANTE,
    })
    const campanaId = asignacion.campana.id
    const ruta = rutaDisputa(campanaId, asignacion.asignacionId)

    await ingresarComoAnunciante(page, {
      destino: rutaSeguimiento(campanaId, asignacion.asignacionId),
    })
    const tarjeta = tarjetaDelMedio(page)
    const reportar = tarjeta.getByRole("link", {
      name: `Reportar un problema de ${MEDIO_VERIFICADO.nombre}`,
    })
    await expect(reportar).toHaveAttribute("href", ruta)
    await reportar.click()

    await expect(page).toHaveURL(new RegExp(`${escaparRegex(ruta)}$`))
    await expect(
      page.getByRole("heading", { level: 1, name: "Reportar un problema" })
    ).toBeVisible()
    const formulario = page.getByRole("form", { name: "¿Qué está mal?" })
    await expect(
      formulario.getByText(
        "Mientras dure la disputa, esta publicación no se verifica ni se liquida. Lo que escribas lo verán el medio y el equipo AMO."
      )
    ).toBeVisible()
    const motivos = formulario.getByRole("radiogroup", { name: "Motivo" })
    await expect(motivos.getByRole("radio")).toHaveCount(5)
    for (const motivo of [
      "Incumplimiento",
      "Métricas",
      "Contenido",
      "Permanencia",
      "Otro motivo",
    ]) {
      await expect(motivos.getByRole("radio", { name: motivo })).toBeVisible()
    }
    // «Pago» es del medio.
    await expect(motivos.getByRole("radio", { name: "Pago" })).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)

    await motivos.getByRole("radio", { name: "Permanencia" }).click()
    await formulario
      .getByRole("textbox", { name: "Qué pasó" })
      .fill("La publicación ya no está visible en la cuenta desde ayer.")
    await formulario
      .getByRole("button", { name: "Adjuntar imagen o PDF" })
      .click()
    const [selector] = await Promise.all([
      page.waitForEvent("filechooser"),
      formulario.getByRole("button", { name: "Elegir archivo" }).click(),
    ])
    await selector.setFiles(
      await pdfDePrueba({
        titulo: "Captura de la cuenta",
        nombre: "cuenta-sin-post.pdf",
      })
    )
    await expect(
      formulario.getByRole("button", {
        name: "Quitar el adjunto cuenta-sin-post.pdf",
      })
    ).toBeFocused()
    await page
      .getByRole("region", { name: "Reportar el problema" })
      .getByRole("button", { name: "Reportar el problema" })
      .click()

    const estado = page.getByRole("region", { name: "Recibimos tu reporte" })
    await expect(estado).toBeFocused({ timeout: 30_000 })
    // Mientras dure: el aviso bajo el título de la página.
    await expect(
      page.getByText(
        "Mientras dure la disputa, esta publicación no se verifica ni se liquida. Lo que escribas lo verán el medio y el equipo AMO."
      )
    ).toBeVisible()
    await expect(conversacion(page)).toContainText("Adjunto una prueba.")
    await expect(
      conversacion(page).getByRole("button", { name: "Abrir el PDF adjunto" })
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    const disputaId = await ultimaDisputa(asignacion.asignacionId)
    const disputa = await leerDisputaE2E(disputaId)
    expect(disputa).toMatchObject({
      estado: "ABIERTA",
      parte: "ANUNCIANTE",
      motivo: "PERMANENCIA",
      estadoAsignacionOrigen: "METRICAS_CARGADAS",
    })
    expect(disputa.mensajes[0]?.adjuntoPath).toMatch(
      new RegExp(`^disputa/${disputaId}/[^/]+\\.pdf$`)
    )
    expect((await leerAsignacionE2E(asignacion.asignacionId)).estado).toBe(
      "EN_DISPUTA"
    )

    // De vuelta en el seguimiento: «En disputa» y «Ver la disputa», sin otro reporte.
    await page.getByRole("link", { name: "Volver al seguimiento" }).click()
    const enDisputa = tarjetaDelMedio(page)
    await expect(
      enDisputa.getByText("En disputa", { exact: true })
    ).toBeVisible()
    await expect(
      enDisputa.getByRole("link", {
        name: `Ver la disputa de ${MEDIO_VERIFICADO.nombre}`,
      })
    ).toHaveAttribute("href", ruta)
    await expect(
      enDisputa.getByRole("link", { name: /^Reportar un problema/ })
    ).toHaveCount(0)

    // Las migas de la página enlazan la asignación: lleva a su tarjeta.
    await page.goto(
      `/campanas/${campanaId}/asignaciones/${asignacion.asignacionId}`
    )
    await expect(page).toHaveURL(
      new RegExp(
        `${escaparRegex(rutaSeguimiento(campanaId, asignacion.asignacionId))}$`
      )
    )
  })

  test("la disputa que abrió el medio: la empresa responde y ve el resultado en su voz", async ({
    page,
  }) => {
    const asignacion = await asignacionValidacionE2E({
      hasta: "PUBLICADA",
      prefijo: PREFIJO_PAUTA_ANUNCIANTE,
    })
    const campanaId = asignacion.campana.id
    const disputaId = await abrirDisputaE2E({
      asignacionId: asignacion.asignacionId,
      como: "MEDIO",
      motivo: "CONTENIDO",
      descripcion: "El enlace de destino del contenido no abre.",
    })
    await mensajeDisputaE2E({
      disputaId,
      como: "MEDIO",
      mensaje: "Lo probé desde dos teléfonos y sale error.",
    })

    await ingresarComoAnunciante(page, {
      destino: rutaDisputa(campanaId, asignacion.asignacionId),
    })
    await expect(
      page.getByRole("heading", { level: 1, name: "Disputa" })
    ).toBeVisible()
    await expect(
      page.getByRole("region", { name: "El medio abrió una disputa" })
    ).toBeVisible()
    const hilo = conversacion(page)
    // La apertura lleva el nombre del medio, no solo su parte.
    const apertura = hilo.getByRole("listitem").first()
    await expect(apertura).toContainText("abrió la disputa")
    await expect(
      apertura.getByText(MEDIO_VERIFICADO.nombre, { exact: true })
    ).toBeVisible()
    await expect(hilo).toContainText(
      "Lo probé desde dos teléfonos y sale error."
    )

    const caja = page.getByRole("form", { name: "Responder en la disputa" })
    await expect(
      caja.getByText(
        "Lo que escribas y adjuntes lo verán el medio y el equipo AMO."
      )
    ).toBeVisible()
    await caja
      .getByRole("textbox", { name: "Mensaje" })
      .fill("Ya corregimos el enlace en la versión 2 del contenido.")
    await caja.getByRole("button", { name: "Enviar" }).click()
    // En la lista de mensajes (el campo de respuesta también está en la región
    // y tiene el texto antes de enviarse).
    await expect(
      hilo
        .getByRole("listitem")
        .filter({
          hasText: "Ya corregimos el enlace en la versión 2 del contenido.",
        })
    ).toBeVisible()
    await expect
      .poll(async () =>
        (await leerDisputaE2E(disputaId)).mensajes.map((m) => m.parte)
      )
      .toEqual(["MEDIO", "ANUNCIANTE"])

    // El equipo AMO cancela: la empresa lo lee en su voz y ya no escribe.
    await resolverDisputaE2E({
      disputaId,
      resultado: "CANCELAR",
      causa: "INCUMPLIMIENTO_MEDIO",
    })
    await page.reload()
    const estado = page.getByRole("region", {
      name: "Se canceló la asignación",
    })
    await expect(estado).toContainText("Esta publicación no se te cobra.")
    await expect(estado).toContainText(MOTIVO_RESOLUCION.CANCELAR)
    await expect(
      page.getByText(
        "La asignación se canceló: ya no admite disputas y no se te cobra."
      )
    ).toBeVisible()
    await expect(conversacion(page)).toContainText(/La disputa se cerró el/)
    await expect(
      conversacion(page).getByRole("textbox", { name: "Mensaje" })
    ).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })
})
