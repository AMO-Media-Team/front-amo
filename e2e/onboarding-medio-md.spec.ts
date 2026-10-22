import { pngDeMuestra } from "../scripts/bootstrap/archivos-prueba"
import {
  clienteComoSuperadmin,
  MEDIO_NUEVO_E2E_ID,
} from "../scripts/bootstrap/provision-e2e"
import type { ClienteSupabase } from "../scripts/bootstrap/supabase"
import { credenciales, entorno, ingresar } from "./utilidades/cuentas"
import { esperarSinDesbordeHorizontal, parametro } from "./utilidades/interfaz"
import { PROYECTO_CON_CUENTAS } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"

/**
 * «Mis documentos» del medio (MED-003, paquete MD) contra `pnpm build &&
 * pnpm start` y el Supabase de pruebas, con las cuentas del aprovisionamiento
 * E2E (`pnpm bootstrap:e2e`):
 *
 * - «Medio E2E» (`E2E_MEDIO_*`): VERIFICADO nivel 1 con sus documentos
 *   aprobados (prueba de vida por videollamada). Solo se lee: corre en
 *   escritorio, tablet y móvil.
 * - «Medio Nuevo E2E» (`E2E_MEDIO_NUEVO_*`): PENDIENTE recién registrado. La
 *   prueba le carga la cédula y al terminar borra lo que subió (fila y
 *   objeto), así que corre solo en escritorio.
 */

const RUTA = "/mi-medio/documentos"
const CEDULA_FRENTE = "Documento de identidad (frente)"

async function abrirDocumentos(
  page: Page,
  cuenta: "MEDIO" | "MEDIO_NUEVO"
): Promise<void> {
  await ingresar(page, credenciales(cuenta))
  await expect(page).toHaveURL(/\/inicio$/)
  await page.goto(RUTA)
  await expect(
    page.getByRole("heading", { level: 1, name: "Mis documentos" })
  ).toBeVisible()
}

function tarjeta(page: Page, titulo: string): Locator {
  return page.getByRole("article", { name: titulo, exact: true })
}

test.describe("mis documentos · medio verificado", () => {
  test("ve sus documentos del nivel 1 al día, los abre y consulta el nivel 2", async ({
    page,
  }) => {
    await abrirDocumentos(page, "MEDIO")

    const resumen = page.getByRole("region", {
      name: "Tus documentos están al día",
    })
    await expect(
      resumen.getByText("4 de 4 aprobados para el nivel 1")
    ).toBeVisible()
    await expect(
      page.getByRole("radio", { name: "Nivel 1, tu nivel actual" })
    ).toBeChecked()

    const nivel1 = page.getByRole("region", { name: "Documentos del nivel 1" })
    for (const titulo of [
      CEDULA_FRENTE,
      "Documento de identidad (reverso)",
      "Prueba de vida",
      "Certificación bancaria",
    ]) {
      await expect(
        nivel1
          .getByRole("article", { name: titulo, exact: true })
          .getByText("Aprobado", { exact: true })
      ).toBeVisible()
    }
    // La prueba de vida se hizo por videollamada: no hay archivo que ver.
    const pruebaVida = tarjeta(page, "Prueba de vida")
    await expect(
      pruebaVida.getByText(/^Verificada por videollamada/)
    ).toBeVisible()
    await expect(pruebaVida.getByRole("button")).toHaveCount(0)

    // Ver un documento: URL firmada de corta duración, sin salir de la página.
    await tarjeta(page, CEDULA_FRENTE)
      .getByRole("button", { name: "Ver" })
      .click()
    const hoja = page.getByRole("dialog", { name: CEDULA_FRENTE })
    await expect(
      hoja.getByRole("img", { name: `${CEDULA_FRENTE} que cargaste` })
    ).toBeVisible()
    await expect(hoja.getByRole("button", { name: "Descargar" })).toBeEnabled()
    await hoja.getByRole("button", { name: "Cerrar" }).first().click()
    await expect(hoja).toBeHidden()

    // Subir de nivel: el 2 pide además el RUT, que aún no tiene.
    await page.getByRole("radio", { name: "Nivel 2" }).click()
    await expect.poll(() => parametro(page, "nivel")).toBe("2")
    const nivel2 = page.getByRole("region", { name: "Documentos del nivel 2" })
    await expect(
      nivel2
        .getByRole("article", { name: "RUT", exact: true })
        .getByText("Sin cargar", { exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Te falta 1 documento" })
    ).toBeVisible()

    await esperarSinDesbordeHorizontal(page)
  })
})

test.describe("mis documentos · medio en alta", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 })

  let servicio: ClienteSupabase
  /** Filas y objetos que esta prueba crea, para borrarlos al final. */
  const creados: { id: string; ruta: string | null }[] = []

  async function documentosDeCedula(): Promise<
    { id: string; archivo_path: string | null }[]
  > {
    const { data, error } = await servicio
      .from("documentos_medio")
      .select("id, archivo_path")
      .eq("medio_id", MEDIO_NUEVO_E2E_ID)
      .eq("tipo", "CEDULA_FRENTE")
    if (error) throw new Error(`No se pudo leer la cédula: ${error.message}`)
    return data
  }

  async function borrar(filas: { id: string; ruta: string | null }[]) {
    if (filas.length === 0) return
    const { error } = await servicio
      .from("documentos_medio")
      .delete()
      .in(
        "id",
        filas.map((fila) => fila.id)
      )
    if (error) throw new Error(`No se pudo borrar la cédula: ${error.message}`)
    const rutas = filas.flatMap((fila) => (fila.ruta ? [fila.ruta] : []))
    if (rutas.length > 0) {
      await servicio.storage.from("documentos").remove(rutas)
    }
  }

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CON_CUENTAS,
      "Carga y borra archivos de una cuenta compartida: corre solo en escritorio."
    )
    servicio = await clienteComoSuperadmin(entorno)
    // Parte de «sin cargar» aunque una corrida anterior se haya cortado.
    await borrar(
      (await documentosDeCedula()).map((fila) => ({
        id: fila.id,
        ruta: fila.archivo_path,
      }))
    )
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_CON_CUENTAS || !servicio) return
    for (const fila of await documentosDeCedula()) {
      creados.push({ id: fila.id, ruta: fila.archivo_path })
    }
    await borrar(creados)
  })

  test("carga la cédula desde la hoja y queda en revisión", async ({
    page,
  }) => {
    await abrirDocumentos(page, "MEDIO_NUEVO")

    // La prueba de vida es opcional y ofrece la videollamada.
    const pruebaVida = tarjeta(page, "Prueba de vida")
    await expect(
      pruebaVida.getByText("Opcional", { exact: true })
    ).toBeVisible()
    await expect(pruebaVida.getByText(/videollamada corta/)).toBeVisible()

    const cedula = tarjeta(page, CEDULA_FRENTE)
    await expect(cedula.getByText("Sin cargar", { exact: true })).toBeVisible()
    await cedula.getByRole("button", { name: "Cargar" }).click()

    const hoja = page.getByRole("dialog", { name: CEDULA_FRENTE })
    await expect(
      hoja.getByRole("heading", { name: "Para que lo aprueben a la primera" })
    ).toBeVisible()
    const [selector] = await Promise.all([
      page.waitForEvent("filechooser"),
      hoja.getByRole("button", { name: "Elegir archivo" }).click(),
    ])
    await selector.setFiles({
      name: "cedula-frente.png",
      mimeType: "image/png",
      buffer: pngDeMuestra(960, 600, [236, 239, 244], [37, 99, 235]),
    })

    // Se revisa antes de subir.
    await expect(
      hoja.getByRole("img", {
        name: `Vista previa de ${CEDULA_FRENTE.toLowerCase()}`,
      })
    ).toBeVisible()
    await hoja.getByRole("button", { name: "Subir documento" }).click()

    await expect(page.getByText("Documento recibido")).toBeVisible()
    await expect(hoja).toBeHidden()
    await expect(cedula.getByText("En revisión", { exact: true })).toBeVisible()
    await expect(
      cedula.getByRole("button", { name: "Reemplazar" })
    ).toBeVisible()

    // Quedó registrada: al volver a la página sigue en revisión y se puede ver.
    await page.reload()
    await expect(cedula.getByText("En revisión", { exact: true })).toBeVisible()
    await cedula.getByRole("button", { name: "Ver" }).click()
    const visor = page.getByRole("dialog", { name: CEDULA_FRENTE })
    await expect(
      visor.getByRole("img", { name: `${CEDULA_FRENTE} que cargaste` })
    ).toBeVisible()

    const filas = await documentosDeCedula()
    expect(filas).toHaveLength(1)
    // La ruta la construye el servidor: carpeta del medio y del tipo, nombre uuid.
    expect(filas[0].archivo_path).toMatch(
      new RegExp(
        `^medio/${MEDIO_NUEVO_E2E_ID}/CEDULA_FRENTE/[0-9a-f-]{36}\\.(?:webp|jpg|png)$`
      )
    )
  })
})
