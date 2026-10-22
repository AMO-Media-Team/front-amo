import { createHash } from "node:crypto"

import { pngDeMuestra } from "../scripts/bootstrap/archivos-prueba"
import { clienteComoSuperadmin } from "../scripts/bootstrap/provision-e2e"
import type { ClienteSupabase } from "../scripts/bootstrap/supabase"
import { entorno } from "./utilidades/cuentas"
import { esperarSinDesbordeHorizontal } from "./utilidades/interfaz"
import {
  CUENTA_MEDIO_VERIFICADO,
  ingresarComoMedio,
  MEDIO_VERIFICADO,
} from "./utilidades/medios"
import { PROYECTO_CON_CUENTAS } from "./utilidades/proyectos"
import { expect, type Locator, type Page, test } from "./utilidades/prueba"

/**
 * «Mi medio › Cuentas sociales» (paquete MC: MED-005, MED-006) contra
 * `pnpm build && pnpm start` y el Supabase de pruebas, con el «Medio E2E»
 * (`E2E_MEDIO_*`, VERIFICADO nivel 1 con `@medio.e2e.amo` verificada):
 *
 * - Lectura: su cuenta de Instagram con seguidores, franja y vigencia, y el
 *   menú propio de una cuenta verificada. Corre en escritorio, tablet y móvil.
 * - Escritura (solo escritorio, en serie): agrega cuentas con un usuario
 *   único por corrida, verifica una con el código en una historia y quita
 *   otra. No toca la cuenta de Instagram del medio, y antes y después borra
 *   las cuentas de prueba (filas, verificaciones y capturas), también las que
 *   haya dejado una corrida cortada.
 */

const RUTA = "/mi-medio/cuentas"
/** Prefijo de los usuarios que crea esta suite (TikTok y Facebook los admiten). */
const PREFIJO_TIKTOK = "e2e.mc."
const PREFIJO_FACEBOOK = "E2eMc"

function sufijoUnico(): string {
  return Date.now().toString(36)
}

async function abrirCuentas(page: Page): Promise<void> {
  await ingresarComoMedio(page, { destino: RUTA })
  await expect(
    page.getByRole("heading", { level: 1, name: "Cuentas sociales" })
  ).toBeVisible()
}

function tarjeta(page: Page, red: string, handle: string): Locator {
  return page.getByRole("article", { name: `${red}: @${handle}`, exact: true })
}

test.describe("cuentas sociales · medio verificado", () => {
  test("ve su cuenta verificada con seguidores, franja y vigencia", async ({
    page,
  }) => {
    await abrirCuentas(page)
    const instagram = tarjeta(page, "Instagram", CUENTA_MEDIO_VERIFICADO.handle)

    await expect(
      instagram.getByText(/^(?:Verificada|Por vencer)$/)
    ).toBeVisible()
    await expect(instagram.getByText("40.000", { exact: true })).toBeVisible()
    await expect(instagram.getByText("30.000 – 60.000")).toBeVisible()
    await expect(instagram.getByText(/^Vence el /)).toBeVisible()
    await expect(
      instagram.getByRole("link", { name: /instagram\.com\/medio\.e2e\.amo/ })
    ).toHaveAttribute("target", "_blank")

    // Verificada: el usuario no cambia ni se quita; la tarifa y reverificar, sí.
    await instagram
      .getByRole("button", {
        name: `Más acciones para @${CUENTA_MEDIO_VERIFICADO.handle}`,
      })
      .click()
    await expect(
      page.getByRole("menuitem", { name: "Editar tarifa" })
    ).toBeVisible()
    await expect(
      page.getByRole("menuitem", { name: "Quitar cuenta" })
    ).toHaveCount(0)
    await page.keyboard.press("Escape")

    // La guía explica el método, la vigencia y el umbral.
    await page
      .getByRole("button", { name: /Cómo funciona la verificación/ })
      .click()
    await expect(page.getByText(/La verificación dura \d+ días/)).toBeVisible()

    await esperarSinDesbordeHorizontal(page)
  })
})

test.describe("cuentas sociales · alta, verificación y baja", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 })

  let servicio: ClienteSupabase

  /** Cuentas que creó esta suite en el Medio E2E (vivas o quitadas). */
  async function cuentasDePrueba(): Promise<{ id: string }[]> {
    const cuentas: { id: string }[] = []
    for (const prefijo of [PREFIJO_TIKTOK, PREFIJO_FACEBOOK]) {
      const { data, error } = await servicio
        .from("cuentas_sociales")
        .select("id")
        .eq("medio_id", MEDIO_VERIFICADO.id)
        .ilike("handle", `${prefijo}%`)
      if (error) {
        throw new Error(`No se pudieron leer las cuentas: ${error.message}`)
      }
      cuentas.push(...data)
    }
    return cuentas
  }

  async function borrarCuentasDePrueba(): Promise<void> {
    for (const cuenta of await cuentasDePrueba()) {
      const carpeta = `medio/${MEDIO_VERIFICADO.id}/cuenta_social/${cuenta.id}`
      const { data: objetos } = await servicio.storage
        .from("documentos")
        .list(carpeta)
      const rutas = (objetos ?? []).map((objeto) => `${carpeta}/${objeto.name}`)
      if (rutas.length > 0) {
        await servicio.storage.from("documentos").remove(rutas)
      }
      // Las verificaciones se van en cascada con la cuenta.
      const { error } = await servicio
        .from("cuentas_sociales")
        .delete()
        .eq("id", cuenta.id)
      if (error)
        throw new Error(`No se pudo borrar la cuenta: ${error.message}`)
    }
  }

  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CON_CUENTAS,
      "Agrega y quita cuentas del Medio E2E: corre solo en escritorio."
    )
    servicio = await clienteComoSuperadmin(entorno)
    await borrarCuentasDePrueba()
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_CON_CUENTAS || !servicio) return
    await borrarCuentasDePrueba()
  })

  test("agrega una cuenta de TikTok y la verifica con un código en una historia", async ({
    page,
  }) => {
    const handle = `${PREFIJO_TIKTOK}${sufijoUnico()}`
    await abrirCuentas(page)

    await page.getByRole("button", { name: "Agregar cuenta" }).click()
    const alta = page.getByRole("dialog", { name: "Agregar cuenta" })
    await alta.getByRole("radio", { name: "TikTok" }).click()
    await alta
      .getByLabel("Usuario o enlace del perfil")
      .fill(`https://www.tiktok.com/@${handle}`)
    await expect(alta.getByText(/Lo guardaremos como/)).toContainText(
      `@${handle} · tiktok.com/@${handle}`
    )
    await alta.getByLabel(/Tarifa de referencia/).fill("250.000")
    await alta.getByRole("button", { name: "Agregar cuenta" }).click()

    await expect(page.getByText(`Agregamos @${handle}`)).toBeVisible()
    await page.getByRole("button", { name: "Verificar ahora" }).click()

    const verificar = page.getByRole("dialog", { name: "Verificar la cuenta" })
    await expect(
      verificar.getByRole("radio", { name: /Código en una historia/ })
    ).toBeChecked()
    await verificar.getByRole("button", { name: /Continuar/ }).click()

    const pedir = page.getByRole("dialog", { name: "Código para tu historia" })
    const seguidores = pedir.getByLabel("Seguidores que tiene hoy la cuenta")
    await seguidores.fill("45.000")
    await expect(seguidores).toHaveAccessibleDescription(
      /franja 30\.000 – 60\.000/
    )
    await pedir.getByRole("button", { name: /Generar código/ }).click()

    const captura = page.getByRole("dialog", {
      name: "Publica el código y envía la captura",
    })
    const zonaCodigo = captura.getByRole("region", {
      name: "Tu código de verificación",
    })
    await expect(zonaCodigo).toBeVisible()
    // El lector de pantalla lo deletrea: «K, 7, P, 4, X, Q».
    const deletreado = await zonaCodigo
      .getByText(/^(?:[A-Z0-9], ){5}[A-Z0-9]$/)
      .textContent()
    const codigo = (deletreado ?? "").replace(/[,\s]/g, "")
    expect(codigo).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/)

    // La BD guarda solo la huella del código, nunca el código en claro.
    const { data: cuenta } = await servicio
      .from("cuentas_sociales")
      .select("id, url, tarifa_referencia")
      .eq("medio_id", MEDIO_VERIFICADO.id)
      .eq("handle", handle)
      .single()
    expect(cuenta).toMatchObject({
      url: `https://www.tiktok.com/@${handle}`,
      tarifa_referencia: 250_000,
    })
    const { data: verificacion } = await servicio
      .from("verificaciones_cuenta")
      .select("metodo, codigo_hash, codigo_expira_at, captura_path")
      .eq("cuenta_social_id", cuenta?.id ?? "")
      .single()
    expect(verificacion).toMatchObject({
      metodo: "CODIGO_HISTORIA",
      codigo_hash: createHash("sha256").update(codigo).digest("hex"),
      captura_path: null,
    })

    const [selector] = await Promise.all([
      page.waitForEvent("filechooser"),
      captura.getByRole("button", { name: "Elegir archivo" }).click(),
    ])
    await selector.setFiles({
      name: "historia.png",
      mimeType: "image/png",
      buffer: pngDeMuestra(540, 960, [244, 239, 255], [117, 73, 222]),
    })
    await expect(
      captura.getByRole("img", {
        name: `Captura de la historia de @${handle} con el código`,
      })
    ).toBeVisible()
    await captura.getByRole("button", { name: "Enviar captura" }).click()

    await expect(page.getByText("Recibimos tu verificación")).toBeVisible()
    await expect(captura).toBeHidden()
    const nueva = tarjeta(page, "TikTok", handle)
    await expect(nueva.getByText("En revisión", { exact: true })).toBeVisible()
    await expect(
      nueva.getByText("Estamos revisando tu verificación")
    ).toBeVisible()

    // La captura quedó en la carpeta de la cuenta, con nombre del servidor.
    const { data: enviada } = await servicio
      .from("verificaciones_cuenta")
      .select("captura_path")
      .eq("cuenta_social_id", cuenta?.id ?? "")
      .single()
    expect(enviada?.captura_path).toMatch(
      new RegExp(
        `^medio/${MEDIO_VERIFICADO.id}/cuenta_social/${cuenta?.id}/[0-9a-f-]{36}\\.(?:webp|png)$`
      )
    )

    // Sigue en revisión al volver y se puede ver lo que se envió.
    await page.reload()
    await expect(nueva.getByText("En revisión", { exact: true })).toBeVisible()
    await nueva
      .getByRole("button", { name: /Historial de verificaciones/ })
      .click()
    await nueva.getByRole("button", { name: "Ver la captura enviada" }).click()
    const visor = page.getByRole("dialog", { name: "Captura enviada" })
    await expect(
      visor.getByRole("img", {
        name: `Captura enviada para verificar @${handle}`,
      })
    ).toBeVisible()
  })

  test("quita una cuenta que aún no verificó", async ({ page }) => {
    const handle = `${PREFIJO_FACEBOOK}${sufijoUnico()}`
    await abrirCuentas(page)

    await page.getByRole("button", { name: "Agregar cuenta" }).click()
    const alta = page.getByRole("dialog", { name: "Agregar cuenta" })
    await alta.getByRole("radio", { name: "Facebook" }).click()
    await alta.getByLabel("Usuario o enlace del perfil").fill(handle)
    await alta.getByRole("button", { name: "Agregar cuenta" }).click()
    await expect(page.getByText(`Agregamos @${handle}`)).toBeVisible()
    await page.getByRole("button", { name: "Más tarde" }).click()

    const nueva = tarjeta(page, "Facebook", handle)
    await expect(
      nueva.getByText("Sin verificar", { exact: true })
    ).toBeVisible()
    await expect(
      nueva.getByRole("button", { name: "Verificar cuenta" })
    ).toBeVisible()

    await nueva
      .getByRole("button", { name: `Más acciones para @${handle}` })
      .click()
    await page.getByRole("menuitem", { name: "Quitar cuenta" }).click()
    const dialogo = page.getByRole("alertdialog", {
      name: `¿Quitar @${handle}?`,
    })
    await dialogo.getByRole("button", { name: "Quitar cuenta" }).click()

    await expect(page.getByText(`Quitamos @${handle}`)).toBeVisible()
    await expect(nueva).toHaveCount(0)
  })
})
