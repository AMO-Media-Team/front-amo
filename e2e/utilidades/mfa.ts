/**
 * Cuentas con verificación en dos pasos para las pruebas E2E: prepararlas con
 * un TOTP recién enrolado, pedir códigos que Supabase acepte e ingresar.
 *
 * Verificar un factor cierra las demás sesiones del usuario, así que cada
 * suite que ingresa con TOTP usa una cuenta EXCLUSIVA (o una sesión guardada
 * por `e2e/preparacion.setup.ts`, ver `sesiones.ts`).
 */
import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
} from "@playwright/test"

import { generarContrasena } from "../../scripts/bootstrap/contrasena"
import { codigoTotpNuevo, marcarTotpUsado } from "../../scripts/bootstrap/mfa"
import {
  asegurarTotp,
  type CuentaE2E,
  emailDe,
  prepararCuenta,
} from "../../scripts/bootstrap/provision-e2e"
import type { ClienteSupabase } from "../../scripts/bootstrap/supabase"
import { type Credenciales, entorno, ingresar } from "./cuentas"
import { esperarStreaming } from "./prueba"

export interface CredencialesMfa extends Credenciales {
  id: string
  secreto: string
}

/**
 * Código de un periodo TOTP posterior al último usado con ese secreto
 * (Supabase no acepta repetirlo). El registro de periodos gastados es el de
 * las fábricas (`scripts/bootstrap/mfa.ts`): un ingreso del spec y una
 * fábrica que entra con la misma cuenta en el mismo proceso no chocan.
 */
export async function codigoNuevo(secreto: string): Promise<string> {
  return codigoTotpNuevo(secreto)
}

/**
 * Deja la cuenta ACTIVA con contraseña nueva y un TOTP recién enrolado.
 * `rolId` la pasa a un rol personalizado (los de sistema salen de `cuenta.rol`).
 */
export async function prepararCuentaMfa(
  servicio: ClienteSupabase,
  cuenta: CuentaE2E,
  rolId?: string
): Promise<CredencialesMfa> {
  const email = emailDe(cuenta)
  const password = generarContrasena()
  const id = await prepararCuenta(servicio, cuenta, password)
  if (rolId) {
    const { error } = await servicio
      .from("perfiles")
      .update({ rol_id: rolId })
      .eq("id", id)
    if (error) throw new Error(`No se pudo asignar el rol: ${error.message}`)
  }
  const secreto = await asegurarTotp(
    entorno,
    servicio,
    id,
    { email, password },
    undefined
  )
  // Enrolar consume el código del periodo actual.
  marcarTotpUsado(secreto)
  return { id, email, password, secreto }
}

/** Ingreso completo: contraseña, código de la app y llegada a Inicio. */
export async function ingresarConMfa(
  page: Page,
  cuenta: CredencialesMfa
): Promise<void> {
  await ingresar(page, cuenta)
  await expect(page).toHaveURL(/\/mfa\/verificar/)
  // Al completar los 6 dígitos el formulario se envía solo.
  await page
    .getByLabel("Código de verificación")
    .fill(await codigoNuevo(cuenta.secreto))
  await expect(page).toHaveURL(/\/inicio$/)
  await esperarStreaming(page)
}

export type CookiesSesion = Awaited<ReturnType<BrowserContext["cookies"]>>

/**
 * Ingresa con TOTP en un contexto aparte y devuelve las cookies de la sesión
 * para que las pruebas de una suite la compartan (`usarSesion`): cada ingreso
 * exige un código de un periodo nuevo (hasta 30 s de espera).
 */
export async function abrirSesionMfa(
  navegador: Browser,
  baseURL: string | undefined,
  cuenta: CredencialesMfa
): Promise<CookiesSesion> {
  const contexto = await navegador.newContext({ baseURL })
  try {
    await ingresarConMfa(await contexto.newPage(), cuenta)
    return await contexto.cookies()
  } finally {
    await contexto.close()
  }
}

/** Continúa en la página de la prueba una sesión abierta con `abrirSesionMfa`. */
export async function usarSesion(
  page: Page,
  cookies: CookiesSesion
): Promise<void> {
  await page.context().addCookies(cookies)
}
