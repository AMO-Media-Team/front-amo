import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { ingresarComoMedio } from "./utilidades/medios"
import {
  aceptarOfertaE2E,
  cargarMetricaE2E,
  crearOfertaPautaE2E,
  entregarContenidoE2E,
  leerAsignacionE2E,
  publicarEvidenciaE2E,
  publicarNuevaVersionCreativoE2E,
  rechazarMetricaE2E,
  restablecerPautaMedioE2E,
} from "./utilidades/pauta"
import { PROYECTO_PAUTA_MEDIO } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"

/**
 * «Mis campañas» del medio (paquete MC: MED-011, MED-012 y desistir de
 * MED-010) contra `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet y móvil), con la sesión del medio demo:
 *   el tablero por estado con su conteo y la ficha de una campaña pagada,
 *   sin desbordarse a lo ancho.
 * - Escribe (solo en el proyecto «pauta-medio», a 390 px y en serie), con el
 *   «Medio E2E» y ofertas de las fábricas de pauta: una aceptada aparece por
 *   publicar con su acción, plazo y pago, y se desiste con motivo desde la
 *   ficha (el cupo se libera); «Contenido» muestra primero las instrucciones,
 *   la descarga registra la versión y deja ver el archivo con un enlace
 *   firmado de 5 minutos y copiar el texto; una versión nueva se destaca y se
 *   descarga; con la evidencia cargada y el corte de 72 h pendiente, la
 *   tarjeta va en «Pendiente de métricas» con la cuenta regresiva del corte;
 *   un corte personalizado rechazado se corrige por su id desde la tarjeta y
 *   desde la ficha (no se abre un formulario nuevo).
 *   Antes de cada prueba el medio queda sin la pauta de pruebas anteriores;
 *   las campañas se ubican por el título único de su oferta (un spec del
 *   anunciante en paralelo puede dejarle otras al medio).
 */

const RUTA = "/mis-campanas"

function rutaAsignacion(asignacionId: string): string {
  return `${RUTA}/${asignacionId}`
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** `<ruta>` exacta al final de la URL (con su consulta, si la lleva). */
function urlExacta(ruta: string): RegExp {
  return new RegExp(`${escaparRegex(ruta)}$`)
}

function segmento(page: Page, nombre: string): Locator {
  return page
    .getByRole("tablist", { name: "Campañas por estado" })
    .getByRole("tab", { name: new RegExp(`^${escaparRegex(nombre)}: `) })
}

function tarjeta(page: Page, titulo: string): Locator {
  return page.getByRole("tabpanel").getByRole("article", {
    name: titulo,
    exact: true,
  })
}

/** Segundos de vida de una URL firmada de Storage (`exp - iat` de su token). */
function vigenciaDeUrlFirmada(url: string): number {
  const token = new URL(url).searchParams.get("token") ?? ""
  const carga = token.split(".")[1] ?? ""
  const datos = JSON.parse(Buffer.from(carga, "base64url").toString("utf8"))
  return Number(datos.exp) - Number(datos.iat)
}

test.describe("mis campañas · solo lectura", () => {
  test.use({ storageState: sesion("medio") })

  test("el tablero por estado y la ficha de una campaña terminada", async ({
    page,
  }) => {
    await page.goto(RUTA)
    await expect(
      page.getByRole("heading", { level: 1, name: "Mis campañas" })
    ).toBeVisible()
    // Los seis segmentos (los grupos de MED-011), cada uno con su conteo en el nombre.
    const segmentos = page
      .getByRole("tablist", { name: "Campañas por estado" })
      .getByRole("tab")
    await expect(segmentos).toHaveCount(6)
    for (const nombre of [
      "Por publicar",
      "Pendiente de métricas",
      "En verificación",
      "Validadas",
      "Terminadas",
      "Vencidas o canceladas",
    ]) {
      await expect(segmento(page, nombre)).toHaveAccessibleName(
        new RegExp(`^${nombre}: \\d+ campañas?$`)
      )
    }
    await esperarSinDesbordeHorizontal(page)

    // El medio demo tiene campañas pagadas.
    const terminadas = segmento(page, "Terminadas")
    await terminadas.click()
    await expect(terminadas).toHaveAttribute("aria-selected", "true")
    // El panel de la pestaña elegida (el anterior puede seguir montado un instante).
    const primera = page
      .getByRole("tabpanel", { name: /^Terminadas: / })
      .getByRole("article")
      .first()
    await expect(primera).toContainText("Recibes")
    await esperarSinDesbordeHorizontal(page)

    const titulo = primera.getByRole("heading", { level: 3 })
    const nombre = (await titulo.textContent())?.trim() ?? ""
    await page
      .getByRole("tabpanel", { name: /^Terminadas: / })
      .getByRole("link", { name: nombre, exact: true })
      .first()
      .click()
    await expect(
      page.getByRole("heading", { level: 1, name: nombre })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Lo que sigue" })
    ).toBeVisible()
    await expect(page.getByRole("heading", { name: "Tu pago" })).toBeVisible()
    // Exacto: la demo tiene ofertas cuyo título empieza por «Historia de…».
    await expect(
      page.getByRole("heading", { name: "Historia", exact: true })
    ).toBeVisible()
    // Una campaña terminada no ofrece desistir ni otra acción.
    await expect(
      page.getByRole("region", { name: "Acciones de la campaña" })
    ).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })
})

test.describe("mis campañas · pauta del Medio E2E", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 })

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeEach(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_PAUTA_MEDIO,
      "Acepta y ejecuta ofertas con el Medio E2E: corre solo en el proyecto «pauta-medio», en serie."
    )
    await restablecerPautaMedioE2E()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_PAUTA_MEDIO) return
    await restablecerPautaMedioE2E()
  })

  test("aceptada: por publicar con su acción, plazo y pago; desistir con motivo libera el cupo", async ({
    page,
  }) => {
    const oferta = await crearOfertaPautaE2E({ cortes: ["H24"] })
    const { asignacionId } = await aceptarOfertaE2E({ ofertaId: oferta.id })

    await ingresarComoMedio(page, { destino: RUTA })
    await segmento(page, "Por publicar").click()
    const campana = tarjeta(page, oferta.titulo)
    await expect(campana).toContainText("Por descargar")
    await expect(campana).toContainText("Descarga el contenido")
    await expect(campana).toContainText(/Vence en /)
    await expect(campana).toContainText(/Recibes\s*\$/)
    await expect(
      campana.getByRole("link", { name: "Ver y descargar" })
    ).toHaveAttribute("href", `${rutaAsignacion(asignacionId)}/contenido`)
    await esperarSinDesbordeHorizontal(page)

    // La tarjeta abre la ficha.
    await campana
      .getByRole("link", { name: oferta.titulo, exact: true })
      .click()
    await expect(page).toHaveURL(urlExacta(rutaAsignacion(asignacionId)))
    await expect(
      page.getByRole("heading", { level: 1, name: oferta.titulo })
    ).toBeVisible()
    // Con «Descarga el contenido» pendiente, el plazo para desistir va en «Lo que sigue».
    await expect(
      page
        .getByRole("region", { name: "Lo que sigue" })
        .getByText(/Puedes desistir hasta el/)
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    // MED-010: desistir pide el motivo; al confirmar, el foco queda en «Lo que sigue».
    const pie = page.getByRole("region", { name: "Acciones de la campaña" })
    await pie.getByRole("button", { name: "Desistir" }).click()
    const dialogo = page.getByRole("alertdialog")
    await dialogo
      .getByRole("textbox", { name: "¿Por qué desistes?" })
      .fill("Ya no tengo espacio para publicar en esas fechas.")
    await dialogo.getByRole("button", { name: "Desistir" }).click()
    await expect(dialogo).toBeHidden()
    await expect(
      page.getByRole("heading", { name: "Lo que sigue" })
    ).toBeFocused()
    await expect(
      page.getByRole("alert").filter({ hasText: "Desististe de esta campaña" })
    ).toBeVisible()
    await expect(pie).toBeHidden()

    const asignacion = await leerAsignacionE2E(asignacionId)
    expect(asignacion.estado).toBe("RECHAZADA")
    expect(asignacion.motivo).toBe(
      "Ya no tengo espacio para publicar en esas fechas."
    )

    // En el tablero, entre las vencidas o canceladas.
    await page.goto(`${RUTA}?segmento=caidas`)
    await expect(tarjeta(page, oferta.titulo)).toContainText("Desististe")
  })

  test("contenido: instrucciones primero; descargar registra la versión, firma por 5 minutos y deja copiar", async ({
    page,
  }) => {
    const oferta = await crearOfertaPautaE2E({ cortes: ["H24"] })
    const { asignacionId } = await aceptarOfertaE2E({ ofertaId: oferta.id })

    await ingresarComoMedio(page, {
      destino: `${rutaAsignacion(asignacionId)}/contenido`,
    })
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"])

    // MED-012: las instrucciones van antes de descargar.
    const titulos = page.getByRole("main").getByRole("heading", { level: 2 })
    await expect(titulos.first()).toHaveText("Antes de publicar")
    await expect(
      page.getByRole("heading", { name: "Tu contenido está listo" })
    ).toBeVisible()
    await expect(
      page.getByRole("main").getByText("Etiqueta de publicidad obligatoria")
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    await page
      .getByRole("region", { name: "Descargar el contenido" })
      .getByRole("button", { name: "Descargar el contenido" })
      .click()
    const contenido = page.getByRole("heading", {
      name: "Tu contenido · versión 1",
    })
    await expect(contenido).toBeFocused()

    // La descarga queda registrada con su versión.
    const asignacion = await leerAsignacionE2E(asignacionId)
    expect(asignacion.estado).toBe("CONTENIDO_ENTREGADO")
    expect(asignacion.versionDescargada).toBe(1)
    expect(asignacion.contenidoDescargadoAt).not.toBeNull()

    // El archivo original se ve con una URL firmada de vida corta (5 minutos).
    const imagen = page
      .getByRole("region", { name: "Archivos del contenido" })
      .getByRole("img")
    await expect(imagen).toBeVisible()
    const src = (await imagen.getAttribute("src")) ?? ""
    expect(src).toContain("/object/sign/creativos/")
    expect(vigenciaDeUrlFirmada(src)).toBe(300)

    // El texto se copia con un toque.
    await page.getByRole("button", { name: "Copiar los hashtags" }).click()
    await expect(
      page.getByRole("button", { name: "Hashtags copiados" })
    ).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      "#Publicidad"
    )

    // Lo que sigue: cargar la evidencia.
    await expect(
      page
        .getByRole("region", { name: "Lo que sigue" })
        .getByRole("link", { name: "Cargar la evidencia" })
    ).toHaveAttribute("href", `${rutaAsignacion(asignacionId)}/evidencia`)
    await esperarSinDesbordeHorizontal(page)
  })

  test("versión nueva del contenido: se destaca y se descarga antes de publicar", async ({
    page,
  }) => {
    const oferta = await crearOfertaPautaE2E({ cortes: ["H24"] })
    const { asignacionId } = await aceptarOfertaE2E({ ofertaId: oferta.id })
    await entregarContenidoE2E({ asignacionId })
    await publicarNuevaVersionCreativoE2E({ ofertaId: oferta.id })

    await ingresarComoMedio(page, {
      destino: `${rutaAsignacion(asignacionId)}/contenido`,
    })
    await expect(
      page.getByText("Hay una versión nueva del contenido")
    ).toBeVisible()
    await page.getByRole("button", { name: "Descargar la versión 2" }).click()
    await expect(
      page.getByRole("heading", { name: "Tu contenido · versión 2" })
    ).toBeFocused()
    await expect(page.getByText("Descargas registradas (2)")).toBeVisible()
    expect((await leerAsignacionE2E(asignacionId)).versionDescargada).toBe(2)
  })

  test("evidencia cargada y el corte de 72 h pendiente: en «Pendiente de métricas» con la cuenta regresiva del corte", async ({
    page,
  }) => {
    // La ventana abrió hace 2 días para publicar hace 25 h y cargar el corte de 24 h.
    const oferta = await crearOfertaPautaE2E({
      cortes: ["H24", "H72"],
      diasAtras: 2,
    })
    const { asignacionId } = await aceptarOfertaE2E({ ofertaId: oferta.id })
    await entregarContenidoE2E({ asignacionId })
    await publicarEvidenciaE2E({ asignacionId, numero: 1, haceHoras: 25 })
    await cargarMetricaE2E({ asignacionId, numero: 1, corte: "H24" })

    await ingresarComoMedio(page, { destino: RUTA })
    // MED-011 c1: con la evidencia cargada, «Pendiente de métricas».
    await segmento(page, "Pendiente de métricas").click()
    const campana = tarjeta(page, oferta.titulo)
    await expect(campana).toContainText("Carga las métricas de 72 horas")
    await expect(campana).toContainText(/Se habilita en /)
    await esperarSinDesbordeHorizontal(page)

    // En la ficha, cada corte con su situación.
    await campana
      .getByRole("link", { name: oferta.titulo, exact: true })
      .click()
    const publicacion = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: "Tu publicación" }) })
    await expect(
      publicacion.getByRole("link", { name: /Ver la publicación/ })
    ).toHaveAttribute("target", "_blank")
    const h24 = publicacion
      .getByRole("listitem")
      .filter({ hasText: "24 horas" })
    await expect(h24).toContainText("En revisión")
    const h72 = publicacion
      .getByRole("listitem")
      .filter({ hasText: "72 horas" })
    await expect(h72).toContainText(/Se habilita en /)
    await esperarSinDesbordeHorizontal(page)
  })

  test("corte personalizado rechazado: la tarjeta y la ficha llevan a corregir ese corte, no a uno nuevo", async ({
    page,
  }) => {
    // Con solo el corte de 72 h, el plazo para corregir (48 h desde el
    // rechazo) vence antes y es lo que sigue en la tarjeta.
    const oferta = await crearOfertaPautaE2E({ cortes: ["H72"] })
    const { asignacionId } = await aceptarOfertaE2E({ ofertaId: oferta.id })
    await entregarContenidoE2E({ asignacionId })
    await publicarEvidenciaE2E({ asignacionId, numero: 1 })
    const { metricaId } = await cargarMetricaE2E({
      asignacionId,
      numero: 1,
      corte: "PERSONALIZADO",
    })
    await rechazarMetricaE2E({
      metricaId,
      observaciones: "La captura es de otro periodo.",
    })
    const corregir = `${rutaAsignacion(asignacionId)}/metricas?numero=1&corte=PERSONALIZADO&metrica=${metricaId}`

    await ingresarComoMedio(page, { destino: RUTA })
    await segmento(page, "Pendiente de métricas").click()
    const campana = tarjeta(page, oferta.titulo)
    await expect(campana).toContainText("Corrige el corte personalizado")
    await expect(
      campana.getByRole("link", { name: "Corregir las métricas" })
    ).toHaveAttribute("href", corregir)
    await esperarSinDesbordeHorizontal(page)

    // En la ficha, el personalizado rechazado con sus observaciones y su botón.
    await campana
      .getByRole("link", { name: oferta.titulo, exact: true })
      .click()
    await expect(page).toHaveURL(urlExacta(rutaAsignacion(asignacionId)))
    const corregirEnFicha = page.getByRole("link", {
      name: /^Corregir el corte personalizado/,
    })
    await expect(corregirEnFicha).toHaveAttribute("href", corregir)
    await expect(
      corregirEnFicha.locator("xpath=ancestor::li[1]")
    ).toContainText("La captura es de otro periodo.")
    await esperarSinDesbordeHorizontal(page)

    // Abre la corrección de ese corte, no un formulario nuevo.
    await corregirEnFicha.click()
    await expect(page).toHaveURL(urlExacta(corregir))
    await expect(
      page.getByRole("button", { name: "Enviar la corrección" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Enviar métricas" })
    ).toHaveCount(0)
  })
})
