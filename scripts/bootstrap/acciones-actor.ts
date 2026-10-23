/**
 * Acciones con actor y sesión reales para el aprovisionamiento y las fábricas
 * E2E: las `*_srv` y `transicionar_srv` revalidan en cada llamada que el actor
 * esté ACTIVO y que su sesión siga viva (`private.validar_actor`), así que el
 * script ingresa como esa persona, usa el id de su sesión y la cierra. Igual
 * que la app: la máquina de estados decide, nunca un UPDATE de `estado`.
 */
import type { Json } from "../../src/types/database.types"
import {
  type ClienteSupabase,
  crearClientePublico,
  crearClienteUsuario,
  type EntornoBootstrap,
  ErrorBootstrap,
} from "./supabase"

/** Lo que `validar_actor` revalida (un `OperadorTemporal` también lo es). */
export interface ActorConSesion {
  usuarioId: string
  sesionId: string
}

interface ErrorApi {
  message: string
  details?: string | null
  hint?: string | null
}

/** Error de la API con su detalle legible y, si lo hay, la pista (`hint`). */
export function errorDeApi(accion: string, error: ErrorApi): ErrorBootstrap {
  const detalle = error.details ? ` (${error.details})` : ""
  const pista = error.hint ? ` [${error.hint}]` : ""
  return new ErrorBootstrap(`${accion}: ${error.message}${detalle}${pista}`)
}

async function conIngreso<T>(
  cliente: ClienteSupabase,
  credenciales: { email: string; password: string },
  accion: (cliente: ClienteSupabase, actor: ActorConSesion) => Promise<T>
): Promise<T> {
  const ingreso = await cliente.auth.signInWithPassword(credenciales)
  if (ingreso.error) {
    throw new ErrorBootstrap(
      `${credenciales.email} no pudo ingresar: ${ingreso.error.message}`
    )
  }
  try {
    const { data, error } = await cliente.auth.getClaims()
    if (error || !data) {
      throw new ErrorBootstrap(
        `No se pudo leer la sesión de ${credenciales.email}.`
      )
    }
    return await accion(cliente, {
      usuarioId: data.claims.sub,
      sesionId: data.claims.session_id,
    })
  } finally {
    await cliente.auth.signOut({ scope: "local" })
  }
}

/**
 * Ingresa con la contraseña de la persona, ejecuta `accion` con su sesión y
 * la cierra (solo esa: `scope: "local"`), también si la acción falla.
 */
export async function conSesionDeUsuario<T>(
  entorno: EntornoBootstrap,
  credenciales: { email: string; password: string },
  accion: (actor: ActorConSesion) => Promise<T>
): Promise<T> {
  return conIngreso(crearClientePublico(entorno), credenciales, (_, actor) =>
    accion(actor)
  )
}

/**
 * Como `conSesionDeUsuario`, pero `accion` recibe además el cliente con la
 * sesión de la persona (`crearClienteUsuario`): para escribir como la app con
 * la RLS de su rol (p. ej. las métricas del medio).
 */
export async function conClienteDeUsuario<T>(
  entorno: EntornoBootstrap,
  credenciales: { email: string; password: string },
  accion: (cliente: ClienteSupabase, actor: ActorConSesion) => Promise<T>
): Promise<T> {
  return conIngreso(crearClienteUsuario(entorno), credenciales, accion)
}

/** `transicionar_srv` a nombre de `actor` (su permiso y su propiedad cuentan). */
export async function transicionarComo(
  servicio: ClienteSupabase,
  actor: ActorConSesion,
  destino: { entidad: string; id: string; hacia: string },
  opciones: { motivo?: string; datos?: Json } = {}
): Promise<void> {
  const { error } = await servicio.rpc("transicionar_srv", {
    p_entidad: destino.entidad,
    p_id: destino.id,
    p_hacia: destino.hacia,
    p_actor_id: actor.usuarioId,
    p_session_id: actor.sesionId,
    p_motivo: opciones.motivo,
    p_datos: opciones.datos,
  })
  if (error) {
    throw errorDeApi(
      `No se pudo pasar ${destino.entidad} ${destino.id} a ${destino.hacia}`,
      error
    )
  }
}
