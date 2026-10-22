/**
 * `pnpm bootstrap:e2e` (`scripts/bootstrap/usuarios-e2e.ts`) — cuentas para las pruebas E2E:
 *
 * - ADMIN con TOTP verificado (clave en `E2E_ADMIN_TOTP_SECRET`).
 * - ANUNCIANTE sin MFA.
 * - ANUNCIANTE con cambio de contraseña obligatorio.
 * - MEDIO del «Medio E2E»: VERIFICADO nivel 1, con una cuenta de Instagram
 *   verificada (40.000 seguidores), datos de pago cifrados y los documentos
 *   del nivel aprobados y vigentes (`aprovisionar-medios.ts`).
 * - MEDIO del «Medio Nuevo E2E»: PENDIENTE recién registrado, sin cuentas,
 *   documentos ni pago. Cada corrida lo reinicia a ese estado.
 *
 * Las cuentas externas aceptan los términos vigentes (si el cliente ya los
 * publicó), para que la compuerta de términos no cambie a dónde llegan.
 *
 * Contraseñas aleatorias que se AGREGAN a `.env.local` (`E2E_*`); las
 * variables que ya existen no se tocan y se reutilizan, así que el script es
 * idempotente. Requiere un superadministrador activo (`pnpm bootstrap:superadmin`)
 * y se niega a correr contra producción. No imprime contraseñas ni claves.
 */
import { readFileSync, writeFileSync } from "node:fs"

import {
  completarMedioVerificado,
  prepararMediosBase,
} from "./aprovisionar-medios"
import { agregarVariables } from "./archivo-env"
import { generarContrasena } from "./contrasena"
import { describirAccionMedioNuevo } from "./medios-e2e"
import {
  asegurarTotp,
  clienteComoSuperadmin,
  type CuentaE2E,
  cuentaE2E,
  CUENTAS_E2E,
  emailDe,
  prepararCuenta,
  VARIABLE_TOTP_ADMIN,
} from "./provision-e2e"
import {
  type ClienteSupabase,
  cargarEntorno,
  describirProyecto,
  type EntornoBootstrap,
} from "./supabase"
import { aceptarTerminosVigentes, tipoRolExterno } from "./terminos-e2e"

const ARCHIVO_ENV = ".env.local"

function informar(linea: string): void {
  process.stderr.write(`${linea}\n`)
}

interface CuentaLista {
  id: string
  email: string
  password: string
}

/**
 * Lo que la cuenta necesita además de su perfil: los términos vigentes
 * aceptados (cuentas externas) y, para el Medio E2E, que su medio esté
 * verificado. Devuelve lo que hizo, en palabras, para el registro.
 */
async function completarCuenta(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  cuenta: CuentaE2E,
  lista: CuentaLista
): Promise<string[]> {
  const hechos: string[] = []
  const tipoRol = tipoRolExterno(cuenta.rol)
  if (tipoRol) {
    const aceptados = await aceptarTerminosVigentes(servicio, {
      id: lista.id,
      email: lista.email,
      tipoRol,
    })
    if (aceptados > 0) hechos.push(`${aceptados} términos vigentes aceptados`)
  }
  if (cuenta.clave === "MEDIO") {
    hechos.push(...(await completarMedioVerificado(entorno, servicio, lista)))
  }
  return hechos
}

async function main(): Promise<void> {
  const entorno = cargarEntorno(ARCHIVO_ENV)
  const servicio = await clienteComoSuperadmin(entorno)
  informar(`Cuentas E2E en ${describirProyecto(entorno)}`)
  const variables: Record<string, string> = {}

  // Antes que las cuentas: un perfil MEDIO activo exige su medio.
  const accionNuevo = await prepararMediosBase(
    servicio,
    emailDe(cuentaE2E("MEDIO_NUEVO"))
  )
  informar(`✓ Medio Nuevo E2E: ${describirAccionMedioNuevo(accionNuevo)}`)

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
    const hechos = await completarCuenta(entorno, servicio, cuenta, {
      id: usuarioId,
      email,
      password,
    })
    informar(
      `✓ ${cuenta.clave}: ${email}${hechos.length > 0 ? ` (${hechos.join("; ")})` : ""}`
    )
  }

  const { contenido, agregadas } = agregarVariables(
    readFileSync(ARCHIVO_ENV, "utf8"),
    variables,
    "Cuentas de prueba E2E (scripts/bootstrap/usuarios-e2e.ts). No usar en producción."
  )
  if (agregadas.length > 0) writeFileSync(ARCHIVO_ENV, contenido)
  informar(
    agregadas.length > 0
      ? `Variables agregadas a ${ARCHIVO_ENV}: ${agregadas.join(", ")}`
      : `${ARCHIVO_ENV} ya tenía todas las variables E2E.`
  )
}

main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error)
  process.stderr.write(`usuarios-e2e falló: ${mensaje}\n`)
  process.exitCode = 1
})
