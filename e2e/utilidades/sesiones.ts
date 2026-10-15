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

import type { CuentaE2E } from "../../scripts/bootstrap/provision-e2e"
import type { Credenciales } from "./cuentas"

export type NombreSesion = "interno" | "anunciante" | "medio"

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
