import { imagenDePrueba } from "./utilidades/archivos"
import { clienteDeLectura } from "./utilidades/datos-demo"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { ingresarComoMedio, MEDIO_SUSPENSION } from "./utilidades/medios"
import {
  leerAsignacionE2E,
  PREFIJO_PAUTA,
  restablecerPautaMedioE2E,
} from "./utilidades/pauta"
import { PROYECTO_PAUTA_MEDIO } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import {
  abrirDisputaE2E,
  asignacionValidacionE2E,
  cancelarAsignacionE2E,
  leerDisputaE2E,
  MOTIVO_RESOLUCION,
  reactivarMedioE2E,
  resolverDisputaE2E,
  suspenderMedioE2E,
  vencerAsignacionE2E,
} from "./utilidades/validacion"

/**
 * Disputas y reclamos del medio (paquete DX de la fase 4: ADM-011, MED-011
 * c2, MED-008 c2) contra `pnpm build && pnpm start`, solo en el proyecto
 * «pauta-medio» (390 px, en serie) con el «Medio E2E» y asignaciones de las
 * fábricas de validación en campañas «Pauta E2E…» (las limpia
 * `restablecerPautaMedioE2E`, no la limpieza del equipo AMO):
 *
 * - Una vencida dentro de su plazo se reclama desde «Mis campañas»: «Reclamar:
 *   sí publiqué» con «Otro» y la descripción precargada, la cuenta regresiva,
 *   el aviso de que el cupo no vuelve mientras se revisa y, como primer
 *   mensaje, el enlace y la captura; al enviar, el foco pasa al estado y la
 *   tarjeta dice que se está revisando.
 * - Con la razón a su favor: «Te dimos la razón» con el plazo nuevo, la
 *   explicación del equipo y el botón para cargar la evidencia.
 * - En un estado disputable: «Reportar un problema» con los motivos del medio
 *   (Métricas, Contenido, Pago y Otro), el error junto a su campo, quién verá
 *   lo escrito y la conversación; la ficha avisa la disputa y la enlaza.
 * - Cancelada por fraude: «Según los términos que aceptaste, esta publicación
 *   no se paga.», y la página de la disputa explica por qué no admite una.
 * - Suspendido («Medio Suspensión E2E»): el aviso en el tablero y en la ficha
 *   de lo que sigue en curso.
 */

const RUTA = "/mis-campanas"

function rutaAsignacion(asignacionId: string): string {
  return `${RUTA}/${asignacionId}`
}

function rutaDisputa(asignacionId: string): string {
  return `${rutaAsignacion(asignacionId)}/disputa`
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function urlExacta(ruta: string): RegExp {
  return new RegExp(`${escaparRegex(ruta)}$`)
}

function tarjeta(page: Page, titulo: string): Locator {
  return page.getByRole("tabpanel").getByRole("article", {
    name: titulo,
    exact: true,
  })
}

function conversacion(page: Page): Locator {
  return page.getByRole("region", { name: "Conversación" })
}

/** La disputa más reciente de la asignación (la abre la interfaz: su id no se conoce). */
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

/** Código de publicación de Instagram distinto en cada corrida. */
function enlacePublicacion(): string {
  return `https://www.instagram.com/p/C${Date.now().toString(36)}Xy/`
}

test.describe("disputas y reclamos del medio", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 })

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeEach(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_PAUTA_MEDIO,
      "Abre disputas con el Medio E2E: corre solo en el proyecto «pauta-medio», en serie."
    )
    await restablecerPautaMedioE2E()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_PAUTA_MEDIO) return
    await restablecerPautaMedioE2E()
  })

  test("vencida: «Reclamar: sí publiqué» precargado, con el enlace y la captura; el cupo no vuelve mientras se revisa", async ({
    page,
  }) => {
    const asignacion = await asignacionValidacionE2E({
      hasta: "CONTENIDO_ENTREGADO",
      prefijo: PREFIJO_PAUTA,
    })
    const { reclamoHasta } = await vencerAsignacionE2E({
      asignacionId: asignacion.asignacionId,
    })
    expect(reclamoHasta.getTime()).toBeGreaterThan(Date.now())

    // MED-011 c2: la tarjeta de la vencida ofrece reclamar dentro del plazo.
    await ingresarComoMedio(page, { destino: `${RUTA}?segmento=caidas` })
    const campana = tarjeta(page, asignacion.oferta.titulo)
    await expect(campana).toContainText("Vencida")
    await expect(campana).toContainText(
      "Puedes reclamar si publicaste a tiempo"
    )
    await expect(campana).toContainText(/Reclama en /)
    // Nunca «escríbele al equipo AMO» sin decir dónde.
    await expect(campana).not.toContainText(/escr[ií]bele/i)
    const reclamar = campana.getByRole("link", {
      name: "Reclamar: sí publiqué",
    })
    await expect(reclamar).toHaveAttribute(
      "href",
      rutaDisputa(asignacion.asignacionId)
    )
    await reclamar.click()

    await expect(page).toHaveURL(
      urlExacta(rutaDisputa(asignacion.asignacionId))
    )
    await expect(
      page.getByRole("heading", { level: 1, name: "Reclamar: sí publiqué" })
    ).toBeVisible()
    const formulario = page.getByRole("form", { name: "Cuéntanos qué pasó" })
    await expect(
      formulario.getByRole("radio", { name: "Sí publiqué y no se registró" })
    ).toBeChecked()
    const descripcion = formulario.getByRole("textbox", { name: "Descríbelo" })
    await expect(descripcion).toHaveValue("Sí publiqué y no se registró")
    await expect(descripcion).toHaveAccessibleDescription(
      "Lo que escribas y adjuntes lo verán el anunciante y el equipo AMO."
    )
    await expect(
      formulario.getByText(
        "Mientras lo revisamos, el cupo no vuelve a tu cuenta. Si te damos la razón, tendrás 24 horas para cargar la evidencia."
      )
    ).toBeVisible()
    await expect(formulario.getByText(/^Reclama en /)).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    // Las pruebas, opcionales, van en el primer mensaje del hilo.
    const enlace = enlacePublicacion()
    await formulario
      .getByRole("textbox", { name: "Enlace de tu publicación (opcional)" })
      .fill(enlace)
    await formulario
      .getByRole("button", { name: "Adjuntar imagen o PDF" })
      .click()
    const [selector] = await Promise.all([
      page.waitForEvent("filechooser"),
      formulario.getByRole("button", { name: "Elegir archivo" }).click(),
    ])
    await selector.setFiles(
      await imagenDePrueba({ ancho: 540, alto: 960, nombre: "mi-reel.png" })
    )
    await expect(
      formulario.getByRole("button", { name: "Quitar el adjunto mi-reel.png" })
    ).toBeFocused()

    await page
      .getByRole("region", { name: "Enviar reclamo" })
      .getByRole("button", { name: "Enviar reclamo" })
      .click()

    // El formulario ya no existe: el foco pasa al estado de la disputa.
    const estado = page.getByRole("region", { name: "Recibimos tu reclamo" })
    await expect(estado).toBeFocused({ timeout: 30_000 })
    await expect(estado).toContainText(
      "Mientras lo revisamos, el cupo no vuelve a tu cuenta."
    )
    await expect(conversacion(page)).toContainText(
      new RegExp(
        `Este es el enlace de mi publicación: ${escaparRegex(enlace.replace(/\/$/, ""))}`
      )
    )
    await expect(
      conversacion(page).getByRole("button", { name: "Ver la imagen adjunta" })
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    const disputaId = await ultimaDisputa(asignacion.asignacionId)
    const disputa = await leerDisputaE2E(disputaId)
    expect(disputa).toMatchObject({
      estado: "ABIERTA",
      parte: "MEDIO",
      motivo: "OTRO",
      descripcion: "Sí publiqué y no se registró",
      estadoAsignacionOrigen: "VENCIDA_SIN_PUBLICAR",
    })
    expect(disputa.mensajes).toHaveLength(1)
    expect(disputa.mensajes[0]?.adjuntoPath).toMatch(
      new RegExp(`^disputa/${disputaId}/[^/]+\\.(webp|png|jpe?g)$`)
    )
    expect((await leerAsignacionE2E(asignacion.asignacionId)).estado).toBe(
      "EN_DISPUTA"
    )

    // En el tablero sigue entre las vencidas, revisándose y sin otro reclamo.
    await page.goto(`${RUTA}?segmento=caidas`)
    const enRevision = tarjeta(page, asignacion.oferta.titulo)
    await expect(enRevision).toContainText("En disputa")
    await expect(enRevision).toContainText("Estamos revisando tu reclamo")
    await expect(
      enRevision.getByRole("link", { name: "Ver tu reclamo" })
    ).toHaveAttribute("href", rutaDisputa(asignacion.asignacionId))
    await expect(
      enRevision.getByRole("link", { name: "Reclamar: sí publiqué" })
    ).toHaveCount(0)
  })

  test("reclamo a favor: «Te dimos la razón» con el plazo nuevo, la explicación y el paso para cargar la evidencia", async ({
    page,
  }) => {
    const asignacion = await asignacionValidacionE2E({
      hasta: "CONTENIDO_ENTREGADO",
      prefijo: PREFIJO_PAUTA,
    })
    await vencerAsignacionE2E({ asignacionId: asignacion.asignacionId })
    const disputaId = await abrirDisputaE2E({
      asignacionId: asignacion.asignacionId,
      como: "MEDIO",
      motivo: "OTRO",
      descripcion: "Sí publiqué y no se registró: la página no me dejó cargar.",
    })
    const resuelta = await resolverDisputaE2E({
      disputaId,
      resultado: "REABRIR",
    })
    expect(resuelta.estadoAsignacion).toBe("CONTENIDO_ENTREGADO")

    await ingresarComoMedio(page, {
      destino: rutaDisputa(asignacion.asignacionId),
    })
    await expect(
      page.getByRole("heading", { level: 1, name: "Tu reclamo" })
    ).toBeVisible()
    const estado = page.getByRole("region", { name: "Te dimos la razón" })
    await expect(estado).toContainText(
      /Tienes hasta el .+ para cargar la evidencia de tu publicación\./
    )
    await expect(estado).toContainText(MOTIVO_RESOLUCION.REABRIR)
    await expect(
      estado.getByRole("link", { name: "Cargar la evidencia" })
    ).toHaveAttribute(
      "href",
      `${rutaAsignacion(asignacion.asignacionId)}/evidencia`
    )
    // La conversación queda en solo lectura.
    await expect(conversacion(page)).toContainText(/La disputa se cerró el/)
    await expect(
      conversacion(page).getByRole("textbox", { name: "Mensaje" })
    ).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })

  test("disputable: «Reportar un problema» con los motivos del medio, el error junto a su campo y la conversación", async ({
    page,
  }) => {
    const asignacion = await asignacionValidacionE2E({
      hasta: "EVIDENCIA_VALIDADA",
      prefijo: PREFIJO_PAUTA,
    })

    await ingresarComoMedio(page, {
      destino: rutaAsignacion(asignacion.asignacionId),
    })
    await page.getByRole("link", { name: "Reportar un problema" }).click()
    await expect(page).toHaveURL(
      urlExacta(rutaDisputa(asignacion.asignacionId))
    )
    await expect(
      page.getByRole("heading", { level: 1, name: "Reportar un problema" })
    ).toBeVisible()

    const formulario = page.getByRole("form", { name: "¿Qué está mal?" })
    const motivos = formulario.getByRole("radiogroup", { name: "Motivo" })
    await expect(motivos.getByRole("radio")).toHaveCount(4)
    for (const motivo of ["Métricas", "Contenido", "Pago", "Otro motivo"]) {
      await expect(motivos.getByRole("radio", { name: motivo })).toBeVisible()
    }
    await expect(
      formulario.getByText(
        /Si tienes cortes de métricas pendientes, sigue cargándolos\./
      )
    ).toBeVisible()

    // Sin motivo: el error queda en el grupo y el foco en su primera opción.
    const enviar = page
      .getByRole("region", { name: "Reportar el problema" })
      .getByRole("button", { name: "Reportar el problema" })
    await enviar.click()
    await expect(motivos).toHaveAccessibleDescription("Elige el motivo.")
    await expect(motivos.getByRole("radio").first()).toBeFocused()

    await motivos.getByRole("radio", { name: "Pago" }).click()
    await formulario
      .getByRole("textbox", { name: "Qué pasó" })
      .fill("El valor que veo no corresponde al multiplicador de mi cuenta.")
    await enviar.click()

    const estado = page.getByRole("region", { name: "Recibimos tu disputa" })
    await expect(estado).toBeFocused({ timeout: 30_000 })
    await expect(estado).toContainText(
      "Mientras dure, esta publicación no se verifica ni se liquida."
    )

    // Responder en la conversación: dice quién lo verá y lo agrega al hilo.
    const caja = page.getByRole("form", { name: "Responder en la disputa" })
    await expect(
      caja.getByText(
        "Lo que escribas y adjuntes lo verán el anunciante y el equipo AMO."
      )
    ).toBeVisible()
    await caja
      .getByRole("textbox", { name: "Mensaje" })
      .fill("Adjunto el cálculo con el multiplicador de mi nivel.")
    await caja.getByRole("button", { name: "Enviar" }).click()
    await expect(conversacion(page)).toContainText(
      "Adjunto el cálculo con el multiplicador de mi nivel."
    )
    await esperarSinDesbordeHorizontal(page)

    const disputa = await leerDisputaE2E(
      await ultimaDisputa(asignacion.asignacionId)
    )
    expect(disputa).toMatchObject({
      parte: "MEDIO",
      motivo: "PAGO",
      estadoAsignacionOrigen: "EVIDENCIA_VALIDADA",
    })

    // La ficha avisa la disputa abierta y la enlaza.
    await page.goto(rutaAsignacion(asignacion.asignacionId))
    const aviso = page
      .getByRole("alert")
      .filter({ hasText: "Hay una disputa abierta" })
    await expect(aviso).toContainText("La abriste tú.")
    await expect(
      aviso.getByRole("link", { name: "Ver la disputa" })
    ).toHaveAttribute("href", rutaDisputa(asignacion.asignacionId))
  })

  test("cancelada por fraude: no se paga y ya no admite disputas", async ({
    page,
  }) => {
    const asignacion = await asignacionValidacionE2E({
      hasta: "PUBLICADA",
      prefijo: PREFIJO_PAUTA,
    })
    await cancelarAsignacionE2E({
      asignacionId: asignacion.asignacionId,
      causa: "FRAUDE",
    })

    await ingresarComoMedio(page, {
      destino: rutaAsignacion(asignacion.asignacionId),
    })
    const aviso = page.getByRole("alert").filter({
      hasText: "El equipo AMO canceló tu participación en esta campaña",
    })
    await expect(aviso).toContainText(
      "Según los términos que aceptaste, esta publicación no se paga."
    )
    await expect(aviso).toContainText("Causa: fraude.")
    await expect(aviso).not.toContainText(/escr[ií]bele/i)
    await expect(
      page.getByRole("link", { name: "Reportar un problema" })
    ).toHaveCount(0)

    await page.goto(rutaDisputa(asignacion.asignacionId))
    await expect(
      page.getByText("Esta publicación no admite disputas ahora")
    ).toBeVisible()
    await expect(
      page.getByText(
        "Tu participación en esta campaña se canceló: ya no admite disputas."
      )
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)
  })

  test("suspendido: el aviso en el tablero y en la ficha de lo que sigue en curso", async ({
    page,
  }) => {
    await restablecerPautaMedioE2E(MEDIO_SUSPENSION)
    const asignacion = await asignacionValidacionE2E({
      hasta: "CONTENIDO_ENTREGADO",
      medio: MEDIO_SUSPENSION,
      prefijo: PREFIJO_PAUTA,
    })
    await suspenderMedioE2E()
    try {
      await ingresarComoMedio(page, {
        cuenta: "MEDIO_SUSPENSION",
        destino: RUTA,
      })
      const texto =
        "El equipo AMO revisa tus campañas en curso; mientras no te avisemos que se cancelan, puedes seguir cumpliéndolas."
      const tablero = page
        .getByRole("alert")
        .filter({ hasText: "Tu medio está suspendido" })
      await expect(tablero).toContainText(texto)
      // Lo que tenía en curso sigue a la mano.
      await expect(tarjeta(page, asignacion.oferta.titulo)).toContainText(
        "Publica y carga la evidencia"
      )
      await esperarSinDesbordeHorizontal(page)

      await page.goto(rutaAsignacion(asignacion.asignacionId))
      await expect(
        page.getByRole("alert").filter({ hasText: "Tu medio está suspendido" })
      ).toContainText(texto)
    } finally {
      await reactivarMedioE2E()
      await restablecerPautaMedioE2E(MEDIO_SUSPENSION)
    }
  })
})
