/**
 * Proyecto `preparacion`: abre una vez las sesiones de solo lectura que
 * comparten los specs (ver `utilidades/sesiones.ts`) y las guarda en disco.
 * Los proyectos de escritorio, tablet y móvil dependen de él.
 */
import { clienteComoSuperadmin } from "../scripts/bootstrap/provision-e2e"
import { type Credenciales, entorno, ingresar } from "./utilidades/cuentas"
import { ingresarConMfa, prepararCuentaMfa } from "./utilidades/mfa"
import { expect, type Page, test as preparar } from "./utilidades/prueba"
import {
  credencialesDemo,
  CUENTA_INTERNA,
  type NombreSesion,
  sesion,
} from "./utilidades/sesiones"

async function guardarSesion(page: Page, nombre: NombreSesion): Promise<void> {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.context().storageState({ path: sesion(nombre) })
}

async function abrirSesionDemo(
  page: Page,
  nombre: NombreSesion,
  credenciales: Credenciales
): Promise<void> {
  await ingresar(page, credenciales)
  await expect(page).toHaveURL(/\/inicio$/)
  await guardarSesion(page, nombre)
}

preparar("sesión interna (administrador con TOTP)", async ({ page }) => {
  // Enrolar el TOTP y esperar al siguiente código puede tardar más de 30 s.
  preparar.setTimeout(120_000)
  const servicio = await clienteComoSuperadmin(entorno)
  const cuenta = await prepararCuentaMfa(servicio, CUENTA_INTERNA)
  await ingresarConMfa(page, cuenta)
  await guardarSesion(page, "interno")
})

preparar("sesión del anunciante demo", async ({ page }) => {
  await abrirSesionDemo(page, "anunciante", credencialesDemo("ANUNCIANTE"))
})

preparar("sesión del medio demo", async ({ page }) => {
  await abrirSesionDemo(page, "medio", credencialesDemo("MEDIO"))
})
