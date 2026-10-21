/**
 * `pnpm exec tsx scripts/bootstrap/usuarios-e2e.ts` — cuentas para las pruebas E2E:
 *
 * - ADMIN con TOTP verificado (clave en `E2E_ADMIN_TOTP_SECRET`).
 * - ANUNCIANTE sin MFA.
 * - ANUNCIANTE con cambio de contraseña obligatorio.
 *
 * Contraseñas aleatorias que se AGREGAN a `.env.local` (`E2E_*`); las
 * variables que ya existen no se tocan y se reutilizan, así que el script es
 * idempotente. Requiere un superadministrador activo (`pnpm bootstrap:superadmin`).
 * No imprime contraseñas ni claves.
 */
import { readFileSync, writeFileSync } from "node:fs"

import { agregarVariables } from "./archivo-env"
import { generarContrasena } from "./contrasena"
import {
  asegurarTotp,
  clienteComoSuperadmin,
  CUENTAS_E2E,
  emailDe,
  prepararCuenta,
  VARIABLE_TOTP_ADMIN,
} from "./provision-e2e"
import { cargarEntorno } from "./supabase"

const ARCHIVO_ENV = ".env.local"

async function main(): Promise<void> {
  const entorno = cargarEntorno(ARCHIVO_ENV)
  const servicio = await clienteComoSuperadmin(entorno)
  const variables: Record<string, string> = {}

  for (const cuenta of CUENTAS_E2E) {
    const email = emailDe(cuenta)
    const password = process.env[cuenta.variablePassword] ?? generarContrasena()
    const usuarioId = await prepararCuenta(servicio, cuenta, password)
    variables[cuenta.variableEmail] = email
    variables[cuenta.variablePassword] = password

    if (cuenta.conTotp) {
      variables[VARIABLE_TOTP_ADMIN] = await asegurarTotp(
        entorno,
        servicio,
        usuarioId,
        { email, password },
        process.env[VARIABLE_TOTP_ADMIN]
      )
    }
    process.stderr.write(`✓ ${cuenta.clave}: ${email}\n`)
  }

  const { contenido, agregadas } = agregarVariables(
    readFileSync(ARCHIVO_ENV, "utf8"),
    variables,
    "Cuentas de prueba E2E (scripts/bootstrap/usuarios-e2e.ts). No usar en producción."
  )
  if (agregadas.length > 0) writeFileSync(ARCHIVO_ENV, contenido)
  process.stderr.write(
    agregadas.length > 0
      ? `Variables agregadas a ${ARCHIVO_ENV}: ${agregadas.join(", ")}\n`
      : `${ARCHIVO_ENV} ya tenía todas las variables E2E.\n`
  )
}

main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error)
  process.stderr.write(`usuarios-e2e falló: ${mensaje}\n`)
  process.exitCode = 1
})
