import { generarContrasena } from "../scripts/bootstrap/contrasena"
import {
  codigoTotpEstable,
  NOMBRE_INVITADO_E2E,
  prepararInvitacionE2E,
  restablecerCuenta,
} from "../scripts/bootstrap/provision-e2e"
import {
  credenciales,
  enlaceRecuperacion,
  entorno,
  escribirCodigoMfa,
  ingresar,
  saludoDe,
} from "./utilidades/cuentas"
import { expect, test } from "./utilidades/prueba"
import { PROYECTO_CON_CUENTAS } from "./utilidades/proyectos"

/** Flujos de acceso contra `pnpm build && pnpm start` y el proyecto Supabase real. */

/**
 * Los flujos que modifican una cuenta compartida (contraseña, MFA, sesiones)
 * corren solo en el proyecto de escritorio: en paralelo con tablet y móvil se
 * pisarían (verificar un TOTP cierra las demás sesiones de la cuenta y cada
 * preparación restablece la cuenta).
 */

function soloEnProyectoConCuentas(
  preparar?: () => Promise<void>,
  limpiar?: () => Promise<void>
) {
  // Playwright exige desestructurar los fixtures aunque no se usen.
  test.beforeAll(async ({}, info) => {
    info.skip(
      info.project.name !== PROYECTO_CON_CUENTAS,
      "Cuenta compartida: este flujo corre solo en el proyecto de escritorio."
    )
    await preparar?.()
  })
  test.afterAll(async ({}, info) => {
    if (info.project.name === PROYECTO_CON_CUENTAS) await limpiar?.()
  })
}

test.describe("sin sesión", () => {
  test("una ruta privada lleva al ingreso conservando el destino", async ({
    page,
  }) => {
    await page.goto("/inicio")
    await expect(page).toHaveURL(/\/ingresar\?next=%2Finicio$/)
    await expect(
      page.getByRole("heading", { name: "Te damos la bienvenida" })
    ).toBeVisible()
  })

  test("credenciales inválidas muestran un mensaje genérico", async ({
    page,
  }) => {
    // IP de documentación (TEST-NET-2) al azar: los fallos no se acumulan en
    // el limitador de la IP local, que bloquearía los demás ingresos.
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": `198.51.100.${1 + Math.floor(Math.random() * 254)}`,
    })
    await ingresar(page, {
      email: `no-existe-${Date.now()}@amo.test`,
      password: "Contraseña-Incorrecta-1",
    })
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Correo o contraseña incorrectos." })
    ).toBeVisible()
    await expect(page).toHaveURL(/\/ingresar$/)
  })
})

test.describe("anunciante", () => {
  test("ingresa y llega a /inicio", async ({ page }) => {
    await ingresar(page, credenciales("ANUNCIANTE"))
    await expect(page).toHaveURL(/\/inicio$/)
    await expect(
      page.getByRole("heading", { name: saludoDe("Anunciante") })
    ).toBeVisible()
  })

  test("con sesión, un next que se normaliza a otro origen no sale de AMO", async ({
    page,
  }) => {
    await ingresar(page, credenciales("ANUNCIANTE"))
    await expect(page).toHaveURL(/\/inicio$/)

    // "/.//evil.example" se normaliza a "//evil.example" (protocolo relativo).
    for (const next of ["/.//evil.example", "/..//evil.example/robar"]) {
      const respuesta = await page.request.get(
        `/ingresar?${new URLSearchParams({ next })}`,
        { maxRedirects: 0 }
      )
      expect(respuesta.status()).toBe(307)
      expect(respuesta.headers()["location"]).toBe("/inicio")
    }
  })

  test("una sección sin permiso muestra la pantalla 403 dentro del shell", async ({
    page,
  }) => {
    await ingresar(page, credenciales("ANUNCIANTE"))
    await expect(page).toHaveURL(/\/inicio$/)

    await page.goto("/administracion/configuracion")
    await expect(
      page.getByRole("heading", {
        name: "No tienes permiso para ver esta sección",
      })
    ).toBeVisible()
    // El shell sigue presente y el contenido protegido no se envió.
    await expect(
      page.getByRole("button", { name: /^Cuenta de / })
    ).toBeVisible()
    await expect(
      page.getByText("Esta sección está en preparación")
    ).toHaveCount(0)
    expect(await page.content()).not.toContain(
      "Esta sección está en preparación"
    )
  })

  test("abrir /auth/confirm (GET) no consume el enlace", async ({ page }) => {
    const enlace = await enlaceRecuperacion(credenciales("ANUNCIANTE").email)

    await page.goto(enlace)
    const continuar = page.getByRole("button", { name: "Continuar" })
    await expect(continuar).toBeVisible()
    // Un segundo GET (p. ej. el previsualizador del correo) tampoco lo gasta.
    await page.reload()
    await expect(continuar).toBeVisible()

    await continuar.click()
    await expect(page).toHaveURL(/\/restablecer$/)
    await expect(
      page.getByRole("heading", { name: "Crea una contraseña nueva" })
    ).toBeVisible()
  })
})

test.describe("cierre de sesión", () => {
  soloEnProyectoConCuentas()
  test("cierra la sesión desde el menú de usuario", async ({ page }) => {
    await ingresar(page, credenciales("ANUNCIANTE"))
    await expect(page).toHaveURL(/\/inicio$/)

    await page.getByRole("button", { name: /^Cuenta de / }).click()
    await page.getByRole("menuitem", { name: "Cerrar sesión" }).click()

    await expect(page).toHaveURL(/\/ingresar\?motivo=sesion-cerrada$/)
    await expect(
      page.getByText("Cerraste sesión. ¡Hasta pronto!")
    ).toBeVisible()
    // Sin sesión, la aplicación vuelve a pedir el ingreso.
    await page.goto("/inicio")
    await expect(page).toHaveURL(/\/ingresar\?next=%2Finicio$/)
  })
})

test.describe("cambio de contraseña obligatorio", () => {
  const restablecer = () => restablecerCuenta(entorno, "CAMBIO")
  soloEnProyectoConCuentas(restablecer, restablecer)

  test("pide una contraseña nueva y luego entra a /inicio", async ({
    page,
  }) => {
    await ingresar(page, credenciales("CAMBIO"))
    await expect(page).toHaveURL(/\/cambiar-contrasena$/)

    const nueva = generarContrasena()
    await page.getByLabel("Contraseña nueva").fill(nueva)
    await page.getByLabel("Confirma la contraseña").fill(nueva)
    await page.getByRole("button", { name: "Cambiar contraseña" }).click()

    await expect(page).toHaveURL(/\/inicio$/)
  })
})

test.describe("administrador con TOTP", () => {
  // Cada verificación usa un código de un periodo TOTP nuevo (hasta 30 s de espera).
  test.describe.configure({ mode: "serial", timeout: 75_000 })
  const restablecer = () => restablecerCuenta(entorno, "ADMIN")
  soloEnProyectoConCuentas(restablecer, restablecer)

  test("verifica el código de su app y llega a /inicio", async ({ page }) => {
    await ingresar(page, credenciales("ADMIN"))
    await escribirCodigoMfa(page)
    await expect(page).toHaveURL(/\/inicio$/)
    await expect(
      page.getByRole("heading", { name: saludoDe("Administración") })
    ).toBeVisible()
  })

  test("recupera la contraseña verificando antes el TOTP", async ({ page }) => {
    await page.goto(await enlaceRecuperacion(credenciales("ADMIN").email))
    await page.getByRole("button", { name: "Continuar" }).click()

    await expect(page).toHaveURL(/\/mfa\/verificar\?next=%2Frestablecer$/)
    await escribirCodigoMfa(page)

    await expect(page).toHaveURL(/\/restablecer$/)
    const nueva = generarContrasena()
    await page.getByLabel("Contraseña nueva").fill(nueva)
    await page.getByLabel("Confirma la contraseña").fill(nueva)
    await page.getByRole("button", { name: "Guardar y continuar" }).click()

    await expect(page).toHaveURL(/\/inicio$/)
  })
})

test.describe("administrador invitado", () => {
  let enlace = ""
  soloEnProyectoConCuentas(async () => {
    enlace = await prepararInvitacionE2E(entorno)
  })

  test("primer ingreso: activa la cuenta, crea su contraseña y configura el TOTP", async ({
    page,
  }) => {
    await page.goto(enlace)
    await page.getByRole("button", { name: "Activar mi cuenta" }).click()

    await expect(page).toHaveURL(/\/cambiar-contrasena$/)
    const nueva = generarContrasena()
    await page.getByLabel("Contraseña nueva").fill(nueva)
    await page.getByLabel("Confirma la contraseña").fill(nueva)
    await page.getByRole("button", { name: "Cambiar contraseña" }).click()

    await expect(page).toHaveURL(/\/mfa\/configurar$/)
    const clave = page.locator("code")
    await expect(clave).toHaveText(/^[A-Z2-7 ]{16,}$/)
    const codigo = await codigoTotpEstable((await clave.textContent()) ?? "")
    await page.getByLabel("Código de verificación").fill(codigo)

    await expect(page).toHaveURL(/\/inicio$/)
    await expect(
      page.getByRole("heading", {
        name: saludoDe(NOMBRE_INVITADO_E2E.split(" ")[0]),
      })
    ).toBeVisible()
  })
})
