import { ANUNCIANTE_E2E } from "./utilidades/anunciantes"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import { ingresarComoMedio, MEDIO_VERIFICADO } from "./utilidades/medios"
import {
  aceptarOfertaE2E,
  asignacionesMedioE2E,
  crearOfertaPautaE2E,
  leerCuposOfertaE2E,
  type OfertaPautaE2E,
  restablecerPautaMedioE2E,
} from "./utilidades/pauta"
import { PROYECTO_PAUTA_MEDIO } from "./utilidades/proyectos"
import {
  expect,
  type Locator,
  type Page,
  respuestaConEstado,
  test,
} from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"

/**
 * Marketplace del medio (paquete MK: MED-008, MED-009, MED-010) contra
 * `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet y móvil), con la sesión del medio demo:
 *   «Ofertas» se abre con su h1, muestra la lista o el estado vacío (nunca un
 *   error), los filtros viajan en la URL y la página no se desborda.
 * - Escribe (solo en el proyecto «pauta-medio», a 390 px y en serie), con el
 *   «Medio E2E» y ofertas de las fábricas de pauta (título único por
 *   corrida, siempre ubicadas por su título): una oferta nueva lleva «Nueva»,
 *   su pago y sus cupos; al abrir el detalle se registra la vista y la marca
 *   desaparece; aceptar crea UNA asignación (aunque se toque dos veces) y
 *   lleva a ella; si otro toma el último cupo mientras decide, el medio lee
 *   «No quedan cupos en tu franja» y el foco queda en ese aviso; «No me
 *   interesa» la saca de la lista y aparece en «Ver las que rechacé»; los
 *   filtros por anunciante y días de publicación la encuentran (o la dejan
 *   fuera) y «Limpiar filtros» los quita; una oferta que no le está dirigida
 *   no se abre. Antes de cada prueba (y al terminar) el medio queda sin la
 *   pauta de pruebas anteriores.
 */

const RUTA_OFERTAS = "/ofertas"

/** Títulos del estado vacío de la lista (hoy no hay, por filtros o por página). */
const SIN_OFERTAS =
  /^(?:Hoy no hay ofertas para ti|No hay ofertas con estos filtros|No hay ofertas de esta plataforma para ti|No hay más ofertas en esta página)$/

/** Títulos del estado vacío cuando el medio aún no puede ver ofertas (MED-008 c2). */
const MOTIVOS_SIN_OFERTAS =
  /^(?:Tu cuenta aún no tiene un medio|Termina la verificación de tu medio|La verificación de tu medio necesita cambios|Tu medio está suspendido|Tu medio aún no tiene nivel de verificación|Reverifica tus cuentas para ver ofertas|Tus cuentas aún no llegan al mínimo de seguidores)$/

/** Día de calendario en Bogotá (`YYYY-MM-DD`), como los lee el filtro. */
const diaBogota = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function rutaOferta(oferta: Pick<OfertaPautaE2E, "id">): string {
  return `${RUTA_OFERTAS}/${oferta.id}`
}

function tarjeta(page: Page, titulo: string): Locator {
  return page.getByRole("article", { name: titulo, exact: true })
}

function pie(page: Page): Locator {
  return page.getByRole("region", {
    name: "Decisión sobre la oferta",
    exact: true,
  })
}

/**
 * La tarjeta de la oferta en el listado actual, página a página (en la base
 * local también hay ofertas demo para el medio). `null` si no está.
 */
async function buscarTarjeta(
  page: Page,
  titulo: string
): Promise<Locator | null> {
  for (let pagina = 1; pagina <= 10; pagina += 1) {
    await expect(
      page.getByRole("heading", { level: 1, name: "Ofertas" })
    ).toBeVisible()
    await expect(
      page
        .getByRole("list", { name: "Ofertas disponibles" })
        .or(page.getByText(SIN_OFERTAS))
    ).toBeVisible()
    const encontrada = tarjeta(page, titulo)
    if ((await encontrada.count()) > 0) return encontrada
    const siguientes = page
      .getByRole("navigation", { name: "Páginas de ofertas" })
      .getByRole("link", { name: /Siguientes/ })
    if ((await siguientes.count()) === 0) return null
    await siguientes.click()
    await expect(page).toHaveURL(new RegExp(`[?&]pagina=${pagina + 1}\\b`))
  }
  return null
}

async function abrirDetalle(page: Page, oferta: OfertaPautaE2E) {
  await page.goto(rutaOferta(oferta))
  await expect(
    page.getByRole("heading", { level: 1, name: oferta.titulo })
  ).toBeVisible()
}

test.describe("marketplace del medio · solo lectura", () => {
  test.use({ storageState: sesion("medio") })

  test("«Ofertas» se abre con la lista o el motivo, sin errores ni desborde", async ({
    page,
  }) => {
    await page.goto(RUTA_OFERTAS)
    await expect(
      page.getByRole("heading", { level: 1, name: "Ofertas" })
    ).toBeVisible()
    // Lista, «hoy no hay» o el motivo por el que el medio aún no ve ofertas.
    await expect(
      page
        .getByRole("list", { name: "Ofertas disponibles" })
        .or(page.getByText(SIN_OFERTAS))
        .or(page.getByText(MOTIVOS_SIN_OFERTAS))
        .first()
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })

  test("los filtros y el orden viajan en la URL", async ({ page }) => {
    await page.goto(RUTA_OFERTAS)
    await expect(
      page
        .getByRole("list", { name: "Ofertas disponibles" })
        .or(page.getByText(SIN_OFERTAS))
        .or(page.getByText(MOTIVOS_SIN_OFERTAS))
        .first()
    ).toBeVisible()
    const filtros = page.getByRole("group", { name: "Filtros de las ofertas" })
    test.skip(
      (await filtros.count()) === 0,
      "El medio demo aún no puede ver ofertas: no hay filtros que probar."
    )

    await filtros.getByRole("button", { name: /TikTok/ }).click()
    await expect(page).toHaveURL(/[?&]plataforma=tiktok\b/)
    await expect(
      filtros.getByRole("button", { name: /TikTok/ })
    ).toHaveAttribute("aria-pressed", "true")

    await filtros.getByRole("button", { name: "Mejor pago" }).click()
    await expect(page).toHaveURL(/[?&]orden=pago\b/)

    await filtros.getByRole("switch", { name: "Ver las que rechacé" }).click()
    await expect(page).toHaveURL(/[?&]rechazadas=true\b/)

    await filtros.getByRole("button", { name: "Todas" }).click()
    await expect(page).not.toHaveURL(/[?&]plataforma=/)

    // Sector y anunciante (opciones de `marketplace_facetas`) y los días.
    await expect(
      filtros.getByRole("combobox", { name: "Sector" })
    ).toBeVisible()
    await expect(
      filtros.getByRole("combobox", { name: "Anunciante" })
    ).toBeVisible()
    await filtros
      .getByRole("button", { name: /^Días de publicación: / })
      .click()
    await page
      .getByRole("dialog", { name: "Elegir los días de publicación" })
      .getByRole("button", { name: "Próximos 7 días" })
      .click()
    await expect(page).toHaveURL(/[?&]desde=\d{4}-\d{2}-\d{2}&hasta=/)
    await expect(
      filtros.getByRole("button", {
        name: "Días de publicación: Próximos 7 días",
      })
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    // «Limpiar filtros» quita todo menos el orden.
    await filtros.getByRole("button", { name: "Limpiar filtros" }).click()
    await expect(page).toHaveURL(/\/ofertas\?orden=pago$/)
    await expect(
      filtros.getByRole("button", { name: "Limpiar filtros" })
    ).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })
})

test.describe("marketplace del medio · ver, aceptar y rechazar", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 })

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeEach(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_PAUTA_MEDIO,
      "Acepta y rechaza ofertas con el Medio E2E: corre solo en el proyecto «pauta-medio», en serie."
    )
    await restablecerPautaMedioE2E()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_PAUTA_MEDIO) return
    await restablecerPautaMedioE2E()
  })

  test("una oferta nueva muestra pago y cupos; al abrirla se registra la vista (MED-008, MED-009)", async ({
    page,
  }) => {
    const oferta = await crearOfertaPautaE2E({ cupos: 2 })
    await ingresarComoMedio(page, { destino: RUTA_OFERTAS })

    const encontrada = await buscarTarjeta(page, oferta.titulo)
    expect(encontrada, "la oferta dirigida al medio aparece").not.toBeNull()
    const nueva = encontrada as Locator
    await expect(nueva.getByText("Nueva", { exact: true })).toBeVisible()
    await expect(nueva.getByText(/^(Recibes|Hasta)$/)).toBeVisible()
    await expect(nueva.getByText("2 cupos en tu franja")).toBeVisible()
    await expect(nueva.getByText(/^Cierra en /)).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    // El detalle: pago por cuenta con su cálculo, fechas y condiciones fijas.
    await nueva.getByRole("link", { name: oferta.titulo, exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === rutaOferta(oferta))
    await expect(
      page.getByRole("heading", { level: 1, name: oferta.titulo })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { level: 2, name: "Lo que recibes" })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", {
        level: 3,
        name: /^Cómo se calcula tu pago con @/,
      })
    ).toBeVisible()
    await expect(page.getByText("Calidad de tu cuenta")).toBeVisible()
    await expect(
      page.getByText("Etiqueta de publicidad obligatoria")
    ).toBeVisible()
    await expect(page.getByText("No edites el texto")).toBeVisible()
    await expect(
      page.getByRole("heading", { level: 2, name: "Fechas" })
    ).toBeVisible()
    await expect(
      pie(page).getByRole("button", { name: "Aceptar" })
    ).toBeVisible()
    await expect(
      pie(page).getByRole("button", { name: "No me interesa" })
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)

    // La vista quedó registrada: la tarjeta ya no dice «Nueva».
    await expect(async () => {
      await page.goto(RUTA_OFERTAS)
      const vista = await buscarTarjeta(page, oferta.titulo)
      expect(vista).not.toBeNull()
      await expect(
        (vista as Locator).getByText("Nueva", { exact: true })
      ).toHaveCount(0)
    }).toPass({ timeout: 20_000 })
  })

  test("aceptar crea una sola asignación aunque se toque dos veces y lleva a ella (MED-010)", async ({
    page,
  }) => {
    const oferta = await crearOfertaPautaE2E({ cupos: 2 })
    await ingresarComoMedio(page, { destino: rutaOferta(oferta) })
    await expect(
      page.getByRole("heading", { level: 1, name: oferta.titulo })
    ).toBeVisible()

    await pie(page).getByRole("button", { name: "Aceptar" }).click()
    const dialogo = page.getByRole("alertdialog", {
      name: "¿Aceptas esta oferta?",
    })
    await expect(dialogo).toContainText(/@\S+/)
    await expect(dialogo).toContainText("etiqueta de publicidad")
    // Doble toque: el segundo no envía otra solicitud (y la clave es la misma).
    await dialogo.getByRole("button", { name: "Sí, acepto" }).dblclick()

    await expect(page).toHaveURL(/\/mis-campanas\/[0-9a-f-]{36}$/)
    const asignacionId = new URL(page.url()).pathname.split("/").at(-1)

    const propias = (await asignacionesMedioE2E()).filter(
      (asignacion) =>
        asignacion.ofertaId === oferta.id && asignacion.aceptadaAt !== null
    )
    expect(propias).toHaveLength(1)
    expect(propias[0]).toMatchObject({ id: asignacionId, estado: "ACEPTADA" })
    expect(await leerCuposOfertaE2E(oferta.id)).toMatchObject({
      cuposOcupados: 1,
    })

    // De vuelta en el detalle: ya aceptada, enlaza a su asignación.
    await abrirDetalle(page, oferta)
    await expect(
      page.getByRole("alert").filter({ hasText: "Ya aceptaste esta oferta" })
    ).toBeVisible()
    await expect(
      pie(page).getByRole("link", { name: "Ver en Mis campañas" })
    ).toHaveAttribute("href", `/mis-campanas/${asignacionId}`)
    await expect(
      pie(page).getByRole("button", { name: "Aceptar" })
    ).toHaveCount(0)
  })

  test("si otro toma el último cupo mientras decide, lee «No quedan cupos en tu franja» (MED-010)", async ({
    page,
  }) => {
    // Un cupo y varios por medio: la reserva en paralelo (con la sesión del
    // medio, como otro dispositivo) llena la franja sin que «ya aceptaste»
    // se adelante al mensaje del cupo.
    const oferta = await crearOfertaPautaE2E({
      cupos: 1,
      permiteMultiplesCupos: true,
    })
    await ingresarComoMedio(page, { destino: rutaOferta(oferta) })
    await expect(
      pie(page).getByRole("button", { name: "Aceptar" })
    ).toBeVisible()

    await aceptarOfertaE2E({ ofertaId: oferta.id })

    await pie(page).getByRole("button", { name: "Aceptar" }).click()
    const dialogo = page.getByRole("alertdialog", {
      name: "¿Aceptas esta oferta?",
    })
    await dialogo.getByRole("button", { name: "Sí, acepto" }).click()
    await expect(
      dialogo
        .getByRole("alert")
        .filter({ hasText: "No quedan cupos en tu franja" })
    ).toBeVisible()
    await expect(
      dialogo.getByRole("link", { name: "Ver otras ofertas" })
    ).toHaveAttribute("href", RUTA_OFERTAS)
    await expect(
      dialogo.getByRole("button", { name: "Sí, acepto" })
    ).toHaveCount(0)

    await dialogo.getByRole("button", { name: "Entendido" }).click()
    await expect(dialogo).toBeHidden()
    // El botón «Aceptar» ya no existe: el foco queda en el aviso que explica por qué.
    await expect(page.locator(":focus")).toHaveText(
      "No quedan cupos en tu franja"
    )
    await expect(
      pie(page).getByRole("button", { name: "Aceptar" })
    ).toHaveCount(0)
    await expect(
      pie(page).getByRole("link", { name: "Ver otras ofertas" })
    ).toBeVisible()
    expect(await leerCuposOfertaE2E(oferta.id)).toMatchObject({
      cuposOcupados: 1,
    })
  })

  test("«No me interesa» la saca de la lista y queda en «Ver las que rechacé» (MED-010)", async ({
    page,
  }) => {
    const oferta = await crearOfertaPautaE2E()
    await ingresarComoMedio(page, { destino: rutaOferta(oferta) })
    await expect(
      page.getByRole("heading", { level: 1, name: oferta.titulo })
    ).toBeVisible()

    await pie(page).getByRole("button", { name: "No me interesa" }).click()
    const dialogo = page.getByRole("alertdialog", {
      name: "¿No te interesa esta oferta?",
    })
    await dialogo
      .getByRole("button", { name: "No encaja con mi audiencia." })
      .click()
    await expect(
      dialogo.getByRole("textbox", { name: "Motivo (opcional)" })
    ).toHaveValue("No encaja con mi audiencia.")
    await dialogo.getByRole("button", { name: "Quitar de mi lista" }).click()

    await expect(page).toHaveURL((url) => url.pathname === RUTA_OFERTAS)
    expect(await buscarTarjeta(page, oferta.titulo)).toBeNull()

    await page.getByRole("switch", { name: "Ver las que rechacé" }).click()
    await expect(page).toHaveURL(/[?&]rechazadas=true\b/)
    // La lista nueva llegó del servidor (la anterior sigue a la vista mientras carga).
    await expect(
      page.getByText(/, incluidas las que rechazaste\.$/)
    ).toBeVisible()
    const rechazada = await buscarTarjeta(page, oferta.titulo)
    expect(rechazada, "aparece entre las rechazadas").not.toBeNull()
    await expect(
      (rechazada as Locator).getByText("La rechazaste", { exact: true })
    ).toBeVisible()

    const propias = (await asignacionesMedioE2E()).filter(
      (asignacion) => asignacion.ofertaId === oferta.id
    )
    expect(propias).toEqual([
      expect.objectContaining({ estado: "RECHAZADA", aceptadaAt: null }),
    ])
  })

  test("los filtros por anunciante y días de publicación la encuentran; «Limpiar filtros» los quita (MED-008)", async ({
    page,
  }) => {
    const oferta = await crearOfertaPautaE2E()
    expect(oferta.campana.anuncianteId).toBe(ANUNCIANTE_E2E.id)
    await ingresarComoMedio(page, { destino: RUTA_OFERTAS })
    const filtros = page.getByRole("group", { name: "Filtros de las ofertas" })

    await filtros.getByRole("combobox", { name: "Anunciante" }).click()
    await page
      .getByRole("option", { name: ANUNCIANTE_E2E.nombre, exact: true })
      .click()
    await expect(page).toHaveURL(
      new RegExp(`[?&]anunciante=${ANUNCIANTE_E2E.id}\\b`)
    )
    await expect(
      filtros.getByRole("combobox", { name: "Anunciante" })
    ).toContainText(ANUNCIANTE_E2E.nombre)
    // nuqs cambia la URL antes de que llegue la lista: se recarga para leer
    // la del servidor con ese filtro.
    await page.reload()
    expect(
      await buscarTarjeta(page, oferta.titulo),
      "su anunciante la deja en la lista"
    ).not.toBeNull()

    // Su ventana abre hoy: «Hoy» la deja; dos días después de que cierra, no.
    await filtros
      .getByRole("button", { name: /^Días de publicación: / })
      .click()
    await page
      .getByRole("dialog", { name: "Elegir los días de publicación" })
      .getByRole("button", { name: "Hoy", exact: true })
      .click()
    await expect(page).toHaveURL(/[?&]desde=\d{4}-\d{2}-\d{2}&hasta=/)
    await page.reload()
    expect(await buscarTarjeta(page, oferta.titulo)).not.toBeNull()

    const despues = diaBogota.format(
      new Date(oferta.ventanaFin.getTime() + 2 * 24 * 60 * 60 * 1000)
    )
    await page.goto(
      `${RUTA_OFERTAS}?anunciante=${ANUNCIANTE_E2E.id}&desde=${despues}&hasta=${despues}`
    )
    expect(await buscarTarjeta(page, oferta.titulo)).toBeNull()
    await esperarSinDesbordeHorizontal(page)

    await filtros.getByRole("button", { name: "Limpiar filtros" }).click()
    await expect(page).toHaveURL((url) => url.search === "")
    await expect(
      filtros.getByRole("button", { name: "Limpiar filtros" })
    ).toHaveCount(0)
    await page.reload()
    expect(await buscarTarjeta(page, oferta.titulo)).not.toBeNull()
  })

  test("una oferta que no le está dirigida no se abre", async ({
    page,
    guardia,
  }) => {
    // El detalle responde 404 a propósito.
    guardia.permitir(respuestaConEstado(404))
    const oferta = await crearOfertaPautaE2E({
      segmentacion: { mediosExcluidos: [MEDIO_VERIFICADO.id] },
    })
    await ingresarComoMedio(page, { destino: RUTA_OFERTAS })
    expect(await buscarTarjeta(page, oferta.titulo)).toBeNull()

    await page.goto(rutaOferta(oferta))
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Esta oferta ya no está disponible",
      })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Ver otras ofertas" })
    ).toHaveAttribute("href", RUTA_OFERTAS)
  })
})
