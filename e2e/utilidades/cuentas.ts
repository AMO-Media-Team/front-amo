/**
 * Cuentas y utilidades de las pruebas E2E. Las cuentas las crea
 * `scripts/bootstrap/usuarios-e2e.ts` (variables `E2E_*` en `.env.local`).
 */
import { expect, type Page } from "@playwright/test"

import {
  codigoTotpEstable,
  type CuentaE2E,
  cuentaE2E,
  emailDe,
  VARIABLE_TOTP_ADMIN,
} from "../../scripts/bootstrap/provision-e2e"
import {
  cargarEntorno,
  crearClienteServicio,
  type EntornoBootstrap,
  rutaConfirmacion,
} from "../../scripts/bootstrap/supabase"
import { PASO_TOTP_SEGUNDOS } from "../../scripts/bootstrap/totp"

export const entorno: EntornoBootstrap = cargarEntorno()

export interface Credenciales {
  email: string
  password: string
}

export function credenciales(clave: CuentaE2E["clave"]): Credenciales {
  const cuenta = cuentaE2E(clave)
  const password = process.env[cuenta.variablePassword]
  if (!password) {
    throw new Error(
      `Falta ${cuenta.variablePassword}: ejecuta \`pnpm exec tsx scripts/bootstrap/usuarios-e2e.ts\`.`
    )
  }
  return { email: emailDe(cuenta), password }
}

export async function ingresar(
  page: Page,
  { email, password }: Credenciales
): Promise<void> {
  await page.goto("/ingresar")
  await page.getByLabel("Correo electrónico").fill(email)
  await page.getByLabel("Contraseña", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Ingresar" }).click()
}

/**
 * Nombre accesible del encabezado de Inicio: el panel saluda según la hora de
 * Bogotá («Buenos días, Ana»). Se aceptan los tres saludos para que la prueba
 * no dependa de la hora ni falle al cruzar un cambio de franja.
 */
export function saludoDe(nombre: string): RegExp {
  const literal = nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`^(?:Buenos días|Buenas tardes|Buenas noches), ${literal}$`)
}

/** Saludo de Inicio para cualquier persona (cuentas demo: su nombre lo fija la semilla). */
export const CUALQUIER_SALUDO =
  /^(?:Buenos días|Buenas tardes|Buenas noches), \p{L}+$/u

let ultimoPasoTotp = -1

/**
 * Código TOTP del administrador E2E. Nunca repite el código de una
 * verificación anterior de la misma ejecución: espera al siguiente periodo.
 */
export async function codigoAdmin(): Promise<string> {
  const secreto = process.env[VARIABLE_TOTP_ADMIN]
  if (!secreto) throw new Error(`Falta ${VARIABLE_TOTP_ADMIN} en .env.local.`)
  const pasoActual = () => Math.floor(Date.now() / 1000 / PASO_TOTP_SEGUNDOS)
  while (pasoActual() <= ultimoPasoTotp) {
    await new Promise((resolver) => setTimeout(resolver, 1000))
  }
  const codigo = await codigoTotpEstable(secreto)
  ultimoPasoTotp = pasoActual()
  return codigo
}

export async function escribirCodigoMfa(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/mfa\/verificar/)
  // Al completar los 6 dígitos el formulario se envía solo.
  await page.getByLabel("Código de verificación").fill(await codigoAdmin())
}

/** Enlace de recuperación como el que genera un administrador (sin enviar correo). */
export async function enlaceRecuperacion(email: string): Promise<string> {
  const servicio = crearClienteServicio(entorno)
  const { data, error } = await servicio.auth.admin.generateLink({
    type: "recovery",
    email,
  })
  if (error) throw new Error(`No se pudo generar el enlace: ${error.message}`)
  return rutaConfirmacion(data.properties.hashed_token, "recovery")
}
