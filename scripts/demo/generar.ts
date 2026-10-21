/**
 * `pnpm demo:generar <usuarios|pasos> [--forzar] [--desde AAAA-MM] [--semilla 0.4242]`
 * Datos demo (docs/modelo-datos.md §10 y supabase/seed/demo/README.md).
 *
 * - `usuarios`: crea en Auth (Admin API) las cuentas de `cuentas.ts`, enrola
 *   un TOTP en las tres cuentas internas con nombre y AGREGA a `.env.local`
 *   las credenciales `DEMO_*` (las variables que ya existen no se tocan).
 *   Idempotente. El rol, la organización y el estado los fija después
 *   `private.demo_actores` (SQL con `amo.modo_carga`).
 * - `pasos`: escribe `supabase/seed/demo/pasos/*.sql`, una transacción por
 *   paso, en el orden en que se ejecutan por MCP `execute_sql` (el único
 *   canal con `session_user = postgres`; ver README).
 *
 * No imprime contraseñas ni claves. Fuera de un entorno local exige `--forzar`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { agregarVariables } from "../bootstrap/archivo-env"
import { generarContrasena } from "../bootstrap/contrasena"
import { enrolarTotpEnSesion } from "../bootstrap/mfa"
import {
  cargarEntorno,
  type ClienteSupabase,
  crearClientePublico,
  crearClienteServicio,
  type EntornoBootstrap,
  ErrorBootstrap,
} from "../bootstrap/supabase"
import {
  type CuentaDemo,
  cuentasDemo,
  esCorreoDemo,
  mesesEntre,
} from "./cuentas"
import { enParalelo, exigirEntornoLocal, opcion } from "./entorno"

const ARCHIVO_ENV = ".env.local"
const DIRECTORIO_PASOS = join("supabase", "seed", "demo", "pasos")
const SEMILLA_POR_DEFECTO = "0.4242"
const MES_INICIAL = "2025-07"

/** Correo → id de las cuentas demo que ya existen (por su perfil). */
async function cuentasExistentes(
  servicio: ClienteSupabase
): Promise<Map<string, string>> {
  const existentes = new Map<string, string>()
  const TAMANO = 1000
  for (let desde = 0; ; desde += TAMANO) {
    const { data, error } = await servicio
      .from("perfiles")
      .select("id, email")
      .or('email.like."%@demo.amo.co",email.like."demo.%@amo.test"')
      .order("id")
      .range(desde, desde + TAMANO - 1)
    if (error) {
      throw new ErrorBootstrap(
        `No se pudieron leer los perfiles: ${error.message}`
      )
    }
    for (const perfil of data) {
      const email = String(perfil.email).toLowerCase()
      if (esCorreoDemo(email)) existentes.set(email, perfil.id)
    }
    if (data.length < TAMANO) return existentes
  }
}

async function asegurarUsuario(
  servicio: ClienteSupabase,
  cuenta: CuentaDemo,
  idExistente: string | undefined,
  password: string | undefined
): Promise<string> {
  const atributos = {
    email_confirm: true,
    app_metadata: { rol: cuenta.clase, demo: true },
    ...(password ? { password } : {}),
  }
  const { data, error } = idExistente
    ? await servicio.auth.admin.updateUserById(idExistente, atributos)
    : await servicio.auth.admin.createUser({
        email: cuenta.email,
        ...atributos,
        password: password ?? generarContrasena(),
      })
  if (error) {
    throw new ErrorBootstrap(
      `No se pudo preparar ${cuenta.email}: ${error.message}`
    )
  }
  return data.user.id
}

async function tieneTotp(
  servicio: ClienteSupabase,
  usuarioId: string
): Promise<boolean> {
  const { data, error } = await servicio.auth.admin.mfa.listFactors({
    userId: usuarioId,
  })
  if (error) {
    throw new ErrorBootstrap(
      `No se pudieron leer los factores: ${error.message}`
    )
  }
  return data.factors.some(
    (factor) => factor.factor_type === "totp" && factor.status === "verified"
  )
}

/** Enrola un TOTP como lo haría la persona y devuelve la clave base32. */
async function enrolarTotp(
  entorno: EntornoBootstrap,
  servicio: ClienteSupabase,
  usuarioId: string,
  email: string,
  password: string
): Promise<string> {
  const { data, error } = await servicio.auth.admin.mfa.listFactors({
    userId: usuarioId,
  })
  if (error) {
    throw new ErrorBootstrap(
      `No se pudieron leer los factores: ${error.message}`
    )
  }
  for (const factor of data.factors) {
    const borrado = await servicio.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: usuarioId,
    })
    if (borrado.error) {
      throw new ErrorBootstrap(
        `No se pudo borrar un factor: ${borrado.error.message}`
      )
    }
  }
  const publico = crearClientePublico(entorno)
  const ingreso = await publico.auth.signInWithPassword({ email, password })
  if (ingreso.error) {
    throw new ErrorBootstrap(
      `No se pudo ingresar como ${email}: ${ingreso.error.message}`
    )
  }
  const secreto = await enrolarTotpEnSesion(publico, "AMO Demo")
  await publico.auth.signOut({ scope: "local" })
  return secreto
}

async function generarUsuarios(): Promise<void> {
  const entorno = cargarEntorno(ARCHIVO_ENV)
  exigirEntornoLocal(entorno)
  const servicio = crearClienteServicio(entorno)
  const cuentas = cuentasDemo()
  const existentes = await cuentasExistentes(servicio)
  const variables: Record<string, string> = {}
  let creadas = 0

  // Cuentas con nombre: contraseña conocida (la de `.env.local` o una nueva) y TOTP en los roles internos.
  for (const cuenta of cuentas.filter((candidata) => candidata.variable)) {
    const prefijo = cuenta.variable as string
    const password = process.env[`${prefijo}_PASSWORD`] ?? generarContrasena()
    const existente = existentes.get(cuenta.email)
    const usuarioId = await asegurarUsuario(
      servicio,
      cuenta,
      existente,
      password
    )
    if (!existente) creadas += 1
    variables[`${prefijo}_EMAIL`] = cuenta.email
    variables[`${prefijo}_PASSWORD`] = password
    if (cuenta.conTotp) {
      const conocido = process.env[`${prefijo}_TOTP_SECRET`]
      variables[`${prefijo}_TOTP_SECRET`] =
        conocido && (await tieneTotp(servicio, usuarioId))
          ? conocido
          : await enrolarTotp(
              entorno,
              servicio,
              usuarioId,
              cuenta.email,
              password
            )
    }
    process.stderr.write(`✓ ${cuenta.email}\n`)
  }

  // El resto solo necesita existir: contraseña aleatoria que no se guarda.
  const pendientes = cuentas.filter(
    (cuenta) => !cuenta.variable && !existentes.has(cuenta.email)
  )
  await enParalelo(pendientes, async (cuenta) => {
    await asegurarUsuario(servicio, cuenta, undefined, undefined)
    creadas += 1
  })

  const { contenido, agregadas } = agregarVariables(
    readFileSync(ARCHIVO_ENV, "utf8"),
    variables,
    "Cuentas de la demo (scripts/demo/generar.ts). No usar en producción."
  )
  if (agregadas.length > 0) writeFileSync(ARCHIVO_ENV, contenido)
  const desactualizadas = Object.keys(variables).filter(
    (clave) =>
      !agregadas.includes(clave) && process.env[clave] !== variables[clave]
  )
  if (desactualizadas.length > 0) {
    throw new ErrorBootstrap(
      `Estas variables de ${ARCHIVO_ENV} ya no corresponden a la cuenta: ${desactualizadas.join(", ")}. Bórralas y vuelve a ejecutar.`
    )
  }
  process.stderr.write(
    `Cuentas demo: ${cuentas.length} (${creadas} nuevas). Variables agregadas a ${ARCHIVO_ENV}: ${agregadas.length > 0 ? agregadas.join(", ") : "ninguna"}.\n` +
      "Siguiente paso: ejecutar supabase/seed/demo por MCP (ver README).\n"
  )
}

/** Envuelve una llamada en la transacción de carga (§10.1). */
function transaccion(sentencia: string): string {
  return [
    "begin;",
    "set local amo.modo_carga = 'on';",
    "set local statement_timeout = '110s';",
    `${sentencia};`,
    "commit;",
    "",
  ].join("\n")
}

function escribirPasos(): void {
  const semilla = opcion("--semilla") ?? SEMILLA_POR_DEFECTO
  if (!/^0\.\d{1,8}$/.test(semilla)) {
    throw new ErrorBootstrap(
      "La semilla debe ser un decimal entre 0 y 1 (p. ej. 0.4242)."
    )
  }
  const meses = mesesEntre(opcion("--desde") ?? MES_INICIAL, new Date())
  const pasos: Array<[nombre: string, sql: string]> = [
    ["10_catalogos", transaccion("select private.demo_catalogos()")],
    ["11_actores", transaccion(`select private.demo_actores(${semilla})`)],
    ...meses.map((mes): [string, string] => [
      `20_mes_${mes.slice(0, 7)}`,
      transaccion(`select private.demo_mes(date '${mes}', ${semilla})`),
    ]),
    ...meses.map((mes): [string, string] => [
      `40_finanzas_${mes.slice(0, 7)}`,
      transaccion(`select private.demo_finanzas(date '${mes}', ${semilla})`),
    ]),
    ["50_cierre", transaccion(`select private.demo_cierre(${semilla})`)],
    ["51_accesos", transaccion(`select private.demo_accesos(${semilla})`)],
    ...meses.map((mes): [string, string] => [
      `60_bitacora_${mes.slice(0, 7)}`,
      transaccion(`select private.demo_volcar_bitacora(date '${mes}')`),
    ]),
    ["70_avisos", transaccion("select private.demo_volcar_avisos()")],
    ["80_verificar", "select private.demo_verificar();\n"],
  ]
  mkdirSync(DIRECTORIO_PASOS, { recursive: true })
  for (const [nombre, sql] of pasos) {
    writeFileSync(join(DIRECTORIO_PASOS, `${nombre}.sql`), sql)
  }
  process.stderr.write(
    `${pasos.length} pasos en ${DIRECTORIO_PASOS} (${meses.length} meses, semilla ${semilla}).\n` +
      "Orden: 00_base.sql … 06_cierre.sql (definiciones) → pasos/*.sql por nombre. Ver supabase/seed/demo/README.md.\n"
  )
}

async function main(): Promise<void> {
  const comando = process.argv[2]
  if (comando === "usuarios") return generarUsuarios()
  if (comando === "pasos") return escribirPasos()
  throw new ErrorBootstrap(
    "Uso: pnpm demo:generar <usuarios|pasos> [--forzar] [--desde AAAA-MM] [--semilla 0.4242]"
  )
}

main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error)
  process.stderr.write(`demo:generar falló: ${mensaje}\n`)
  process.exitCode = 1
})
