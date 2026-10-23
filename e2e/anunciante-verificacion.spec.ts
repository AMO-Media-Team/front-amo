import { pdfDeMuestra } from "../scripts/bootstrap/archivos-prueba"
import {
  type ClienteSupabase,
  crearClienteServicio,
} from "../scripts/bootstrap/supabase"
import {
  prepararAnuncianteEnVerificacion,
  restablecerAnuncianteNuevoE2E,
} from "./utilidades/anunciantes"
import { entorno } from "./utilidades/cuentas"
import { esperarSinDesbordeHorizontal, parametro } from "./utilidades/interfaz"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"
import { PROYECTO_ANUNCIANTE } from "./utilidades/proyectos"
import { sesion } from "./utilidades/sesiones"

/**
 * Verificación de anunciantes (ADM-003, paquete VA) contra `pnpm build &&
 * pnpm start`, con la sesión interna (administrador: verifica, carga por la
 * empresa y suspende).
 *
 * - Solo lectura (escritorio, tablet y móvil): la cola de anunciantes se abre
 *   por la URL y no desborda la pantalla.
 * - Escribe (solo en el proyecto «anunciante», en serie): parte del «Anunciante
 *   Nuevo E2E» con el RUT y la Cámara de Comercio por revisar y enviado a
 *   verificación (`prepararAnuncianteEnVerificacion`, paquete E0). Lo recorre
 *   desde la cola, comprueba que verificar sin documentos aprobados explica lo
 *   que falta, rechaza el RUT con motivo, carga uno nuevo por la empresa,
 *   aprueba los dos y verifica la empresa. Al terminar la devuelve a recién
 *   registrada.
 */

const RUTA_COLA = "/operacion/verificacion?cola=anunciantes"

test.use({ storageState: sesion("interno") })

function colas(page: Page): Locator {
  return page.getByRole("navigation", { name: "Colas de verificación" })
}

test.describe("cola de anunciantes · solo lectura", () => {
  test("se abre por la URL con su contador y sin desbordar la pantalla", async ({
    page,
  }) => {
    await page.goto(RUTA_COLA)
    await expect(
      page.getByRole("heading", { level: 1, name: "Verificación" })
    ).toBeVisible()
    await expect(
      colas(page).getByRole("link", { name: /^Anunciantes:/ })
    ).toHaveAttribute("aria-current", "page")
    await expect(
      page.getByRole("heading", { level: 2, name: "Anunciantes", exact: true })
    ).toBeVisible()
    await expect(
      page
        .getByRole("list", { name: "Anunciantes por verificar" })
        .or(page.getByText("Ninguna empresa espera verificación."))
    ).toBeVisible()
    await expect(page.getByText(/^No pudimos cargar/)).toHaveCount(0)
    await esperarSinDesbordeHorizontal(page)
  })
})

test.describe("verificación de una empresa", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 })

  let servicio: ClienteSupabase
  let empresa: { anuncianteId: string; nombre: string }

  function rutaExpediente(): string {
    return `/operacion/anunciantes/${empresa.anuncianteId}?pestana=verificacion`
  }

  function panel(page: Page): Locator {
    return page.getByRole("tabpanel", { name: "Verificación" })
  }

  function fila(page: Page, titulo: string): Locator {
    return panel(page)
      .getByRole("listitem")
      .filter({
        has: page.getByRole("heading", { level: 3, name: titulo, exact: true }),
      })
  }

  async function abrirExpediente(page: Page): Promise<void> {
    await page.goto(rutaExpediente())
    await expect(
      page.getByRole("tab", { name: "Verificación" })
    ).toHaveAttribute("aria-selected", "true")
    await expect(panel(page).getByText("Espera tu decisión")).toBeVisible()
  }

  /** URL firmadas como servicio que quedaron en la bitácora para la empresa. */
  async function firmasRegistradas(): Promise<number> {
    const { data: documentos, error } = await servicio
      .from("documentos_anunciante")
      .select("id")
      .eq("anunciante_id", empresa.anuncianteId)
    if (error) throw new Error(`No se pudo leer: ${error.message}`)
    const { count, error: errorBitacora } = await servicio
      .from("bitacora")
      .select("id", { count: "exact", head: true })
      .eq("accion", "URL_FIRMADA")
      .eq("entidad", "documentos_anunciante")
      .in(
        "entidad_id",
        documentos.map((documento) => documento.id)
      )
    if (errorBitacora) {
      throw new Error(`No se pudo leer la bitácora: ${errorBitacora.message}`)
    }
    return count ?? 0
  }

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_ANUNCIANTE,
      "Decide sobre una empresa compartida: corre solo en el proyecto «anunciante», en serie."
    )
    info.setTimeout(90_000)
    servicio = crearClienteServicio(entorno)
    empresa = await prepararAnuncianteEnVerificacion()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_ANUNCIANTE) return
    // Los demás specs parten de la empresa recién registrada.
    await restablecerAnuncianteNuevoE2E()
  })

  test("la cola muestra la empresa enviada con sus documentos por revisar", async ({
    page,
  }) => {
    await page.goto(RUTA_COLA)
    const tarjeta = page
      .getByRole("list", { name: "Anunciantes por verificar" })
      .getByRole("article", { name: empresa.nombre, exact: true })
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta.getByText("2 documentos por revisar")).toBeVisible()
    await expect(
      tarjeta.getByText("Documentos exigidos cargados")
    ).toBeVisible()
    await expect(tarjeta).toContainText(/Enviada (ahora|hace)/)

    await tarjeta
      .getByRole("link", { name: `Revisar ${empresa.nombre}` })
      .click()
    await expect(page).toHaveURL(
      new RegExp(`/operacion/anunciantes/${empresa.anuncianteId}\\?`)
    )
    await expect.poll(() => parametro(page, "pestana")).toBe("verificacion")
    await expect(panel(page).getByText("0 de 2 aprobados")).toBeVisible()
  })

  test("verificar sin documentos aprobados explica lo que falta y no cambia nada", async ({
    page,
  }) => {
    await abrirExpediente(page)
    await panel(page).getByRole("button", { name: "Verificar empresa" }).click()
    const dialogo = page.getByRole("alertdialog", {
      name: `¿Verificar a ${empresa.nombre}?`,
    })
    await expect(dialogo).toContainText(/aún falta algún documento aprobado/)
    await dialogo.getByRole("button", { name: "Verificar empresa" }).click()
    // El detalle de la BD llega legible y el diálogo sigue abierto.
    await expect(dialogo).toContainText(
      "Faltan documentos aprobados y vigentes: RUT, Cámara de Comercio."
    )
    await dialogo.getByRole("button", { name: "Cancelar" }).click()
    await expect(dialogo).toBeHidden()
    await expect(panel(page).getByText("Espera tu decisión")).toBeVisible()
  })

  test("rechaza el RUT con motivo y carga uno nuevo por cuenta de la empresa", async ({
    page,
  }) => {
    await abrirExpediente(page)
    const firmasAntes = await firmasRegistradas()

    await fila(page, "RUT").getByRole("button", { name: "Revisar RUT" }).click()
    const hoja = page.getByRole("dialog", { name: "Revisar RUT" })
    // El archivo se abre con una URL firmada como servicio.
    await expect(
      hoja
        .getByRole("link", { name: /^Abrir PDF/ })
        .or(hoja.getByRole("img", { name: `RUT de ${empresa.nombre}` }))
    ).toBeVisible()
    await expect(
      hoja.getByRole("heading", { name: "Qué comprobar" })
    ).toBeVisible()
    await expect.poll(firmasRegistradas).toBeGreaterThan(firmasAntes)

    await hoja.getByRole("button", { name: "Rechazar", exact: true }).click()
    const rechazo = page.getByRole("alertdialog", { name: "¿Rechazar RUT?" })
    await rechazo
      .getByRole("button", { name: /^El documento no se lee bien/ })
      .click()
    await rechazo.getByRole("button", { name: "Rechazar documento" }).click()
    await expect(rechazo).toBeHidden()
    await expect(hoja).toBeHidden()

    const rut = fila(page, "RUT")
    await expect(rut.getByText("Rechazado", { exact: true })).toBeVisible()
    await expect(rut.getByText(/El documento no se lee bien/)).toBeVisible()

    // Carga interna: el equipo AMO sube el RUT correcto por la empresa.
    await rut.getByRole("button", { name: "Cargar RUT por la empresa" }).click()
    const carga = page.getByRole("dialog", { name: "Cargar documento" })
    await expect(carga.getByRole("radio", { name: /^RUT/ })).toBeChecked()
    const [selector] = await Promise.all([
      page.waitForEvent("filechooser"),
      carga.getByRole("button", { name: "Elegir archivo" }).click(),
    ])
    await selector.setFiles({
      name: "rut-corregido.pdf",
      mimeType: "application/pdf",
      buffer: pdfDeMuestra([
        "Registro Unico Tributario",
        `Razon social: ${empresa.nombre}`,
        "Copia legible para la verificacion E2E",
      ]),
    })
    await expect(carga.getByText("rut-corregido.pdf")).toBeVisible()
    await carga.getByRole("button", { name: "Subir documento" }).click()
    await expect(carga).toBeHidden()
    await expect(rut.getByText("Por revisar", { exact: true })).toBeVisible()
    await expect(rut.getByRole("button", { name: "Revisar RUT" })).toBeVisible()
  })

  test("aprueba los dos documentos y verifica la empresa", async ({ page }) => {
    await abrirExpediente(page)

    // RUT con vigencia de un año.
    await fila(page, "RUT").getByRole("button", { name: "Revisar RUT" }).click()
    const rut = page.getByRole("dialog", { name: "Revisar RUT" })
    await rut.getByRole("button", { name: "1 año" }).click()
    await expect(rut.getByLabel(/Vigente hasta/)).not.toHaveValue("")
    await rut.getByRole("button", { name: "Aprobar" }).click()
    await expect(rut).toBeHidden()
    await expect(
      fila(page, "RUT").getByText("Aprobado", { exact: true })
    ).toBeVisible()
    // «Revisar» pasa a ser «Ver» en el mismo botón: el foco vuelve a él.
    await expect(
      fila(page, "RUT").getByRole("button", { name: "Ver RUT", exact: true })
    ).toBeFocused()

    // Cámara de Comercio sin vencimiento.
    await fila(page, "Cámara de Comercio")
      .getByRole("button", { name: "Revisar Cámara de Comercio" })
      .click()
    const camara = page.getByRole("dialog", {
      name: "Revisar Cámara de Comercio",
    })
    await camara.getByRole("button", { name: "Aprobar" }).click()
    await expect(camara).toBeHidden()
    await expect(panel(page).getByText("2 de 2 aprobados")).toBeVisible()

    await panel(page).getByRole("button", { name: "Verificar empresa" }).click()
    const dialogo = page.getByRole("alertdialog", {
      name: `¿Verificar a ${empresa.nombre}?`,
    })
    await expect(dialogo).toContainText(/Podrá activar campañas/)
    await dialogo.getByRole("button", { name: "Verificar empresa" }).click()
    await expect(dialogo).toBeHidden()
    await expect(panel(page).getByText("Empresa verificada")).toBeVisible()
    await expect(
      panel(page).getByRole("button", { name: "Verificar empresa" })
    ).toHaveCount(0)
    // Los botones desaparecen: el foco va al titular de la situación.
    await expect(panel(page).getByText("Empresa verificada")).toBeFocused()

    // Ya no espera en la cola.
    await page.goto(RUTA_COLA)
    await expect(
      page.getByRole("heading", { level: 2, name: "Anunciantes", exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("article", { name: empresa.nombre, exact: true })
    ).toHaveCount(0)
  })
})
