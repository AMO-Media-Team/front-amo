/**
 * `pnpm bootstrap:restablecer-mfa [correo]` — recuperación de emergencia cuando
 * una persona pierde el dispositivo de su app autenticadora y nadie más puede
 * restablecerle la verificación en dos pasos desde Usuarios (caso típico: el
 * único superadministrador).
 *
 * 1. Borra con la Admin API todos los factores MFA de la cuenta
 *    (por defecto, `SUPERADMIN_EMAIL`).
 * 2. Deja constancia en la bitácora (sin datos sensibles).
 * 3. Genera un enlace `recovery` de un solo uso e imprime SOLO ese enlace:
 *    al abrirlo, la persona define una contraseña nueva (lo que cierra sus
 *    demás sesiones) y la app le exige configurar el nuevo dispositivo antes
 *    de dejarla entrar (compuertas del DAL, docs/modelo-datos.md §2.6).
 *
 * Requiere `SUPABASE_SECRET_KEY`: solo puede ejecutarlo quien administra el
 * servidor. Para cualquier otra cuenta, lo normal es «Restablecer verificación
 * en dos pasos» en Administración → Usuarios.
 */
import { argumentosRpc } from "../../src/lib/supabase/rpc"
import {
  buscarUsuarioPorEmail,
  cargarEntorno,
  type ClienteSupabase,
  crearClienteServicio,
  enlaceConfirmacion,
  ErrorBootstrap,
} from "./supabase"

const ORIGEN = "bootstrap:restablecer-mfa"

/** Borra todos los factores de la cuenta y devuelve cuántos había. */
async function borrarFactores(
  servicio: ClienteSupabase,
  usuarioId: string
): Promise<number> {
  const mfa = servicio.auth.admin.mfa
  const { data, error } = await mfa.listFactors({ userId: usuarioId })
  if (error) {
    throw new ErrorBootstrap(
      `No se pudieron leer los factores: ${error.message}`
    )
  }
  for (const factor of data.factors) {
    const { error: errorBorrado } = await mfa.deleteFactor({
      id: factor.id,
      userId: usuarioId,
    })
    if (errorBorrado) {
      throw new ErrorBootstrap(
        `No se pudo borrar un factor: ${errorBorrado.message}`
      )
    }
  }
  return data.factors.length
}

async function registrarEnBitacora(
  servicio: ClienteSupabase,
  usuarioId: string,
  factoresBorrados: number
): Promise<void> {
  const { error } = await servicio.rpc(
    "registrar_evento_srv",
    argumentosRpc<"registrar_evento_srv">({
      p_actor_id: null,
      p_accion: "OTRO",
      p_entidad: "perfiles",
      p_entidad_id: usuarioId,
      p_metadatos: {
        evento: "RESTABLECER_MFA",
        factores_borrados: factoresBorrados,
        origen: ORIGEN,
      },
      p_ip: null,
      p_pais: null,
      p_ciudad: null,
      p_ua: null,
    })
  )
  if (error) {
    throw new ErrorBootstrap(
      `No se pudo registrar en la bitácora: ${error.message}`
    )
  }
}

async function generarEnlaceRecuperacion(
  servicio: ClienteSupabase,
  email: string
): Promise<string> {
  const { data, error } = await servicio.auth.admin.generateLink({
    type: "recovery",
    email,
  })
  if (error) {
    throw new ErrorBootstrap(`No se pudo generar el enlace: ${error.message}`)
  }
  return data.properties.hashed_token
}

async function main(): Promise<void> {
  const entorno = cargarEntorno()
  const email = process.argv[2] ?? entorno.superadminEmail
  if (!email) {
    throw new ErrorBootstrap(
      "Indica el correo o define SUPERADMIN_EMAIL en .env.local."
    )
  }

  const servicio = crearClienteServicio(entorno)
  const usuario = await buscarUsuarioPorEmail(servicio, email)
  if (!usuario?.email_confirmed_at) {
    throw new ErrorBootstrap(
      "No existe una cuenta confirmada con ese correo (para crearla: pnpm bootstrap:superadmin)."
    )
  }

  const factoresBorrados = await borrarFactores(servicio, usuario.id)
  await registrarEnBitacora(servicio, usuario.id, factoresBorrados)
  const tokenHash = await generarEnlaceRecuperacion(servicio, email)

  process.stderr.write(
    `✓ Factores borrados: ${factoresBorrados}. Enlace de un solo uso:\n`
  )
  process.stdout.write(
    `${enlaceConfirmacion(entorno.sitioUrl, tokenHash, "recovery")}\n`
  )
}

main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error)
  process.stderr.write(`bootstrap:restablecer-mfa falló: ${mensaje}\n`)
  process.exitCode = 1
})
