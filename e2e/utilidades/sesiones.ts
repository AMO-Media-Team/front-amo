/**
 * Sesiones de solo lectura que comparten los specs. Las abre una vez por
 * ejecución `e2e/preparacion.setup.ts` (proyecto `preparacion`) y cada spec
 * las carga con `test.use({ storageState: sesion("interno") })`.
 *
 * Así los tres proyectos (escritorio, tablet y móvil) recorren la aplicación
 * en paralelo sin volver a ingresar: verificar un TOTP cierra las demás
 * sesiones de la cuenta, de modo que un ingreso por prueba las pisaría. Las
 * pruebas que usan estas sesiones NO cambian la cuenta ni cierran la sesión;
 * los flujos que sí lo hacen preparan su propia cuenta exclusiva (`mfa.ts`).
 */
import path from "node:path"

import {
  type CuentaE2E,
  cuentaE2E,
  variableTotpDe,
} from "../../scripts/bootstrap/provision-e2e"
import { type Credenciales, credenciales } from "./cuentas"
import { codigoNuevo } from "./mfa"
import { esperarStreaming, expect, type Page } from "./prueba"

/**
 * `finanzas` es de un rol interno: expira tras 30 minutos sin uso
 * (`seguridad.inactividad_minutos_admin`). Quien la use tarde en la corrida
 * vuelve a ingresar con `ingresarComoLecturaFinanzas`.
 */
export type NombreSesion = "interno" | "finanzas" | "anunciante" | "medio"

/** Ignorado por git: los archivos contienen las cookies de sesión. */
const DIRECTORIO_SESIONES = path.join(
  __dirname,
  "..",
  "..",
  "playwright",
  ".auth"
)

export function sesion(nombre: NombreSesion): string {
  return path.join(DIRECTORIO_SESIONES, `${nombre}.json`)
}

/**
 * Administrador exclusivo de la sesión interna: ve los datos demo de toda la
 * plataforma (panel, mapa, reportes, operación y configuración).
 */
export const CUENTA_INTERNA: CuentaE2E = {
  clave: "LECTURA",
  rol: "ADMIN",
  nombre: "Lectura E2E",
  emailPorDefecto: "e2e.lectura@amo.test",
  variableEmail: "E2E_LECTURA_EMAIL",
  variablePassword: "E2E_LECTURA_PASSWORD",
  debeCambiarPassword: false,
  conTotp: true,
}

/**
 * Finanzas de solo lectura (rol FINANZAS con TOTP) de la sesión `finanzas`:
 * los pagos a medios piden `liquidaciones.registrar_pago`, que ADMIN no tiene.
 * La crea `pnpm bootstrap:e2e` (`E2E_LECTURA_FINANZAS_*`).
 */
export const CUENTA_LECTURA_FINANZAS = cuentaE2E("LECTURA_FINANZAS")

/** Correo, contraseña y clave TOTP de `.env.local` (las crea `pnpm bootstrap:e2e`). */
export function credencialesLecturaFinanzas(): Credenciales & {
  secreto: string
} {
  const variable = variableTotpDe(CUENTA_LECTURA_FINANZAS)
  const secreto = process.env[variable]
  if (!secreto) {
    throw new Error(`Falta ${variable}: ejecuta \`pnpm bootstrap:e2e\`.`)
  }
  return { ...credenciales(CUENTA_LECTURA_FINANZAS.clave), secreto }
}

/**
 * Ingresa como Finanzas de solo lectura (contraseña y código de la app) y
 * espera llegar a `destino` (Inicio por omisión). Verificar el TOTP cierra
 * las demás sesiones de la cuenta: úsalo desde un solo proceso a la vez.
 */
export async function ingresarComoLecturaFinanzas(
  page: Page,
  destino = "/inicio"
): Promise<void> {
  const { email, password, secreto } = credencialesLecturaFinanzas()
  const ruta = new URL(destino, "http://amo.local").pathname
  await page.goto(
    destino === "/inicio"
      ? "/ingresar"
      : `/ingresar?${new URLSearchParams({ next: destino })}`
  )
  await page.getByLabel("Correo electrónico").fill(email)
  await page.getByLabel("Contraseña", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Ingresar" }).click()
  await expect(page).toHaveURL(/\/mfa\/verificar/)
  // Al completar los 6 dígitos el formulario se envía solo.
  await page
    .getByLabel("Código de verificación")
    .fill(await codigoNuevo(secreto))
  await expect(page).toHaveURL((url) => url.pathname === ruta)
  await esperarStreaming(page)
}

/**
 * Cuentas con nombre de los datos demo (`pnpm demo:generar`): un anunciante y
 * un medio con historia real. No llevan verificación en dos pasos.
 */
export function credencialesDemo(rol: "ANUNCIANTE" | "MEDIO"): Credenciales {
  const email = process.env[`DEMO_${rol}_EMAIL`]
  const password = process.env[`DEMO_${rol}_PASSWORD`]
  if (!email || !password) {
    throw new Error(
      `Faltan DEMO_${rol}_EMAIL y DEMO_${rol}_PASSWORD: ejecuta \`pnpm demo:generar\`.`
    )
  }
  return { email, password }
}
