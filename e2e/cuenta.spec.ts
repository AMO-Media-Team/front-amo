import AxeBuilder from "@axe-core/playwright"

import { generarContrasena } from "../scripts/bootstrap/contrasena"
import {
  clienteComoSuperadmin,
  type CuentaE2E,
  emailDe,
  prepararCuenta,
} from "../scripts/bootstrap/provision-e2e"
import type { ClienteSupabase } from "../scripts/bootstrap/supabase"
import {
  codigoTotp,
  PASO_TOTP_SEGUNDOS,
  segundosRestantesTotp,
} from "../scripts/bootstrap/totp"
import { type Credenciales, entorno, ingresar } from "./utilidades/cuentas"
import {
  type AbrirContexto,
  expect,
  type Locator,
  type Page,
  test,
} from "./utilidades/prueba"
import { PROYECTO_CON_CUENTAS } from "./utilidades/proyectos"

/**
 * «Mi cuenta» y la bandeja de notificaciones contra `pnpm build && pnpm start`
 * y el Supabase real.
 *
 * Usa una cuenta EXCLUSIVA de esta suite (rol ANUNCIANTE, sin verificación
 * obligatoria): la prueba cambia su contraseña, activa y desactiva el TOTP y
 * cierra sus otras sesiones, así que no puede compartirse con otras suites.
 */

const CUENTA: CuentaE2E = {
  clave: "CUENTA",
  rol: "ANUNCIANTE",
  nombre: "Mi Cuenta E2E",
  emailPorDefecto: "e2e.cuenta@amo.test",
  variableEmail: "E2E_CUENTA_EMAIL",
  variablePassword: "E2E_CUENTA_PASSWORD",
  debeCambiarPassword: false,
  conTotp: false,
}

let ultimoPasoTotp = -1

/** Código de un periodo TOTP posterior al último usado (Supabase no acepta repetirlo). */
async function codigoNuevo(secreto: string): Promise<string> {
  const pasoActual = () => Math.floor(Date.now() / 1000 / PASO_TOTP_SEGUNDOS)
  while (pasoActual() <= ultimoPasoTotp || segundosRestantesTotp() < 4) {
    await new Promise((resolver) => setTimeout(resolver, 1000))
  }
  ultimoPasoTotp = pasoActual()
  return codigoTotp(secreto)
}

/** Sin factores: la cuenta ingresa sin paso de verificación. */
async function borrarFactores(
  servicio: ClienteSupabase,
  usuarioId: string
): Promise<void> {
  const { data, error } = await servicio.auth.admin.mfa.listFactors({
    userId: usuarioId,
  })
  if (error)
    throw new Error(`No se pudieron leer los factores: ${error.message}`)
  for (const factor of data.factors) {
    const { error: errorBorrado } = await servicio.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: usuarioId,
    })
    if (errorBorrado)
      throw new Error(`No se pudo borrar un factor: ${errorBorrado.message}`)
  }
}

async function borrarNotificaciones(
  servicio: ClienteSupabase,
  usuarioId: string
): Promise<void> {
  const { error } = await servicio
    .from("notificaciones")
    .delete()
    .eq("usuario_id", usuarioId)
  if (error)
    throw new Error(`No se pudieron borrar notificaciones: ${error.message}`)
}

async function ingresarALaCuenta(
  page: Page,
  credenciales: Credenciales
): Promise<void> {
  await ingresar(page, credenciales)
  await expect(page).toHaveURL(/\/inicio$/)
}

/** Otra sesión de la misma cuenta en un navegador aparte (también vigilado). */
async function nuevaSesion(
  abrirContexto: AbrirContexto,
  credenciales: Credenciales
): Promise<Page> {
  const contexto = await abrirContexto()
  const pagina = await contexto.newPage()
  await ingresarALaCuenta(pagina, credenciales)
  return pagina
}

function campo(ambito: Page | Locator, nombre: string): Locator {
  return ambito.getByRole("textbox", { name: nombre, exact: true })
}

/** Las opciones son radios nativos ocultos dentro de una tarjeta `<label>`. */
async function elegir(page: Page, titulo: string): Promise<void> {
  const opcion = page.getByRole("radio", { name: new RegExp(`^${titulo}`) })
  await page.locator("label").filter({ has: opcion }).click()
  await expect(opcion).toBeChecked()
}

test.describe("mi cuenta", () => {
  test.describe.configure({ mode: "serial", timeout: 150_000 })

  let servicio: ClienteSupabase
  let usuarioId: string
  const cuenta: Credenciales = { email: emailDe(CUENTA), password: "" }

  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CON_CUENTAS,
      "Cuenta exclusiva y datos reales: esta suite corre solo en el proyecto de escritorio."
    )
    info.setTimeout(90_000)
    servicio = await clienteComoSuperadmin(entorno)
    cuenta.password = generarContrasena()
    usuarioId = await prepararCuenta(servicio, CUENTA, cuenta.password)
    await borrarFactores(servicio, usuarioId)
    const { error } = await servicio
      .from("perfiles")
      .update({ celular: null, preferencias: {} })
      .eq("id", usuarioId)
    if (error) throw new Error(`No se pudo limpiar el perfil: ${error.message}`)
  })

  test.afterAll(async ({}, info) => {
    if (info.project.name !== PROYECTO_CON_CUENTAS || !servicio) return
    await borrarNotificaciones(servicio, usuarioId)
  })

  test("perfil: valida el celular colombiano y guarda los datos", async ({
    page,
  }) => {
    await ingresarALaCuenta(page, cuenta)
    await page.goto("/cuenta/perfil")
    await expect(
      page.getByRole("heading", { level: 1, name: "Mi cuenta" })
    ).toBeVisible()
    const identidad = page.getByRole("region", { name: "Tu identidad en AMO" })
    await expect(identidad.getByText(cuenta.email)).toBeVisible()

    await expect(campo(page, "Correo electrónico")).toHaveAttribute("readonly")

    const celular = campo(page, "Celular")
    await celular.fill("300 12")
    await celular.blur()
    await expect(
      page.getByText(
        "Escribe un celular colombiano de 10 dígitos que empiece por 3."
      )
    ).toBeVisible()

    await celular.fill("(310) 555-0199")
    await campo(page, "Nombre completo").fill("Mi Cuenta E2E Editada")
    await page.getByRole("button", { name: "Guardar cambios" }).click()
    await expect(page.getByText("Perfil actualizado")).toBeVisible()
    await expect(celular).toHaveValue("+57 310 555 0199")

    await page.reload()
    await expect(campo(page, "Celular")).toHaveValue("+57 310 555 0199")
    await expect(
      identidad.getByRole("heading", { name: "Mi Cuenta E2E Editada" })
    ).toBeVisible()
  })

  test("preferencias: se aplican al instante y se guardan en la cuenta", async ({
    page,
    abrirContexto,
  }) => {
    await ingresarALaCuenta(page, cuenta)
    await page.goto("/cuenta/preferencias")
    const estado = page.getByRole("status").filter({ hasText: /cuenta/ })

    await elegir(page, "Claro")
    await expect(page.locator("html")).toHaveClass(/\blight\b/)

    await page.getByRole("switch", { name: "Reducir el movimiento" }).click()
    await expect(page.locator("html")).toHaveAttribute(
      "data-movimiento",
      "reducido"
    )
    await elegir(page, "Internacional")
    await expect(estado).toHaveText(/Guardado en tu cuenta/)

    // Otro navegador (sin tema local) recibe lo guardado en la cuenta.
    const otra = await nuevaSesion(abrirContexto, cuenta)
    await otra.goto("/cuenta/preferencias")
    await expect(
      otra.getByRole("switch", { name: "Reducir el movimiento" })
    ).toBeChecked()
    await expect(
      otra.getByRole("radio", { name: /^Internacional/ })
    ).toBeChecked()
    await expect(otra.locator("html")).toHaveClass(/\blight\b/)
    await otra.context().close()

    // Deja la cuenta como estaba.
    await elegir(page, "Oscuro")
    await page.getByRole("switch", { name: "Reducir el movimiento" }).click()
    await elegir(page, "Colombia")
    await expect(estado).toHaveText(/Guardado en tu cuenta/)
  })

  test("seguridad: exige la contraseña actual y la cambia", async ({
    page,
    abrirContexto,
  }) => {
    await ingresarALaCuenta(page, cuenta)
    await page.goto("/cuenta/seguridad")
    const nueva = generarContrasena()

    await page.getByRole("button", { name: "Cambiar contraseña" }).click()
    const dialogo = page.getByRole("dialog", { name: "Cambiar contraseña" })
    await campo(dialogo, "Contraseña actual").fill(`${cuenta.password}x`)
    await campo(dialogo, "Contraseña nueva").fill(nueva)
    await campo(dialogo, "Repite la contraseña nueva").fill(nueva)
    await expect(
      dialogo.getByRole("meter", { name: "Seguridad de la contraseña" })
    ).toBeVisible()
    await dialogo.getByRole("button", { name: "Actualizar contraseña" }).click()
    await expect(
      dialogo.getByText("La contraseña actual no es correcta.")
    ).toBeVisible()

    await campo(dialogo, "Contraseña actual").fill(cuenta.password)
    await dialogo.getByRole("button", { name: "Actualizar contraseña" }).click()
    await expect(page.getByText("Contraseña actualizada")).toBeVisible()
    await expect(dialogo).toBeHidden()
    cuenta.password = nueva

    // La contraseña nueva sirve para ingresar desde otro navegador.
    const otra = await nuevaSesion(abrirContexto, cuenta)
    await otra.context().close()
  })

  test("seguridad: activa y desactiva la verificación en dos pasos", async ({
    page,
  }) => {
    await ingresarALaCuenta(page, cuenta)
    await page.goto("/cuenta/seguridad")
    const tarjeta = page.getByRole("region", {
      name: "Verificación en dos pasos",
    })
    await expect(tarjeta.getByText("Inactiva")).toBeVisible()

    await tarjeta.getByRole("button", { name: "Activar" }).click()
    const dialogo = page.getByRole("dialog", {
      name: "Activar verificación en dos pasos",
    })
    await expect(
      dialogo.getByRole("img", { name: "Código QR para tu app autenticadora" })
    ).toBeVisible()
    const secreto = (await dialogo.locator("code").innerText()).replace(
      /\s+/g,
      ""
    )
    await dialogo
      .getByLabel("Código de la app autenticadora")
      .fill(await codigoNuevo(secreto))
    await expect(
      page.getByText("Verificación en dos pasos activada")
    ).toBeVisible()
    await expect(tarjeta.getByText("Activa", { exact: true })).toBeVisible()

    await tarjeta.getByRole("button", { name: "Desactivar" }).click()
    const confirmar = page.getByRole("dialog", {
      name: "¿Desactivar la verificación?",
    })
    await confirmar
      .getByRole("textbox")
      .first()
      .fill(await codigoNuevo(secreto))
    await expect(
      page.getByText("Verificación en dos pasos desactivada")
    ).toBeVisible()
    await expect(tarjeta.getByText("Inactiva")).toBeVisible()
  })

  test("sesiones: cierra las demás y conserva la actual", async ({
    page,
    abrirContexto,
  }) => {
    const otra = await nuevaSesion(abrirContexto, cuenta)
    await ingresarALaCuenta(page, cuenta)
    await page.goto("/cuenta/seguridad")

    const sesiones = page.getByRole("region", { name: "Sesiones activas" })
    await expect(sesiones.getByText("Este dispositivo")).toBeVisible()
    await sesiones
      .getByRole("button", { name: "Cerrar las demás sesiones" })
      .click()
    await page
      .getByRole("alertdialog")
      .or(page.getByRole("dialog"))
      .getByRole("button", { name: "Cerrar sesiones" })
      .click()
    await expect(page.getByText("Cerramos tus otras sesiones")).toBeVisible()

    // La otra sesión quedó revocada; esta sigue activa. El DAL comprueba la
    // vigencia como máximo una vez por minuto y sesión (una sesión aal1 lo
    // nota al instante, al consultar sus factores): se reintenta hasta 90 s.
    await expect(async () => {
      await otra.goto("/cuenta/perfil")
      await expect(otra).toHaveURL(/\/ingresar/, { timeout: 2_000 })
    }).toPass({ intervals: [5_000, 15_000], timeout: 90_000 })
    await otra.context().close()
    await page.goto("/cuenta/perfil")
    await expect(page).toHaveURL(/\/cuenta\/perfil$/)
  })

  test("notificaciones: filtra y marca como leídas", async ({ page }) => {
    await borrarNotificaciones(servicio, usuarioId)
    // Inserción en bloque: PostgREST deja en NULL lo que una fila omite.
    const { error } = await servicio.from("notificaciones").insert([
      {
        usuario_id: usuarioId,
        tipo: "oferta.nueva_elegible",
        titulo: "Oferta E2E sin leer",
        mensaje: "Hay una oferta nueva para revisar.",
        url: "/cuenta/perfil",
        prioridad: 1,
        leida: false,
      },
      {
        usuario_id: usuarioId,
        tipo: "liquidacion.pagada",
        titulo: "Pago E2E leído",
        mensaje: "Pagamos tu liquidación.",
        url: null,
        prioridad: 0,
        leida: true,
      },
    ])
    if (error)
      throw new Error(`No se pudieron crear notificaciones: ${error.message}`)

    await ingresarALaCuenta(page, cuenta)
    await page.goto("/notificaciones")
    await expect(
      page.getByRole("heading", { level: 1, name: "Notificaciones" })
    ).toBeVisible()
    await expect(page.getByText("Oferta E2E sin leer")).toBeVisible()
    await expect(page.getByText("Pago E2E leído")).toBeVisible()

    await page
      .getByRole("button", { name: "No leídas", exact: false })
      .first()
      .click()
    await expect
      .poll(() => new URL(page.url()).searchParams.get("estado"))
      .toBe("no_leidas")
    await expect(page.getByText("Pago E2E leído")).toHaveCount(0)

    await page
      .getByRole("button", { name: "Marcar como leída: Oferta E2E sin leer" })
      .click()
    await expect(
      page.getByRole("button", {
        name: "Marcar como no leída: Oferta E2E sin leer",
      })
    ).toBeVisible()
  })

  test("accesibilidad de las pantallas en ambos temas", async ({ page }) => {
    // Sin animaciones de entrada: un texto a medio aparecer da un contraste falso.
    await page.emulateMedia({ reducedMotion: "reduce" })
    await ingresarALaCuenta(page, cuenta)
    for (const tema of ["dark", "light"] as const) {
      // next-themes lee el tema elegido de localStorage antes de pintar.
      await page.evaluate(
        (valor) => window.localStorage.setItem("theme", valor),
        tema
      )
      for (const ruta of [
        "/cuenta/perfil",
        "/cuenta/seguridad",
        "/cuenta/preferencias",
        "/notificaciones",
      ]) {
        await page.goto(ruta)
        await expect(page.locator("html")).toHaveClass(
          new RegExp(`\\b${tema}\\b`)
        )
        const { violations } = await new AxeBuilder({ page })
          .include("main")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
        const graves = violations.filter((violacion) =>
          ["serious", "critical"].includes(violacion.impact ?? "")
        )
        expect(graves, `${ruta} (${tema})`).toEqual([])
      }
    }
  })
})
