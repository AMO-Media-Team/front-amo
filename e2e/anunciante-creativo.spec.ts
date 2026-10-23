import { crearClienteServicio } from "../scripts/bootstrap/supabase"
import { ingresarComoAnunciante } from "./utilidades/anunciantes"
import {
  type ArchivoPrueba,
  huellaSha256,
  imagenDePrueba,
  MIB,
  videoDePrueba,
} from "./utilidades/archivos"
import { entorno } from "./utilidades/cuentas"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import {
  borrarCampanasE2E,
  type CampanaE2E,
  crearCampanaE2E,
  crearOfertaE2E,
  leerEstadoOferta,
  type OfertaE2E,
  rutaOfertaAnunciante,
} from "./utilidades/negocio"
import { PROYECTO_ANUNCIANTE } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"

/**
 * Paquete creativo y versiones (ANU-008, ANU-010; paquete CR) contra
 * `pnpm build && pnpm start`, con el «Anunciante E2E» y ofertas que crean las
 * fábricas del paquete E0 en una campaña activa. Escribe: corre solo en el
 * proyecto «anunciante», en serie, y al terminar borra las campañas de prueba
 * (con sus ofertas, creativos y archivos).
 *
 * - Un video 16:9 para un reel se rechaza antes de subirlo, indicando 9:16; el
 *   vertical se sube y queda con la misma huella SHA-256 que el original.
 * - Una imagen de ~12 MB (subida reanudable, sin recomprimir) se guarda
 *   idéntica: misma SHA-256 en la fila y en el objeto de Storage.
 * - En una oferta publicada, la versión 2 queda en preparación (los medios
 *   siguen con la 1) hasta activarla; entonces la 1 deja de estar vigente.
 * - Una versión en preparación que parte de la vigente se descarta: su fila y
 *   su carpeta de Storage desaparecen y la 1 sigue vigente con sus archivos.
 * - Al preparar, activar o descartar, el botón usado desaparece y el foco
 *   pasa al título de la versión que queda (nunca a <body>).
 */

/** Las subidas grandes calculan la huella y suben por bloques de 6 MB. */
const ESPERA_SUBIDA_MS = 90_000

function rutaPasoCreativo(oferta: Pick<OfertaE2E, "id" | "campanaId">) {
  return `/campanas/${oferta.campanaId}/ofertas/${oferta.id}/editar?paso=creativo`
}

function panelCreativo(page: Page, formato: string): Locator {
  return page.getByRole("region", { name: `Paquete creativo: ${formato}` })
}

/** Elige un archivo con el botón de la zona (como en el teléfono). */
async function elegirArchivo(
  zona: Locator,
  archivo: ArchivoPrueba
): Promise<void> {
  const [selector] = await Promise.all([
    zona.page().waitForEvent("filechooser"),
    zona.getByRole("button", { name: "Elegir archivo" }).click(),
  ])
  await selector.setFiles(archivo)
}

/** Archivos del creativo vigente (o del indicado) según la base. */
async function archivosGuardados(ofertaId: string, version?: number) {
  const consulta = crearClienteServicio(entorno)
    .from("creativos")
    .select(
      "version, vigente, archivos:creativo_archivos ( archivo_path, sha256, tamano_bytes, ancho, alto )"
    )
    .eq("oferta_id", ofertaId)
  const { data, error } = await (
    version === undefined
      ? consulta.eq("vigente", true)
      : consulta.eq("version", version)
  ).single()
  if (error) throw new Error(`No se pudo leer el creativo: ${error.message}`)
  return data.archivos
}

/** Id de una versión del creativo según la base. */
async function idVersion(ofertaId: string, version: number): Promise<string> {
  const { data, error } = await crearClienteServicio(entorno)
    .from("creativos")
    .select("id")
    .eq("oferta_id", ofertaId)
    .eq("version", version)
    .single()
  if (error) throw new Error(`No se pudo leer la versión: ${error.message}`)
  return data.id
}

/** Objetos (sin subcarpetas) de la carpeta de una versión en Storage. */
async function objetosDeVersion(
  ofertaId: string,
  creativoId: string
): Promise<string[]> {
  const { data, error } = await crearClienteServicio(entorno)
    .storage.from("creativos")
    .list(`oferta/${ofertaId}/${creativoId}`, { limit: 100 })
  if (error) throw new Error(`No se pudo listar la carpeta: ${error.message}`)
  return data.filter((objeto) => objeto.id).map((objeto) => objeto.name)
}

/** SHA-256 del objeto tal como quedó en Storage. */
async function huellaEnStorage(ruta: string): Promise<string> {
  const { data, error } = await crearClienteServicio(entorno)
    .storage.from("creativos")
    .download(ruta)
  if (error) throw new Error(`No se pudo descargar ${ruta}: ${error.message}`)
  return huellaSha256(Buffer.from(await data.arrayBuffer()))
}

test.describe("paquete creativo", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 })

  let campana: CampanaE2E

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_ANUNCIANTE,
      "Carga creativos del Anunciante E2E: corre solo en el proyecto «anunciante», en serie."
    )
    campana = await crearCampanaE2E({ estado: "ACTIVA" })
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_ANUNCIANTE) return
    await borrarCampanasE2E()
  })

  test("un video horizontal para un reel se rechaza indicando 9:16; el vertical se guarda", async ({
    page,
  }) => {
    const oferta = await crearOfertaE2E({
      campanaId: campana.id,
      formato: { plataforma: "INSTAGRAM", clave: "REEL" },
      estado: "BORRADOR",
      conCreativo: false,
    })
    await ingresarComoAnunciante(page, { destino: rutaPasoCreativo(oferta) })
    const panel = panelCreativo(page, "Reel de Instagram")
    await expect(
      panel.getByText("Lo que pide un reel de Instagram")
    ).toBeVisible()
    await expect(panel.getByText(/^Video vertical 9:16/)).toBeVisible()

    // 1. Horizontal: se rechaza antes de subir, con la relación exigida.
    await elegirArchivo(
      panel,
      await videoDePrueba({ ancho: 640, alto: 360, nombre: "horizontal.mp4" })
    )
    await expect(
      panel.getByRole("alert").filter({ hasText: "horizontal.mp4" })
    ).toContainText(
      /Un reel de Instagram necesita video vertical 9:16.*el tuyo es horizontal 16:9/
    )
    await expect(
      panel.getByRole("list", { name: "Archivos cargados" })
    ).toHaveCount(0)

    // 2. Vertical: se sube y el paquete queda completo.
    const vertical = await videoDePrueba({
      ancho: 360,
      alto: 640,
      nombre: "vertical.mp4",
    })
    await elegirArchivo(panel, vertical)
    const cargados = panel.getByRole("list", { name: "Archivos cargados" })
    await expect(cargados.getByRole("listitem", { name: "Video" })).toBeVisible(
      {
        timeout: ESPERA_SUBIDA_MS,
      }
    )
    await expect(cargados).toContainText("MP4 · 360 × 640 px")
    await expect(
      panel.getByText("El paquete creativo está completo.")
    ).toBeVisible()

    const [archivo] = await archivosGuardados(oferta.id)
    expect(archivo).toMatchObject({
      sha256: huellaSha256(vertical),
      tamano_bytes: vertical.buffer.length,
      ancho: 360,
      alto: 640,
    })
    expect(archivo.archivo_path).toMatch(
      new RegExp(`^oferta/${oferta.id}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.mp4$`)
    )
    await esperarSinDesbordeHorizontal(page)
  })

  test("una imagen de unos 12 MB se guarda idéntica (misma SHA-256)", async ({
    page,
  }) => {
    const oferta = await crearOfertaE2E({
      campanaId: campana.id,
      formato: { plataforma: "INSTAGRAM", clave: "POST_FEED" },
      estado: "BORRADOR",
      conCreativo: false,
    })
    const imagen = await imagenDePrueba({
      ancho: 1080,
      alto: 1080,
      bytesMinimos: 12 * MIB,
      nombre: "pieza-12mb.png",
    })
    expect(imagen.buffer.length).toBeGreaterThanOrEqual(12 * MIB)

    await ingresarComoAnunciante(page, { destino: rutaPasoCreativo(oferta) })
    const panel = panelCreativo(page, "Post de feed de Instagram")
    await expect(panel.getByRole("radio", { name: /^Imagen/ })).toBeChecked()
    await elegirArchivo(panel, imagen)
    await expect(
      panel
        .getByRole("list", { name: "Archivos cargados" })
        .getByRole("listitem", { name: "Imagen" })
    ).toBeVisible({ timeout: ESPERA_SUBIDA_MS })

    const [archivo] = await archivosGuardados(oferta.id)
    const huellaLocal = huellaSha256(imagen)
    expect(archivo.sha256).toBe(huellaLocal)
    expect(archivo.tamano_bytes).toBe(imagen.buffer.length)
    // El objeto es el original: ni recomprimido ni recortado.
    expect(await huellaEnStorage(archivo.archivo_path)).toBe(huellaLocal)
  })

  test("en una oferta publicada la versión 2 queda pendiente hasta activarla", async ({
    page,
  }) => {
    const oferta = await crearOfertaE2E({
      campanaId: campana.id,
      estado: "PUBLICADA",
    })
    await ingresarComoAnunciante(page, {
      destino: rutaOfertaAnunciante(oferta),
    })
    await expect(
      page.getByRole("heading", { level: 1, name: oferta.titulo })
    ).toBeVisible()
    const version1 = page.getByRole("article", { name: "Versión 1" })
    await expect(version1.getByText("Vigente", { exact: true })).toBeVisible()

    // 1. Prepara la versión 2 desde cero (tipo imagen) y le carga una pieza.
    await page.getByRole("button", { name: "Preparar versión nueva" }).click()
    const dialogo = page.getByRole("dialog", { name: "Preparar la versión 2" })
    await dialogo.getByRole("radio", { name: /Empezar desde cero/ }).check()
    await dialogo.getByRole("radio", { name: "Imagen" }).check()
    await dialogo.getByRole("button", { name: "Preparar versión" }).click()
    await expect(dialogo).toBeHidden()

    const version2 = page.getByRole("article", { name: "Versión 2" })
    await expect(
      version2.getByText("En preparación", { exact: true })
    ).toBeVisible()
    // «Preparar versión nueva» desapareció: el foco pasa a la versión nueva.
    await expect(
      version2.getByRole("heading", { name: "Versión 2" })
    ).toBeFocused()
    const activar = version2.getByRole("button", { name: "Activar versión 2" })
    await expect(activar).toBeDisabled()
    expect((await leerEstadoOferta(oferta)).versiones).toEqual([
      { version: 1, vigente: true, activada: true },
      { version: 2, vigente: false, activada: false },
    ])

    await elegirArchivo(
      version2,
      await imagenDePrueba({ ancho: 1080, alto: 1350, nombre: "v2.png" })
    )
    await expect(
      version2
        .getByRole("list", { name: "Archivos cargados" })
        .getByRole("listitem", { name: "Imagen" })
    ).toBeVisible({ timeout: ESPERA_SUBIDA_MS })

    // 2. La activa: la 1 deja de estar vigente.
    await expect(activar).toBeEnabled()
    await activar.click()
    const confirmar = page.getByRole("alertdialog", {
      name: "¿Activar la versión 2?",
    })
    await expect(confirmar).toContainText("La versión 1 deja de estar vigente")
    await confirmar.getByRole("button", { name: "Activar versión" }).click()
    await expect(confirmar).toBeHidden()

    const vigente = page.getByRole("article", { name: "Versión 2" })
    await expect(vigente.getByText("Vigente", { exact: true })).toBeVisible()
    // El botón «Activar» ya no existe: el foco queda en la versión vigente.
    await expect(
      vigente.getByRole("heading", { name: "Versión 2" })
    ).toBeFocused()
    await expect(
      page
        .getByRole("region", { name: "Versiones anteriores" })
        .getByText("Reemplazada", { exact: true })
    ).toBeVisible()
    expect((await leerEstadoOferta(oferta)).versiones).toEqual([
      { version: 1, vigente: false, activada: true },
      { version: 2, vigente: true, activada: true },
    ])
    await esperarSinDesbordeHorizontal(page)
  })

  test("una versión en preparación se descarta y la vigente sigue igual", async ({
    page,
  }) => {
    const oferta = await crearOfertaE2E({
      campanaId: campana.id,
      estado: "PUBLICADA",
    })
    const [original] = oferta.archivos
    await ingresarComoAnunciante(page, {
      destino: rutaOfertaAnunciante(oferta),
    })
    await expect(
      page.getByRole("heading", { level: 1, name: oferta.titulo })
    ).toBeVisible()

    // 1. Prepara la versión 2 a partir de la 1 (copia su archivo a otra carpeta).
    await page.getByRole("button", { name: "Preparar versión nueva" }).click()
    const dialogo = page.getByRole("dialog", { name: "Preparar la versión 2" })
    await expect(
      dialogo.getByRole("radio", { name: /Partir de la versión 1/ })
    ).toBeChecked()
    await dialogo.getByRole("button", { name: "Preparar versión" }).click()
    await expect(dialogo).toBeHidden()
    const version2 = page.getByRole("article", { name: "Versión 2" })
    // El post de feed de la fábrica lleva una imagen 1:1.
    await expect(
      version2
        .getByRole("list", { name: "Archivos cargados" })
        .getByRole("listitem", { name: "Imagen" })
    ).toHaveCount(oferta.archivos.length)
    const idV2 = await idVersion(oferta.id, 2)
    expect(await objetosDeVersion(oferta.id, idV2)).not.toHaveLength(0)

    // 2. La descarta con confirmación.
    await version2.getByRole("button", { name: "Descartar" }).click()
    const confirmar = page.getByRole("alertdialog", {
      name: "¿Descartar la versión 2?",
    })
    await expect(confirmar).toContainText(
      "Los medios siguen con la versión 1, que no cambia."
    )
    await confirmar.getByRole("button", { name: "Descartar versión" }).click()
    await expect(confirmar).toBeHidden()
    await expect(version2).toHaveCount(0)
    const version1 = page.getByRole("article", { name: "Versión 1" })
    await expect(version1.getByText("Vigente", { exact: true })).toBeVisible()
    // «Descartar» desapareció con la versión: el foco queda en la vigente.
    await expect(
      version1.getByRole("heading", { name: "Versión 1" })
    ).toBeFocused()
    await expect(
      page.getByRole("button", { name: "Preparar versión nueva" })
    ).toBeVisible()

    expect((await leerEstadoOferta(oferta)).versiones).toEqual([
      { version: 1, vigente: true, activada: true },
    ])
    expect(await objetosDeVersion(oferta.id, idV2)).toEqual([])
    // Los archivos de la vigente siguen intactos.
    expect(await huellaEnStorage(original.ruta)).toBe(original.sha256)
    await esperarSinDesbordeHorizontal(page)
  })
})
