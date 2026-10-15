import "server-only"

import type { Factor, SupabaseClient } from "@supabase/supabase-js"
import { cache } from "react"
import { z } from "zod"

import { describirAgente } from "@/lib/auth/agente-usuario"
import type { ClaimsSesion } from "@/lib/auth/compuertas"
import { obtenerClaims, tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { crearClienteAdminOpcional } from "@/lib/supabase/admin"
import { obtenerAuthServidor } from "@/lib/supabase/auth-server"
import { obtenerContextoSolicitud } from "@/lib/supabase/contexto"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"
import { vigenciaUrlFirmada } from "@/lib/supabase/url-firmada"

import { BUCKET_AVATARES } from "./avatar"
import { leerPreferencias, type PreferenciasInterfaz } from "./preferencias"
import {
  describirNavegador,
  describirUbicacion,
  enmascararIp,
  nombreVisibleFactor,
} from "./presentacion"
import type {
  ActividadPropia,
  EstadoSesiones,
  FactorPropio,
  PaginaActividad,
  PerfilPropio,
  SeguridadPropia,
  SesionPropia,
} from "./tipos"

/**
 * Consultas de «Mi cuenta» con la sesión del USUARIO (JWT + RLS): cada una
 * devuelve solo datos propios. Los errores de consulta se lanzan (los recoge
 * el límite de error de la sección); los recursos que aún no existen en la BD
 * (bucket `avatares`, SRF de sesiones propias) degradan con elegancia.
 */

type ClienteServidor = Awaited<ReturnType<typeof crearClienteServidor>>

/** PostgREST/Postgres: la función aún no existe (`mis_sesiones`). */
const FUNCION_INEXISTENTE = new Set(["PGRST202", "42883"])

function fallar(operacion: string, error: { code?: string | null }): never {
  throw new Error(`No se pudo ${operacion} (${error.code ?? "sin código"}).`)
}

function comoTexto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor : null
}

// ── Perfil ───────────────────────────────────────────────────────────────────

/** URL firmada con el cliente del usuario (aplica la RLS de Storage, §8 regla 1). */
async function firmarAvatar(
  supabase: ClienteServidor,
  ruta: string | null
): Promise<string | null> {
  if (!ruta) return null
  const { data, error } = await supabase.storage
    .from(BUCKET_AVATARES)
    .createSignedUrl(ruta, await vigenciaUrlFirmada())
  return error ? null : data.signedUrl
}

/**
 * Nombre de la organización propia (la RLS de `anunciantes`/`medios` deja ver
 * la fila propia). `null` si no es visible (p. ej. borrada).
 */
async function nombreAnunciante(
  supabase: ClienteServidor,
  id: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("anunciantes")
    .select("nombre_comercial")
    .eq("id", id)
    .maybeSingle()
  if (error) fallar("leer tu organización", error)
  return data?.nombre_comercial ?? null
}

async function nombreMedio(
  supabase: ClienteServidor,
  id: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("medios")
    .select("nombre")
    .eq("id", id)
    .maybeSingle()
  if (error) fallar("leer tu organización", error)
  return data?.nombre ?? null
}

async function organizacionDe(
  supabase: ClienteServidor,
  fila: { anunciante_id: string | null; medio_id: string | null }
): Promise<PerfilPropio["organizacion"]> {
  if (fila.anunciante_id) {
    return {
      tipo: "ANUNCIANTE",
      nombre: await nombreAnunciante(supabase, fila.anunciante_id),
    }
  }
  if (fila.medio_id) {
    return {
      tipo: "MEDIO",
      nombre: await nombreMedio(supabase, fila.medio_id),
    }
  }
  return null
}

export const perfilPropio = cache(
  async (usuario: UsuarioSesion): Promise<PerfilPropio> => {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("perfiles")
      .select(
        "id, email, nombre, celular, avatar_path, created_at, activado_at, ultimo_acceso_at, anunciante_id, medio_id"
      )
      .eq("id", usuario.id)
      .single()
    if (error) fallar("leer tu perfil", error)

    const [avatarUrl, organizacion] = await Promise.all([
      firmarAvatar(supabase, data.avatar_path),
      organizacionDe(supabase, data),
    ])
    return {
      id: data.id,
      nombre: data.nombre,
      email: data.email,
      celular: data.celular,
      avatarUrl,
      tieneAvatar: data.avatar_path !== null,
      rol: usuario.rol,
      organizacion,
      miembroDesde: data.activado_at ?? data.created_at,
      ultimoAccesoAt: data.ultimo_acceso_at,
    }
  }
)

/**
 * ¿Existe el bucket `avatares`? (llega con la migración de Storage). Storage
 * no distingue «bucket inexistente» de «sin permiso» para el cliente del
 * usuario, así que se consulta el metadato con la secret key (solo lectura,
 * después del DAL). Sin secret key (previews) se asume disponible: la subida
 * falla con un mensaje claro si no lo está.
 */
export const avataresDisponibles = cache(async (): Promise<boolean> => {
  const admin = await crearClienteAdminOpcional()
  if (!admin) return true
  const { data, error } = await admin.storage.getBucket(BUCKET_AVATARES)
  return !error && data !== null
})

/** Preferencias de interfaz guardadas (para el proveedor de preferencias). */
export const preferenciasPropias = cache(
  async (usuarioId: string): Promise<PreferenciasInterfaz> => {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("perfiles")
      .select("preferencias")
      .eq("id", usuarioId)
      .single()
    if (error) fallar("leer tus preferencias", error)
    return leerPreferencias(data.preferencias)
  }
)

// ── Seguridad ────────────────────────────────────────────────────────────────

function aFactor(factor: Factor, indice: number): FactorPropio {
  return {
    id: factor.id,
    nombre: nombreVisibleFactor(factor.friendly_name, indice),
    creadoAt: factor.created_at,
    ultimoUsoAt: factor.last_challenged_at ?? null,
  }
}

export async function seguridadPropia(
  usuario: UsuarioSesion
): Promise<SeguridadPropia> {
  const [auth, supabase] = await Promise.all([
    obtenerAuthServidor(),
    crearClienteServidor(),
  ])
  const [factores, cambio] = await Promise.all([
    auth.mfa.listFactors(),
    supabase
      .from("accesos")
      .select("created_at")
      .eq("usuario_id", usuario.id)
      .eq("evento", "CONTRASENA_CAMBIADA")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (factores.error)
    fallar("leer tu verificación en dos pasos", factores.error)
  if (cambio.error) fallar("leer el último cambio de contraseña", cambio.error)
  return {
    factores: factores.data.totp.map(aFactor),
    mfaObligatoria: usuario.rol.requiereMfa,
    contrasenaCambiadaAt: cambio.data?.created_at ?? null,
  }
}

// ── Sesiones ─────────────────────────────────────────────────────────────────

const esquemaSesion = z.object({
  id: z.uuid(),
  creada_at: z.string(),
  refrescada_at: z.string().nullable(),
  ultima_actividad_at: z.string().nullable(),
  aal: z.string().nullable(),
  user_agent: z.string().nullable(),
  ip: z.unknown(),
})

type FilaSesion = z.infer<typeof esquemaSesion>

/**
 * `mis_sesiones()` (SRF propia, pendiente en la BD) y, mientras no exista,
 * `sesiones_usuario` sobre uno mismo, que exige `usuarios.ver`. `null` si
 * ninguna está disponible para este usuario.
 */
async function leerSesiones(
  supabase: ClienteServidor,
  usuario: UsuarioSesion
): Promise<FilaSesion[] | null> {
  const propias = await (supabase as unknown as SupabaseClient).rpc(
    "mis_sesiones"
  )
  if (!propias.error) return z.array(esquemaSesion).parse(propias.data)
  if (!FUNCION_INEXISTENTE.has(propias.error.code)) {
    fallar("leer tus sesiones", propias.error)
  }
  if (!tieneAlgunPermiso(usuario, ["usuarios.ver"])) return null

  const { data, error } = await supabase.rpc("sesiones_usuario", {
    p_usuario_id: usuario.id,
  })
  if (error) fallar("leer tus sesiones", error)
  return z.array(esquemaSesion).parse(data)
}

interface OrigenSesion {
  ip: string | null
  ubicacion: string | null
  userAgent: string | null
}

/**
 * IP, ubicación y navegador del ingreso que abrió cada sesión (`accesos`
 * propios; la RLS los deja ver sin permisos extra).
 */
async function origenesDeSesiones(
  supabase: ClienteServidor,
  usuarioId: string,
  sesiones: readonly string[]
): Promise<Map<string, OrigenSesion>> {
  if (sesiones.length === 0) return new Map()
  const { data, error } = await supabase
    .from("accesos")
    .select("session_id, ip, pais_iso2, ciudad, user_agent")
    .eq("usuario_id", usuarioId)
    .eq("evento", "LOGIN_EXITOSO")
    .in("session_id", sesiones)
  if (error) fallar("leer el origen de tus sesiones", error)
  return new Map(
    data.flatMap((fila) =>
      fila.session_id
        ? [
            [
              fila.session_id,
              {
                ip: comoTexto(fila.ip),
                ubicacion: describirUbicacion(fila.pais_iso2, fila.ciudad),
                userAgent: comoTexto(fila.user_agent),
              },
            ] as const,
          ]
        : []
    )
  )
}

interface SolicitudActual {
  sessionId: string
  userAgent: string | null
}

function aSesion(
  fila: FilaSesion,
  origen: OrigenSesion | undefined,
  actual: SolicitudActual
): SesionPropia {
  const esActual = fila.id === actual.sessionId
  // El ingreso es una Server Action: Auth guarda el agente de Node. El del
  // navegador está en `accesos` y, para la sesión actual, en esta solicitud.
  const agente = describirAgente(
    (esActual ? actual.userAgent : null) ?? origen?.userAgent ?? fila.user_agent
  )
  return {
    id: fila.id,
    esActual,
    navegador: describirNavegador(agente.navegador, agente.sistemaOperativo),
    dispositivo: agente.dispositivo,
    ip: enmascararIp(comoTexto(fila.ip) ?? origen?.ip),
    ubicacion: origen?.ubicacion ?? null,
    iniciadaAt: fila.creada_at,
    ultimaActividadAt: fila.ultima_actividad_at ?? fila.refrescada_at,
    conVerificacion: fila.aal === "aal2",
  }
}

/** La sesión de esta solicitud, con lo que sabe el servidor (sin la SRF). */
async function sesionDeEstaSolicitud(
  claims: ClaimsSesion
): Promise<SesionPropia> {
  const contexto = await obtenerContextoSolicitud()
  const agente = describirAgente(contexto.userAgent)
  const inicio = Math.min(...claims.metodos.map(({ instante }) => instante))
  return {
    id: claims.sessionId,
    esActual: true,
    navegador: describirNavegador(agente.navegador, agente.sistemaOperativo),
    dispositivo: agente.dispositivo,
    ip: enmascararIp(contexto.ip),
    ubicacion: describirUbicacion(contexto.pais, contexto.ciudad),
    iniciadaAt: new Date(
      Number.isFinite(inicio) ? inicio * 1000 : Date.now()
    ).toISOString(),
    ultimaActividadAt: new Date().toISOString(),
    conVerificacion: claims.aal === "aal2",
  }
}

function ordenarSesiones(a: SesionPropia, b: SesionPropia): number {
  if (a.esActual !== b.esActual) return a.esActual ? -1 : 1
  const reciente = (s: SesionPropia) => s.ultimaActividadAt ?? s.iniciadaAt
  return reciente(b).localeCompare(reciente(a))
}

export async function sesionesPropias(
  usuario: UsuarioSesion
): Promise<EstadoSesiones> {
  const claims = await obtenerClaims()
  if (!claims) throw new Error("La sesión no está disponible.")
  const supabase = await crearClienteServidor()
  const filas = await leerSesiones(supabase, usuario)
  if (!filas) {
    return { disponible: false, actual: await sesionDeEstaSolicitud(claims) }
  }
  const [origenes, contexto] = await Promise.all([
    origenesDeSesiones(
      supabase,
      usuario.id,
      filas.map((fila) => fila.id)
    ),
    obtenerContextoSolicitud(),
  ])
  const actual = { sessionId: claims.sessionId, userAgent: contexto.userAgent }
  const sesiones = filas
    .map((fila) => aSesion(fila, origenes.get(fila.id), actual))
    .sort(ordenarSesiones)
  return { disponible: true, sesiones }
}

// ── Actividad ────────────────────────────────────────────────────────────────

export const TAMANO_PAGINA_ACTIVIDAD = 12

export async function actividadPropia(
  antesId: number | null = null
): Promise<PaginaActividad> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc(
    "mi_actividad",
    argumentosRpc<"mi_actividad">({
      p_limite: TAMANO_PAGINA_ACTIVIDAD + 1,
      p_antes_id: antesId,
    })
  )
  if (error) fallar("leer tu actividad", error)

  const hayMas = data.length > TAMANO_PAGINA_ACTIVIDAD
  const eventos: ActividadPropia[] = data
    .slice(0, TAMANO_PAGINA_ACTIVIDAD)
    .map((fila) => {
      const agente = describirAgente(comoTexto(fila.user_agent))
      return {
        id: fila.id,
        at: fila.created_at,
        accion: fila.accion,
        entidad: fila.entidad,
        entidadId: comoTexto(fila.entidad_id),
        ip: enmascararIp(comoTexto(fila.ip)),
        ubicacion: describirUbicacion(
          comoTexto(fila.pais_iso2),
          comoTexto(fila.ciudad)
        ),
        navegador: describirNavegador(
          agente.navegador,
          agente.sistemaOperativo
        ),
        dispositivo: agente.dispositivo,
      }
    })
  return {
    eventos,
    siguiente: hayMas ? (eventos.at(-1)?.id ?? null) : null,
  }
}
