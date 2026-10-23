import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { CUENTA_MEDIO_VERIFICADO, ingresarComoMedio } from "./utilidades/medios"
import {
  aceptarOfertaE2E,
  cargarMetricaE2E,
  crearOfertaPautaE2E,
  entregarContenidoE2E,
  type OfertaPautaE2E,
  publicarEvidenciaE2E,
  publicarNuevaVersionCreativoE2E,
  rechazarEvidenciaE2E,
  rechazarMetricaE2E,
  restablecerPautaMedioE2E,
} from "./utilidades/pauta"
import { PROYECTO_PAUTA_MEDIO } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"

/**
 * Inicio del medio (paquete DM: DSH-006, PRC-003, PRC-004) contra
 * `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet y móvil), con la sesión del medio demo:
 *   «Calidad de tus cuentas» muestra el multiplicador de hoy de cada cuenta y
 *   explica cómo se calcula, el de «Tu reputación» tiene el mismo formato y
 *   el panel no se desborda a lo ancho.
 * - Escribe (solo en el proyecto «pauta-medio», a 390 px y en serie), con el
 *   «Medio E2E» y ofertas de las fábricas de pauta: su cuenta sin historial
 *   vale 1,00 y lo explica; cada próxima acción es un botón directo a su
 *   pantalla (descargar, la versión nueva del contenido, publicar, corregir la
 *   evidencia, cargar un corte con su publicación y corregir un corte
 *   personalizado por su id), un corte que aún no se cumple dice cuándo se
 *   habilita y los negocios en curso llevan a su ficha.
 *   Antes de cada prueba el medio queda sin la pauta de pruebas anteriores.
 *   Las acciones se ubican por el título único de su oferta: un spec del
 *   anunciante que corre en paralelo puede dejarle otras al medio, así que no
 *   se cuenta la lista ni se espera el estado vacío.
 */

const RUTA_INICIO = "/inicio"

function proximasAcciones(page: Page): Locator {
  return page.getByRole("region", { name: "Próximas acciones", exact: true })
}

/** El enlace de una acción: su nombre es «<qué hacer>: <oferta>». */
function accion(page: Page, etiqueta: string, oferta: OfertaPautaE2E): Locator {
  return proximasAcciones(page).getByRole("link", {
    name: `${etiqueta}: ${oferta.titulo}`,
    exact: true,
  })
}

/** La tarjeta de la lista que contiene el enlace (el plazo va fuera del enlace). */
function tarjetaDe(enlace: Locator): Locator {
  return enlace.locator("xpath=ancestor::li[1]")
}

function rutaAsignacion(asignacionId: string): string {
  return `/mis-campanas/${asignacionId}`
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** `/mis-campanas/<id>/<resto>` exacto (con su consulta, si la lleva). */
function urlExacta(ruta: string): RegExp {
  return new RegExp(`${escaparRegex(ruta)}$`)
}

test.describe("inicio del medio · solo lectura", () => {
  test.use({ storageState: sesion("medio") })

  test("la calidad de sus cuentas explica el multiplicador de hoy", async ({
    page,
  }) => {
    await page.goto(RUTA_INICIO)
    const calidad = page.getByRole("region", {
      name: "Calidad de tus cuentas",
      exact: true,
    })
    const cuentas = calidad
      .getByRole("list", { name: "Multiplicador por cuenta" })
      .getByRole("listitem")
    await expect(cuentas.first()).toBeVisible()
    // Cada cuenta: su multiplicador de hoy con dos o tres decimales.
    for (const cuenta of await cuentas.all()) {
      await expect(cuenta.getByRole("definition")).toHaveText(/^\d,\d{2,3} ×$/)
    }

    // El paso a paso se despliega con el teclado.
    const como = calidad.getByRole("button", { name: "¿Cómo se calcula?" })
    await como.focus()
    await page.keyboard.press("Enter")
    await expect(como).toHaveAttribute("aria-expanded", "true")
    await expect(
      calidad.getByText(
        /publicaciones verificadas, el multiplicador es 1,00\.$/
      )
    ).toBeVisible()

    // «Tu reputación» resume el más bajo, con el mismo formato.
    await expect(
      page
        .getByRole("region", { name: "Tu reputación", exact: true })
        .getByText(/^\d,\d{2,3} ×$/)
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)
  })
})

test.describe("inicio del medio · próximas acciones con botón directo", () => {
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

  test("su cuenta aún sin historial suficiente vale 1,00 y lo explica", async ({
    page,
  }) => {
    await ingresarComoMedio(page)

    // PRC-003: con menos del mínimo de publicaciones verificadas, 1,00.
    const cuenta = page
      .getByRole("list", { name: "Multiplicador por cuenta" })
      .getByRole("listitem")
      .filter({
        has: page.getByRole("heading", {
          name: new RegExp(`@${escaparRegex(CUENTA_MEDIO_VERIFICADO.handle)}$`),
        }),
      })
    await expect(cuenta.getByRole("definition")).toHaveText("1,00 ×")
    await expect(cuenta).toContainText("Sin historial suficiente")
    await expect(cuenta).toContainText(/Llevas \d+ de \d+\./)
    await expect(cuenta).toContainText("Franja 30.000 – 60.000")
    await esperarSinDesbordeHorizontal(page)
  })

  test("aceptada: «Descarga el contenido» lleva al contenido y el negocio a su ficha", async ({
    page,
  }) => {
    const oferta = await crearOfertaPautaE2E({ cortes: ["H24"] })
    const { asignacionId } = await aceptarOfertaE2E({ ofertaId: oferta.id })

    await ingresarComoMedio(page)
    const descargar = accion(page, "Descarga el contenido", oferta)
    await expect(descargar).toHaveAttribute(
      "href",
      `${rutaAsignacion(asignacionId)}/contenido`
    )
    // La cuenta regresiva hasta la fecha límite para publicar.
    await expect(tarjetaDe(descargar)).toContainText(/Vence en /)

    // El negocio en curso lleva a su ficha en «Mis campañas».
    await expect(
      page
        .getByRole("region", { name: "Negocios en curso", exact: true })
        .getByRole("link", { name: oferta.titulo, exact: true })
    ).toHaveAttribute("href", rutaAsignacion(asignacionId))
    await esperarSinDesbordeHorizontal(page)

    // Botón directo, también con el teclado.
    await descargar.focus()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(
      urlExacta(`${rutaAsignacion(asignacionId)}/contenido`)
    )
  })

  test("con una versión nueva del creativo, descargarla va antes que publicar", async ({
    page,
  }) => {
    const oferta = await crearOfertaPautaE2E({ cortes: ["H24"] })
    const { asignacionId } = await aceptarOfertaE2E({ ofertaId: oferta.id })
    await entregarContenidoE2E({ asignacionId })
    await publicarNuevaVersionCreativoE2E({ ofertaId: oferta.id })

    await ingresarComoMedio(page)
    const nueva = accion(
      page,
      "Descarga la versión nueva del contenido",
      oferta
    )
    const publicar = accion(page, "Publica y carga la evidencia", oferta)
    await expect(nueva).toHaveAttribute(
      "href",
      `${rutaAsignacion(asignacionId)}/contenido`
    )
    await expect(publicar).toHaveAttribute(
      "href",
      `${rutaAsignacion(asignacionId)}/evidencia`
    )
    // Mismo plazo: primero la versión nueva (sin ella la evidencia no pasa).
    const enlaces = proximasAcciones(page).getByRole("link", {
      name: new RegExp(`: ${oferta.titulo}$`),
    })
    await expect(enlaces).toHaveCount(2)
    await expect(enlaces.first()).toHaveAccessibleName(
      `Descarga la versión nueva del contenido: ${oferta.titulo}`
    )

    await publicar.click()
    await expect(page).toHaveURL(
      urlExacta(`${rutaAsignacion(asignacionId)}/evidencia`)
    )
  })

  test("recién publicada: el corte de 24 h dice cuándo se habilita y ya lleva a su pantalla", async ({
    page,
  }) => {
    const oferta = await crearOfertaPautaE2E({ cortes: ["H24"] })
    const { asignacionId } = await aceptarOfertaE2E({ ofertaId: oferta.id })
    await entregarContenidoE2E({ asignacionId })
    await publicarEvidenciaE2E({ asignacionId, numero: 1 })

    await ingresarComoMedio(page)
    const metrica = accion(page, "Carga las métricas de 24 horas", oferta)
    await expect(metrica).toHaveAttribute(
      "href",
      `${rutaAsignacion(asignacionId)}/metricas?numero=1&corte=H24`
    )
    // Aún no se cumple el corte: dice cuándo se habilita, no cuándo vence.
    await expect(tarjetaDe(metrica)).toContainText(/Se habilita en /)
    await expect(tarjetaDe(metrica)).not.toContainText(/Vence en /)
  })

  test("publicada hace 25 h: el corte de 24 h ya se puede cargar", async ({
    page,
  }) => {
    // La ventana abrió hace 2 días para poder publicar con fecha pasada.
    const oferta = await crearOfertaPautaE2E({ cortes: ["H24"], diasAtras: 2 })
    const { asignacionId } = await aceptarOfertaE2E({ ofertaId: oferta.id })
    await entregarContenidoE2E({ asignacionId })
    await publicarEvidenciaE2E({ asignacionId, numero: 1, haceHoras: 25 })

    await ingresarComoMedio(page)
    const metrica = accion(page, "Carga las métricas de 24 horas", oferta)
    await expect(tarjetaDe(metrica)).toContainText(/Vence en /)
    await metrica.click()
    await expect(page).toHaveURL(
      urlExacta(`${rutaAsignacion(asignacionId)}/metricas?numero=1&corte=H24`)
    )
  })

  test("evidencia rechazada: «Corrige la evidencia» lleva a corregir esa publicación", async ({
    page,
  }) => {
    const oferta = await crearOfertaPautaE2E({ cortes: ["H24"] })
    const { asignacionId } = await aceptarOfertaE2E({ ofertaId: oferta.id })
    await entregarContenidoE2E({ asignacionId })
    await publicarEvidenciaE2E({ asignacionId, numero: 1 })
    await rechazarEvidenciaE2E({
      asignacionId,
      numero: 1,
      observaciones: "La captura no muestra el alcance de la publicación.",
    })

    await ingresarComoMedio(page)
    const corregir = accion(page, "Corrige la evidencia", oferta)
    await expect(corregir).toHaveAttribute(
      "href",
      `${rutaAsignacion(asignacionId)}/evidencia?numero=1`
    )
    await corregir.click()
    await expect(page).toHaveURL(
      urlExacta(`${rutaAsignacion(asignacionId)}/evidencia?numero=1`)
    )
  })

  test("corte personalizado rechazado: «Corrige el corte personalizado» abre ese corte, no uno nuevo", async ({
    page,
  }) => {
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
    const destino = `${rutaAsignacion(asignacionId)}/metricas?numero=1&corte=PERSONALIZADO&metrica=${metricaId}`

    await ingresarComoMedio(page)
    // DSH-006 c2: el botón lleva a corregir esa métrica (por su id).
    const corregir = accion(page, "Corrige el corte personalizado", oferta)
    await expect(corregir).toHaveAttribute("href", destino)
    await corregir.click()
    await expect(page).toHaveURL(urlExacta(destino))
    await expect(
      page.getByRole("button", { name: "Enviar la corrección" })
    ).toBeVisible()
  })
})
