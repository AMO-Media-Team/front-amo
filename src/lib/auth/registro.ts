import "server-only"

import { crearClienteAdmin } from "@/lib/supabase/admin"
import { obtenerContextoSolicitud } from "@/lib/supabase/contexto"
import { argumentosRpc } from "@/lib/supabase/rpc"
import type { Database, Json } from "@/types/database.types"

import { describirAgente } from "./agente-usuario"
import type { ClaimsSesion } from "./compuertas"
import type { NivelAutenticacion } from "./tipos"

/**
 * Registro de eventos de autenticación (`accesos`, vía `registrar_acceso_srv`)
 * y de acciones sensibles (`bitacora`, vía `registrar_evento_srv`). Un fallo al
 * registrar no interrumpe el flujo del usuario: se informa en el log del
 * servidor (sin datos personales) para investigarlo.
 */

export type EventoAcceso = Database["public"]["Enums"]["acceso_evento"]

export interface DatosAcceso {
  evento: EventoAcceso
  usuarioId?: string | null
  email?: string | null
  sessionId?: string | null
  aal?: NivelAutenticacion | null
}

export interface ResultadoAcceso {
  esSospechoso: boolean
  motivo: string | null
}

/** Log de servidor de un fallo al registrar: solo la operación y el código, sin datos personales. */
export function informarFallo(
  operacion: string,
  error: unknown,
  ambito: "auth" | "bitacora" = "auth"
): void {
  const detalle =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[${ambito}] ${operacion} falló (${detalle})`)
}

export async function registrarAcceso(
  datos: DatosAcceso
): Promise<ResultadoAcceso | null> {
  try {
    const [admin, contexto] = await Promise.all([
      crearClienteAdmin({ actorId: datos.usuarioId }),
      obtenerContextoSolicitud(),
    ])
    const agente = describirAgente(contexto.userAgent)
    const { data, error } = await admin.rpc(
      "registrar_acceso_srv",
      argumentosRpc<"registrar_acceso_srv">({
        p_usuario_id: datos.usuarioId ?? null,
        p_email: datos.email ?? null,
        p_evento: datos.evento,
        p_session_id: datos.sessionId ?? null,
        p_aal: datos.aal ?? null,
        p_ip: contexto.ip,
        p_pais: contexto.pais,
        p_region: contexto.region,
        p_ciudad: contexto.ciudad,
        p_lat: contexto.latitud,
        p_lon: contexto.longitud,
        p_ua: contexto.userAgent,
        p_navegador: agente.navegador,
        p_so: agente.sistemaOperativo,
        p_dispositivo: agente.dispositivo,
      })
    )
    if (error) throw error
    const fila = data[0]
    return fila
      ? { esSospechoso: fila.es_sospechoso, motivo: fila.motivo }
      : null
  } catch (error) {
    informarFallo(`registrar_acceso_srv(${datos.evento})`, error)
    return null
  }
}

/** Ingreso exitoso (contraseña o enlace de correo) de una sesión recién emitida. */
export async function registrarIngreso(claims: ClaimsSesion): Promise<void> {
  // PAIS_INUSUAL queda marcado en `accesos`; el aviso a superadministradores
  // llega con el módulo de notificaciones.
  await registrarAcceso({
    evento: "LOGIN_EXITOSO",
    usuarioId: claims.usuarioId,
    email: claims.email,
    sessionId: claims.sessionId,
    aal: claims.aal,
  })
}

/**
 * Acciones de `bitacora` que registra la aplicación (las demás las escriben
 * los triggers de la BD). `OTRO` describe la operación en `metadatos.evento`.
 */
export type AccionBitacora =
  | "OTRO"
  | "CERRAR_SESIONES"
  | "EXPORTAR"
  | "URL_FIRMADA"
  | "INVITAR"
  | "GENERAR_ENLACE"

type ClienteAdmin = Awaited<ReturnType<typeof crearClienteAdmin>>

export interface DatosEvento {
  actorId: string
  accion: AccionBitacora
  entidad: string
  entidadId?: string | null
  /** NUNCA enlaces, tokens ni contraseñas: solo el tipo de operación y su contexto. */
  metadatos?: Record<string, Json>
  /**
   * Cliente de servicio ya abierto para este actor (el de `contextoDelActor`
   * de una Server Action); sin él se crea uno.
   */
  admin?: ClienteAdmin
}

/**
 * Evento de aplicación en la bitácora (`registrar_evento_srv`), con el
 * contexto confiable de la solicitud (IP, país, ciudad, agente). Es el único
 * envoltorio de esa RPC: los módulos lo llaman con su acción y su entidad.
 *
 * Devuelve si quedó registrado. Quien entrega datos sensibles (exportaciones,
 * URL firmadas) registra ANTES y no entrega sin registro; para el resto, un
 * fallo no deshace la acción: queda en el log del servidor.
 */
export async function registrarEvento(datos: DatosEvento): Promise<boolean> {
  try {
    const [admin, contexto] = await Promise.all([
      datos.admin ?? crearClienteAdmin({ actorId: datos.actorId }),
      obtenerContextoSolicitud(),
    ])
    const { error } = await admin.rpc(
      "registrar_evento_srv",
      argumentosRpc<"registrar_evento_srv">({
        p_actor_id: datos.actorId,
        p_accion: datos.accion,
        p_entidad: datos.entidad,
        p_entidad_id: datos.entidadId ?? null,
        p_metadatos: datos.metadatos ?? {},
        p_ip: contexto.ip,
        p_pais: contexto.pais,
        p_ciudad: contexto.ciudad,
        p_ua: contexto.userAgent,
      })
    )
    if (error) throw error
    return true
  } catch (error) {
    informarFallo(
      `registrar_evento_srv(${datos.accion} ${datos.entidad})`,
      error,
      "bitacora"
    )
    return false
  }
}
