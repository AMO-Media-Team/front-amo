import { ingresarComoAnunciante } from "./utilidades/anunciantes"
import { videoDePrueba } from "./utilidades/archivos"
import { clienteDeLectura } from "./utilidades/datos-demo"
import { esperarSinDesbordeHorizontal, parametro } from "./utilidades/interfaz"
import {
  borrarCampanasE2E,
  type CampanaE2E,
  crearCampanaE2E,
  leerEstadoOferta,
} from "./utilidades/negocio"
import { PROYECTO_ANUNCIANTE } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"

/**
 * Asistente de oferta (paquete AO: ANU-004…009) contra `pnpm build && pnpm
 * start`, con «Anunciante E2E» (VERIFICADO) y una campaña activa de la fábrica
 * de E0 (desde hoy, 30 días, $20.000.000). Escribe: corre solo en el proyecto
 * «anunciante», en serie y a 390 px (móvil primero). Al terminar borra la
 * campaña y sus ofertas.
 *
 * - Reel e Historia de Instagram + Video de TikTok crean tres borradores al
 *   salir de «Cuánto» (TikTok no ofrece historias); un mínimo de 20.000
 *   seguidores muestra 30.000 efectivos; el corte de 72 h se puede quitar.
 *   Quitar la historia descarta su borrador: queda archivado (no cancelado).
 * - Enviar sin creativo lleva al paso «Paquete creativo» con el mensaje de la
 *   BD; con el video cargado en cada oferta, las dos quedan en revisión.
 */

const PREFIJO = "Campaña AO E2E"
const MOVIL = { width: 390, height: 844 }
const FRANJA_1 = "30.000 – 60.000"

function sufijoUnico(): string {
  return Date.now().toString(36)
}

function paso(page: Page, titulo: RegExp): Locator {
  return page.getByRole("heading", { level: 2, name: titulo })
}

/** Ids de los borradores que recuerda la URL del asistente (`?ofertas=`). */
function idsEnUrl(page: Page): string[] {
  return (parametro(page, "ofertas") ?? "").split(",").filter(Boolean)
}

/** Si la oferta quedó archivada (`deleted_at`): la campaña ya no la muestra. */
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

async function siguiente(page: Page): Promise<void> {
  await page
    .getByRole("group", { name: "Acciones del asistente" })
    .getByRole("button", { name: "Siguiente" })
    .click()
}

/** Presupuesto y cupos de la franja 1 en la tarjeta del formato. */
async function definirPresupuesto(
  page: Page,
  formato: string,
  presupuesto: string,
  cupos: string
): Promise<void> {
  const tarjeta = page.getByRole("region", { name: formato, exact: true })
  await tarjeta.getByLabel("Presupuesto máximo").fill(presupuesto)
  await tarjeta
    .getByRole("textbox", { name: `Cupos en la franja ${FRANJA_1}` })
    .fill(cupos)
}

test.describe("asistente de oferta · anunciante verificado", () => {
  // Las subidas calculan la huella de cada video antes de subirlo.
  test.describe.configure({ mode: "serial", timeout: 180_000 })
  test.use({ viewport: MOVIL })

  let campana: CampanaE2E
  let ofertaIds: string[] = []

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_ANUNCIANTE,
      "Crea ofertas reales: corre solo en el proyecto «anunciante», en serie."
    )
    campana = await crearCampanaE2E({
      estado: "ACTIVA",
      nombre: `${PREFIJO} ${sufijoUnico()}`,
    })
  })
  test.afterAll(async ({}, info) => {
    if (info.project.name === PROYECTO_ANUNCIANTE) {
      await borrarCampanasE2E({ prefijo: PREFIJO })
    }
  })

  test("Reel e Historia de Instagram y Video de TikTok crean tres ofertas, con el mínimo efectivo y sin el corte de 72 h; quitar la historia la descarta", async ({
    page,
  }) => {
    await ingresarComoAnunciante(page, {
      destino: `/campanas/${campana.id}/ofertas/nueva`,
    })
    await expect(
      page.getByRole("heading", { level: 1, name: "Nueva oferta" })
    ).toBeVisible()

    // 1 · Qué se publica: cada plataforma ofrece solo sus formatos.
    await expect(paso(page, /Paso 1 de 6: Qué se publica/)).toBeVisible()
    const instagram = page.getByRole("group", { name: "Instagram" })
    const tiktok = page.getByRole("group", { name: "TikTok" })
    await expect(
      instagram.getByRole("checkbox", { name: "Historia" })
    ).toBeVisible()
    await expect(
      tiktok.getByRole("checkbox", { name: "Historia" })
    ).toHaveCount(0)
    await instagram.getByRole("checkbox", { name: "Reel" }).check()
    await instagram.getByRole("checkbox", { name: "Historia" }).check()
    await tiktok.getByRole("checkbox", { name: "Video" }).check()
    await page
      .getByRole("textbox", { name: "Título de la oferta" })
      .fill(`Oferta AO E2E ${sufijoUnico()}`)
    await esperarSinDesbordeHorizontal(page)
    await siguiente(page)

    // 2 · A quién le llega: el mínimo nunca baja del umbral de AMO.
    await expect(paso(page, /Paso 2 de 6: A quién le llega/)).toBeFocused()
    await page.getByLabel(/Mínimo de seguidores/).fill("20000")
    await expect(
      page.getByText("Mínimo efectivo: 30.000 seguidores", { exact: true })
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)
    await siguiente(page)

    // 3 · Cuándo: los cortes de la configuración; se quita el de 72 h.
    await expect(paso(page, /Paso 3 de 6: Cuándo/)).toBeFocused()
    const setentaYDos = page.getByRole("checkbox", { name: "72 horas" })
    await expect(setentaYDos).toBeChecked()
    await setentaYDos.uncheck()
    await expect(page.getByRole("checkbox", { name: "24 horas" })).toBeChecked()
    await expect(page.getByRole("checkbox", { name: "7 días" })).toBeChecked()
    await esperarSinDesbordeHorizontal(page)
    await siguiente(page)

    // 4 · Cuánto: presupuesto y cupos por formato.
    await expect(paso(page, /Paso 4 de 6: Cuánto/)).toBeFocused()
    await definirPresupuesto(page, "Reel · Instagram", "3000000", "2")
    await definirPresupuesto(page, "Historia · Instagram", "1500000", "2")
    await definirPresupuesto(page, "Video · TikTok", "2500000", "2")
    await esperarSinDesbordeHorizontal(page)
    await siguiente(page)

    // Al salir del paso 4 quedan tres borradores y la URL los recuerda.
    await expect(paso(page, /Paso 5 de 6: Paquete creativo/)).toBeFocused()
    await expect(page).toHaveURL(/paso=creativo/)
    ofertaIds = idsEnUrl(page)
    expect(ofertaIds).toHaveLength(3)
    for (const id of ofertaIds) {
      expect((await leerEstadoOferta({ id })).estado).toBe("BORRADOR")
    }

    // Al recargar continúa donde iba, con los pasos completos.
    await page.reload()
    await expect(paso(page, /Paso 5 de 6: Paquete creativo/)).toBeVisible()
    await expect(
      page.getByRole("tab", { name: /Reel · Instagram/ })
    ).toBeVisible()
    await expect(
      page.getByRole("tab", { name: /Video · TikTok/ })
    ).toBeVisible()

    // Quitar la historia en «Qué se publica» descarta su borrador (con
    // confirmación): se archiva y deja de verse en la campaña.
    await page.goto(
      `/campanas/${campana.id}/ofertas/nueva?ofertas=${ofertaIds.join(",")}`
    )
    await expect(paso(page, /Paso 1 de 6: Qué se publica/)).toBeVisible()
    const historia = page
      .getByRole("group", { name: "Instagram" })
      .getByRole("checkbox", { name: "Historia" })
    await historia.click()
    const descarte = page.getByRole("alertdialog", {
      name: "¿Descartar el borrador de Historia · Instagram?",
    })
    await descarte.getByRole("button", { name: "Descartar borrador" }).click()
    await expect(descarte).toBeHidden()
    await expect(historia).not.toBeChecked()
    await expect.poll(() => idsEnUrl(page)).toHaveLength(2)
    const restantes = idsEnUrl(page)
    const [descartada] = ofertaIds.filter((id) => !restantes.includes(id))
    expect(await ofertaArchivada(descartada)).toBe(true)
    // Archivada tal como estaba: no aparece como «Cancelada».
    expect((await leerEstadoOferta({ id: descartada })).estado).toBe("BORRADOR")
    ofertaIds = restantes
  })

  test("enviar sin creativo lleva al paso creativo; con el creativo, las ofertas quedan en revisión", async ({
    page,
  }) => {
    expect(ofertaIds).toHaveLength(2)
    // Sin paquete creativo el asistente no deja abrir la revisión por la URL:
    // se continúa en el paso creativo y se avanza (el paso no bloquea).
    await ingresarComoAnunciante(page, {
      destino: `/campanas/${campana.id}/ofertas/nueva?ofertas=${ofertaIds.join(",")}&paso=creativo`,
    })
    await expect(paso(page, /Paso 5 de 6: Paquete creativo/)).toBeVisible()
    await siguiente(page)

    // 6 · Revisión: el resumen refleja el corte quitado.
    await expect(paso(page, /Paso 6 de 6: Revisión y envío/)).toBeFocused()
    const cuando = page.getByRole("region", { name: "Cuándo", exact: true })
    await expect(cuando.getByText("24 horas y 7 días")).toBeVisible()
    await expect(
      page.getByText("Etiqueta de publicidad: siempre obligatoria")
    ).toBeVisible()
    await esperarSinDesbordeHorizontal(page)
    await page.getByRole("button", { name: "Enviar a revisión" }).click()

    // La BD dice qué falta y el asistente lleva a ese paso con el mensaje.
    await expect(paso(page, /Paso 5 de 6: Paquete creativo/)).toBeVisible()
    const alerta = page
      .getByRole("alert")
      .filter({ hasText: "Falta completar: Paquete creativo" })
    await expect(alerta).toContainText(
      "Carga el paquete creativo con al menos un archivo."
    )
    for (const id of ofertaIds) {
      expect((await leerEstadoOferta({ id })).estado).toBe("BORRADOR")
    }

    // Un video vertical 9:16 por oferta (originales sin recomprimir).
    const video = await videoDePrueba({ ancho: 360, alto: 640, segundos: 3 })
    for (const [pestana, region] of [
      ["Reel · Instagram", "Paquete creativo: Reel de Instagram"],
      ["Video · TikTok", "Paquete creativo: Video de TikTok"],
    ] as const) {
      await page.getByRole("tab", { name: new RegExp(pestana) }).click()
      const panel = page.getByRole("region", { name: region })
      // Como en el teléfono: el botón de la zona abre el selector de archivos.
      const [selector] = await Promise.all([
        page.waitForEvent("filechooser"),
        panel.getByRole("button", { name: "Elegir archivo" }).click(),
      ])
      await selector.setFiles(video)
      await expect(
        page.getByRole("tab", {
          name: new RegExp(`${pestana}.*paquete listo`),
        })
      ).toBeVisible({ timeout: 60_000 })
    }
    await esperarSinDesbordeHorizontal(page)
    await siguiente(page)

    await expect(paso(page, /Paso 6 de 6: Revisión y envío/)).toBeFocused()
    await expect(page.getByText(/^Paquete creativo listo/)).toHaveCount(2)
    await page.getByRole("button", { name: "Enviar a revisión" }).click()
    await expect(page.getByText("2 ofertas enviadas a revisión")).toBeVisible()
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/campanas/${campana.id}` &&
        url.searchParams.get("pestana") === "ofertas"
    )
    for (const id of ofertaIds) {
      expect((await leerEstadoOferta({ id })).estado).toBe("EN_REVISION")
    }
  })
})
