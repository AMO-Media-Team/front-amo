import { ingresarComoAnunciante } from "./utilidades/anunciantes"
import { clienteDeLectura } from "./utilidades/datos-demo"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import {
  borrarCampanasE2E,
  type CampanaE2E,
  crearCampanaE2E,
  crearOfertaE2E,
  leerEstadoOferta,
  rutaOfertaAnunciante,
  rutaOfertaInterna,
} from "./utilidades/negocio"
import { PROYECTO_ANUNCIANTE } from "./utilidades/proyectos"
import {
  type AbrirContexto,
  expect,
  type Locator,
  type Page,
  test,
} from "./utilidades/prueba"
import { sesion } from "./utilidades/sesiones"

/**
 * Ficha de la oferta y moderación (ANU-009, ANU-014, ADM-005; paquete OM)
 * contra `pnpm build && pnpm start`:
 *
 * - Solo lectura (escritorio, tablet y móvil), con la sesión interna: la cola
 *   de moderación se abre sin desbordar la pantalla y `/operacion/ofertas`
 *   lleva a ella.
 * - Escribe (solo en el proyecto «anunciante», en serie): sobre ofertas que
 *   crean las fábricas del paquete E0 en una campaña activa del «Anunciante
 *   E2E». El moderador (sesión interna, en otro contexto) devuelve una oferta
 *   en revisión con un comentario; el anunciante lo ve en su ficha y en el
 *   historial y la reenvía; el moderador la publica. Si el anunciante la
 *   retira y la reenvía mientras el moderador la revisa, publicar se rechaza
 *   y la ficha pasa a mostrar el envío nuevo. Una oferta con la fecha límite
 *   vencida no se puede publicar; un rechazo llega con su motivo y el
 *   anunciante cancela una publicada con motivo y después la archiva (sale de
 *   su campaña). Tras cada cambio de estado el foco queda en el aviso del
 *   estado (el botón que abrió el diálogo ya no existe). Al terminar se borran
 *   las campañas de prueba.
 */

const RUTA_COLA = "/operacion/moderacion"

/** Marca única por corrida para reconocer los comentarios de esta prueba. */
const MARCA = Date.now().toString(36)

/** Aviso del estado de la oferta (región nombrada por su título). */
function avisoEstado(page: Page, titulo: string | RegExp): Locator {
  return page.getByRole("region", { name: titulo, exact: true })
}

/** Si la oferta quedó archivada (`deleted_at`): su anunciante ya no la ve. */
async function ofertaArchivada(id: string): Promise<boolean> {
  const { data, error } = await clienteDeLectura()
    .from("ofertas")
    .select("deleted_at")
    .eq("id", id)
    .single()
  if (error)
    throw new Error(`No se pudo leer la oferta ${id}: ${error.message}`)
  return data.deleted_at !== null
}

function cambio(page: Page, titulo: string): Locator {
  return page
    .getByRole("list", { name: "Cambios de la oferta" })
    .getByRole("listitem")
    .filter({ hasText: titulo })
}

async function abrirModerador(abrirContexto: AbrirContexto): Promise<Page> {
  const contexto = await abrirContexto({ storageState: sesion("interno") })
  return contexto.newPage()
}

/** Busca la oferta en la cola (página a página) y abre su ficha. */
async function abrirDesdeLaCola(page: Page, titulo: string): Promise<void> {
  await page.goto(RUTA_COLA)
  const lista = page.getByRole("list", { name: "Ofertas por moderar" })
  for (let pagina = 1; pagina <= 10; pagina += 1) {
    await expect(lista).toBeVisible()
    const revisar = lista.getByRole("link", {
      name: `Revisar ${titulo}`,
      exact: true,
    })
    if ((await revisar.count()) > 0) {
      await revisar.click()
      return
    }
    const siguientes = page
      .getByRole("navigation", { name: "Páginas de la cola de moderación" })
      .getByRole("link", { name: "Siguientes" })
    if ((await siguientes.count()) === 0) break
    await siguientes.click()
    await expect(page).toHaveURL(new RegExp(`[?&]pagina=${pagina + 1}\\b`))
  }
  throw new Error(`La oferta «${titulo}» no aparece en la cola de moderación.`)
}

test.describe("moderación · solo lectura", () => {
  test.use({ storageState: sesion("interno") })

  test("la cola se abre y cabe en la pantalla", async ({ page }) => {
    await page.goto(RUTA_COLA)
    await expect(
      page.getByRole("heading", { level: 1, name: "Moderación" })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { level: 2, name: "En revisión", exact: true })
    ).toBeVisible()
    await expect(
      page
        .getByRole("list", { name: "Ofertas por moderar" })
        .or(page.getByText("No hay ofertas por moderar"))
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })

  test("/operacion/ofertas lleva a la moderación", async ({ page }) => {
    await page.goto("/operacion/ofertas")
    await expect(page).toHaveURL((url) => url.pathname === RUTA_COLA)
  })
})

test.describe("moderación de una oferta", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 })

  let campana: CampanaE2E

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_ANUNCIANTE,
      "Crea y modera ofertas del Anunciante E2E: corre solo en el proyecto «anunciante», en serie."
    )
    campana = await crearCampanaE2E({ estado: "ACTIVA" })
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_ANUNCIANTE) return
    await borrarCampanasE2E()
  })

  test("el moderador la devuelve con un comentario, el anunciante la reenvía y el moderador la publica", async ({
    page,
    abrirContexto,
  }) => {
    const oferta = await crearOfertaE2E({
      campanaId: campana.id,
      estado: "EN_REVISION",
    })
    const comentario = `Ajusta el copy sugerido: menciona la marca (${MARCA}).`

    // 1. El moderador la encuentra en la cola y la devuelve.
    const moderador = await abrirModerador(abrirContexto)
    await abrirDesdeLaCola(moderador, oferta.titulo)
    await expect(moderador).toHaveURL(
      (url) => url.pathname === rutaOfertaInterna(oferta)
    )
    await expect(
      moderador.getByRole("heading", { level: 1, name: oferta.titulo })
    ).toBeVisible()
    await expect(avisoEstado(moderador, "Espera moderación")).toBeVisible()
    await expect(
      moderador.getByRole("heading", { level: 2, name: "Paquete creativo" })
    ).toBeVisible()

    await moderador.getByRole("button", { name: "Devolver" }).click()
    const devolver = moderador.getByRole("alertdialog", {
      name: "¿Devolver la oferta al anunciante?",
    })
    await devolver.getByLabel("Comentario para el anunciante").fill(comentario)
    await devolver.getByRole("button", { name: "Devolver" }).click()
    await expect(devolver).toBeHidden()
    await expect(
      avisoEstado(moderador, "Devuelta con comentarios")
    ).toContainText(comentario)
    // El panel de decisión desaparece: el foco no se pierde, va al estado nuevo.
    await expect(
      avisoEstado(moderador, "Devuelta con comentarios")
    ).toBeFocused()
    expect(await leerEstadoOferta(oferta)).toMatchObject({
      estado: "DEVUELTA",
      comentarioModeracion: comentario,
    })

    // 2. El anunciante ve el comentario y el historial, y la reenvía.
    await ingresarComoAnunciante(page, {
      destino: rutaOfertaAnunciante(oferta),
    })
    await expect(
      page.getByRole("heading", { level: 1, name: oferta.titulo })
    ).toBeVisible()
    await expect(avisoEstado(page, "Devuelta con comentarios")).toContainText(
      comentario
    )
    await expect(cambio(page, "Devuelta con comentarios")).toContainText(
      comentario
    )
    await expect(cambio(page, "Devuelta con comentarios")).toContainText(
      "Equipo AMO"
    )

    await page.getByRole("button", { name: "Reenviar a revisión" }).click()
    const reenviar = page.getByRole("alertdialog", {
      name: "¿Reenviar la oferta a revisión?",
    })
    await reenviar.getByRole("button", { name: "Reenviar a revisión" }).click()
    await expect(reenviar).toBeHidden()
    await expect(avisoEstado(page, "En revisión")).toBeVisible()
    await expect(avisoEstado(page, "En revisión")).toBeFocused()
    await expect(cambio(page, "Reenviada a revisión")).toContainText("Tú")
    // El comentario de la devolución ya atendida queda en el historial.
    await expect(cambio(page, "Devuelta con comentarios")).toContainText(
      comentario
    )
    expect((await leerEstadoOferta(oferta)).estado).toBe("EN_REVISION")

    // 3. El moderador ve el reenvío y la publica.
    await moderador.reload()
    await expect(avisoEstado(moderador, "Espera moderación")).toContainText(
      "reenvío tras una devolución"
    )
    await moderador.getByRole("button", { name: "Publicar" }).click()
    const publicar = moderador.getByRole("alertdialog", {
      name: "¿Publicar la oferta?",
    })
    await publicar.getByRole("button", { name: "Publicar" }).click()
    await expect(publicar).toBeHidden()
    await expect(avisoEstado(moderador, "Publicada")).toBeVisible()
    await expect(avisoEstado(moderador, "Publicada")).toBeFocused()
    await expect(
      moderador.getByRole("button", { name: "Cancelar oferta" })
    ).toBeVisible()
    expect((await leerEstadoOferta(oferta)).estado).toBe("PUBLICADA")

    await page.reload()
    await expect(avisoEstado(page, "Publicada")).toBeVisible()
    await expect(cambio(page, "Publicada en el marketplace")).toBeVisible()
  })

  test("si el anunciante la reenvía mientras se revisa, publicar se rechaza y la ficha se actualiza", async ({
    page,
    abrirContexto,
  }) => {
    const oferta = await crearOfertaE2E({
      campanaId: campana.id,
      estado: "EN_REVISION",
    })

    // 1. El moderador abre la ficha y empieza a revisarla.
    const moderador = await abrirModerador(abrirContexto)
    await moderador.goto(rutaOfertaInterna(oferta))
    await expect(avisoEstado(moderador, "Espera moderación")).toBeVisible()

    // 2. Mientras tanto, el anunciante la retira y la vuelve a enviar.
    await ingresarComoAnunciante(page, {
      destino: rutaOfertaAnunciante(oferta),
    })
    await page.getByRole("button", { name: "Retirar de revisión" }).click()
    const retirar = page.getByRole("alertdialog", {
      name: "¿Retirar la oferta de revisión?",
    })
    await retirar.getByRole("button", { name: "Retirar de revisión" }).click()
    await expect(retirar).toBeHidden()
    await expect(avisoEstado(page, "Retirada de revisión")).toBeFocused()

    await page.getByRole("button", { name: "Enviar a revisión" }).click()
    const enviar = page.getByRole("alertdialog", {
      name: "¿Enviar la oferta a revisión?",
    })
    await enviar.getByRole("button", { name: "Enviar a revisión" }).click()
    await expect(enviar).toBeHidden()
    await expect(avisoEstado(page, "En revisión")).toBeVisible()

    // 3. El moderador publica lo que estaba viendo: la BD lo rechaza.
    const publicar = moderador.getByRole("button", { name: "Publicar" })
    await publicar.click()
    const dialogo = moderador.getByRole("alertdialog", {
      name: "¿Publicar la oferta?",
    })
    await dialogo.getByRole("button", { name: "Publicar" }).click()
    await expect(dialogo.getByRole("alert")).toContainText(
      "El anunciante cambió la oferta mientras la revisabas"
    )
    expect((await leerEstadoOferta(oferta)).estado).toBe("EN_REVISION")

    // 4. La ficha ya muestra el reenvío (sin recargar); se revisa y se publica.
    await dialogo.getByRole("button", { name: "Cancelar" }).click()
    await expect(dialogo).toBeHidden()
    await expect(publicar).toBeFocused()
    await expect(cambio(moderador, "Retirada de revisión")).toBeVisible()
    await publicar.click()
    await dialogo.getByRole("button", { name: "Publicar" }).click()
    await expect(dialogo).toBeHidden()
    await expect(avisoEstado(moderador, "Publicada")).toBeFocused()
    expect((await leerEstadoOferta(oferta)).estado).toBe("PUBLICADA")
  })

  test("una oferta con la fecha límite vencida no se puede publicar", async ({
    abrirContexto,
  }) => {
    // La fábrica espera a que el cron no corra y a que la fecha límite pase.
    const oferta = await crearOfertaE2E({
      campanaId: campana.id,
      estado: "EN_REVISION",
      fechaLimite: new Date(Date.now() - 60_000),
    })
    const moderador = await abrirModerador(abrirContexto)
    await moderador.goto(rutaOfertaInterna(oferta))
    await expect(
      moderador.getByRole("heading", { level: 1, name: oferta.titulo })
    ).toBeVisible()

    const publicar = moderador.getByRole("button", { name: "Publicar" })
    await expect(publicar).toBeDisabled()
    await expect(publicar).toHaveAccessibleDescription(
      /La fecha límite de aceptación ya pasó: no se puede publicar/
    )
    // Recién vencida dice «Venció ahora»; minutos después, «Venció hace …».
    await expect(
      moderador.getByText(/^Venció (ahora|hace)/).first()
    ).toBeVisible()
    // Devolver sigue disponible para que el anunciante ajuste las fechas.
    await expect(
      moderador.getByRole("button", { name: "Devolver" })
    ).toBeEnabled()
    expect((await leerEstadoOferta(oferta)).estado).toBe("EN_REVISION")
  })

  test("un rechazo llega al anunciante con su motivo", async ({
    page,
    abrirContexto,
  }) => {
    const oferta = await crearOfertaE2E({
      campanaId: campana.id,
      estado: "EN_REVISION",
    })
    const motivo = `La oferta duplica otra de la campaña (${MARCA}).`

    const moderador = await abrirModerador(abrirContexto)
    await moderador.goto(rutaOfertaInterna(oferta))
    await moderador.getByRole("button", { name: "Rechazar" }).click()
    const rechazar = moderador.getByRole("alertdialog", {
      name: "¿Rechazar la oferta?",
    })
    await rechazar.getByLabel("Motivo del rechazo").fill(motivo)
    await rechazar.getByRole("button", { name: "Rechazar" }).click()
    await expect(rechazar).toBeHidden()
    await expect(
      avisoEstado(moderador, "Rechazada en moderación")
    ).toContainText(motivo)
    await expect(
      avisoEstado(moderador, "Rechazada en moderación")
    ).toBeFocused()

    await ingresarComoAnunciante(page, {
      destino: rutaOfertaAnunciante(oferta),
    })
    await expect(avisoEstado(page, "Rechazada en moderación")).toContainText(
      motivo
    )
    await expect(cambio(page, "Rechazada en moderación")).toContainText(motivo)
    // Una oferta rechazada ya no se envía ni se cancela: solo se archiva.
    await expect(
      page.getByRole("button", { name: /revisión|Cancelar oferta/ })
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Archivar oferta" })
    ).toBeVisible()
  })

  test("el anunciante cancela una oferta publicada con motivo y la archiva", async ({
    page,
  }) => {
    const oferta = await crearOfertaE2E({
      campanaId: campana.id,
      estado: "PUBLICADA",
    })
    await ingresarComoAnunciante(page, {
      destino: rutaOfertaAnunciante(oferta),
    })
    await expect(avisoEstado(page, "Publicada")).toBeVisible()

    await page.getByRole("button", { name: "Cancelar oferta" }).click()
    const cancelar = page.getByRole("alertdialog", {
      name: "¿Cancelar la oferta publicada?",
    })
    // Sin motivo no se cancela.
    await cancelar
      .getByRole("button", { name: "Sí, cancelar la oferta" })
      .click()
    await expect(cancelar.getByRole("alert")).toContainText(
      /Describe el motivo/
    )
    await cancelar
      .getByRole("button", { name: "La campaña cambió de estrategia." })
      .click()
    await cancelar
      .getByRole("button", { name: "Sí, cancelar la oferta" })
      .click()
    await expect(cancelar).toBeHidden()

    await expect(avisoEstado(page, /^Cancelada el /)).toContainText(
      "La campaña cambió de estrategia."
    )
    await expect(avisoEstado(page, /^Cancelada el /)).toBeFocused()
    expect((await leerEstadoOferta(oferta)).estado).toBe("CANCELADA")
    await esperarSinDesbordeHorizontal(page)

    // Cancelada, se archiva: sale de la campaña y se vuelve a sus ofertas.
    await page.getByRole("button", { name: "Archivar oferta" }).click()
    const archivar = page.getByRole("alertdialog", {
      name: "¿Archivar la oferta?",
    })
    await archivar.getByRole("button", { name: "Archivar oferta" }).click()
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/campanas/${campana.id}` &&
        url.searchParams.get("pestana") === "ofertas"
    )
    await expect(
      page.getByRole("heading", { level: 2, name: "Ofertas de la campaña" })
    ).toBeVisible()
    await expect(page.getByRole("link", { name: oferta.titulo })).toHaveCount(0)
    expect(await ofertaArchivada(oferta.id)).toBe(true)
  })
})
