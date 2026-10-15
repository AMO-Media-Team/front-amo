/**
 * `pnpm exec tsx scripts/bootstrap/cuenta-pista.ts <nombre> [SUPERADMIN|ADMIN|ANUNCIANTE|MEDIO] [medio-id]`
 *
 * Cuenta de prueba aislada para un agente o pista de desarrollo, con TOTP
 * propio: verificar un factor cierra las demás sesiones del usuario, así que
 * cada proceso que navega la app autenticado necesita su propia cuenta.
 *
 * Rol MEDIO: la cuenta se vincula al medio indicado o, sin él, al de la
 * cuenta demo `demo.medio@amo.test` (requiere los datos demo: `pnpm
 * demo:generar`). ANUNCIANTE usa la organización E2E. Los roles externos no
 * llevan TOTP.
 *
 * Escribe las credenciales (0600) en el archivo indicado por
 * `AMO_CUENTAS_PISTA_DIR` (por defecto `./.cuentas-pista/`, ignorado por git)
 * y no imprime contraseñas ni secretos. Idempotente.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { generarContrasena } from "./contrasena"
import { exigeTotp, type RolCuentaPrueba } from "./organizacion"
import {
  asegurarTotp,
  clienteComoSuperadmin,
  type CuentaE2E,
  prepararCuenta,
} from "./provision-e2e"
import { cargarEntorno, type ClienteSupabase, ErrorBootstrap } from "./supabase"

const ROLES = [
  "SUPERADMIN",
  "ADMIN",
  "ANUNCIANTE",
  "MEDIO",
] as const satisfies readonly RolCuentaPrueba[]
type RolPista = (typeof ROLES)[number]

/** Cuenta con nombre de los datos demo cuyo medio usan las pistas de rol MEDIO. */
const CORREO_MEDIO_DEMO = "demo.medio@amo.test"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Medio al que se vincula una pista de rol MEDIO: el indicado (debe existir)
 * o el de la cuenta demo del medio.
 */
async function medioParaPista(
  servicio: ClienteSupabase,
  indicado: string | undefined
): Promise<string> {
  if (indicado !== undefined) {
    if (!UUID.test(indicado)) {
      throw new ErrorBootstrap("El medio debe indicarse con su id (uuid).")
    }
    const { data, error } = await servicio
      .from("medios")
      .select("id")
      .eq("id", indicado)
      .is("deleted_at", null)
      .maybeSingle()
    if (error || !data)
      throw new ErrorBootstrap("No existe un medio con ese id.")
    return data.id
  }
  const { data, error } = await servicio
    .from("perfiles")
    .select("medio_id")
    .eq("email", CORREO_MEDIO_DEMO)
    .maybeSingle()
  if (error || !data?.medio_id) {
    throw new ErrorBootstrap(
      `No hay un medio demo al que vincular la cuenta (${CORREO_MEDIO_DEMO}): ejecuta \`pnpm demo:generar\` o indica el id de un medio.`
    )
  }
  return data.medio_id
}

interface CredencialesPista {
  email: string
  password: string
  totpSecreto: string | null
  rol: RolPista
}

function leerExistente(ruta: string): CredencialesPista | null {
  try {
    return JSON.parse(readFileSync(ruta, "utf8")) as CredencialesPista
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const [nombre, rolArg = "SUPERADMIN", medioArg] = process.argv.slice(2)
  if (!nombre || !/^[a-z0-9-]{2,30}$/.test(nombre)) {
    throw new Error(
      "Uso: cuenta-pista.ts <nombre-en-minusculas> [rol] [medio-id]"
    )
  }
  const rol = rolArg.toUpperCase() as RolPista
  if (!ROLES.includes(rol)) throw new Error(`Rol no soportado: ${rolArg}`)

  const directorio = process.env.AMO_CUENTAS_PISTA_DIR ?? ".cuentas-pista"
  mkdirSync(directorio, { recursive: true, mode: 0o700 })
  const ruta = join(directorio, `${nombre}.json`)
  const previo = leerExistente(ruta)

  const email = `e2e.pista-${nombre}@amo.test`
  const password = previo?.password ?? generarContrasena()
  const entorno = cargarEntorno(".env.local")
  const servicio = await clienteComoSuperadmin(entorno)
  const cuenta: CuentaE2E = {
    clave: `PISTA_${nombre}`,
    rol,
    medioId:
      rol === "MEDIO" ? await medioParaPista(servicio, medioArg) : undefined,
    nombre: `Pista ${nombre}`,
    emailPorDefecto: email,
    variableEmail: `AMO_PISTA_${nombre}_EMAIL`,
    variablePassword: `AMO_PISTA_${nombre}_PASSWORD`,
    debeCambiarPassword: false,
    conTotp: exigeTotp(rol),
  }

  const usuarioId = await prepararCuenta(servicio, cuenta, password)
  const totpSecreto = cuenta.conTotp
    ? await asegurarTotp(
        entorno,
        servicio,
        usuarioId,
        { email, password },
        previo?.totpSecreto ?? undefined
      )
    : null

  const credenciales: CredencialesPista = { email, password, totpSecreto, rol }
  writeFileSync(ruta, JSON.stringify(credenciales, null, 2), { mode: 0o600 })
  chmodSync(ruta, 0o600)
  process.stderr.write(`✓ Cuenta de pista lista: ${email} → ${ruta}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(
    `✗ ${error instanceof Error ? error.message : String(error)}\n`
  )
  process.exit(1)
})
