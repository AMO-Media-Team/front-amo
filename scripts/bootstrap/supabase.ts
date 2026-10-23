/**
 * Clientes y utilidades de Supabase para los scripts de arranque (fuera de
 * Next: sin `server-only` ni `next/headers`). Se ejecutan en la máquina del
 * operador con `.env.local`; nunca imprimen claves ni contraseñas.
 */
import { existsSync } from "node:fs"

import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js"

import {
  validarEnvCliente,
  validarEnvServidor,
} from "../../src/lib/env-esquema"
import {
  construirCabecerasContexto,
  CONTEXTO_VACIO,
} from "../../src/lib/supabase/contexto-solicitud"
import type { Database } from "../../src/types/database.types"

export type ClienteSupabase = SupabaseClient<Database>

export interface EntornoBootstrap {
  url: string
  clavePublicable: string
  secretKey: string
  /** `AMO_SERVIDOR_SECRET`: marca las escrituras como contexto confiable (bitácora con origen APP). */
  secretoServidor: string
  sitioUrl: string
  superadminEmail: string | undefined
}

export class ErrorBootstrap extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorBootstrap"
  }
}

/**
 * Lee el archivo de entorno (si existe) y valida las variables con los mismos
 * esquemas de la app. Por defecto `.env.local` (desarrollo);
 * `AMO_ARCHIVO_ENTORNO=.env.produccion` apunta los scripts de arranque a
 * producción. Las variables ya definidas en el proceso no se pisan.
 */
export function cargarEntorno(
  archivo = process.env.AMO_ARCHIVO_ENTORNO ?? ".env.local"
): EntornoBootstrap {
  if (existsSync(archivo)) process.loadEnvFile(archivo)
  const cliente = validarEnvCliente(process.env)
  const servidor = validarEnvServidor(process.env)
  if (!servidor.SUPABASE_SECRET_KEY) {
    throw new ErrorBootstrap("Falta SUPABASE_SECRET_KEY en el entorno.")
  }
  return {
    url: cliente.NEXT_PUBLIC_SUPABASE_URL,
    clavePublicable: cliente.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secretKey: servidor.SUPABASE_SECRET_KEY,
    secretoServidor: servidor.AMO_SERVIDOR_SECRET,
    sitioUrl: cliente.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, ""),
    superadminEmail: servidor.SUPERADMIN_EMAIL,
  }
}

/** Proyecto al que apunta el entorno (ref de Supabase o host), para avisar al operador. */
export function describirProyecto(entorno: EntornoBootstrap): string {
  const { hostname } = new URL(entorno.url)
  return hostname.endsWith(".supabase.co")
    ? hostname.slice(0, -".supabase.co".length)
    : hostname
}

const SIN_SESION = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const

/**
 * Cliente `service_role` con las cabeceras de contexto confiable. `actorId`
 * identifica ante los triggers guardianes a quién se atribuye el cambio.
 */
export function crearClienteServicio(
  entorno: EntornoBootstrap,
  actorId?: string
): ClienteSupabase {
  const headers = construirCabecerasContexto(CONTEXTO_VACIO, {
    secreto: entorno.secretoServidor,
    actorId,
  })
  return createClient<Database>(entorno.url, entorno.secretKey, {
    auth: SIN_SESION,
    global: { headers },
  })
}

/** Cliente con la clave publicable para actuar como un usuario (ingreso y MFA). */
export function crearClientePublico(
  entorno: EntornoBootstrap
): ClienteSupabase {
  return createClient<Database>(entorno.url, entorno.clavePublicable, {
    auth: SIN_SESION,
  })
}

/**
 * Cliente con la clave publicable y las cabeceras de contexto confiable, como
 * el del servidor de la app: tras ingresar, sus consultas van con la sesión
 * del usuario (RLS de su rol) y la bitácora las registra con origen APP.
 */
export function crearClienteUsuario(
  entorno: EntornoBootstrap
): ClienteSupabase {
  const headers = construirCabecerasContexto(CONTEXTO_VACIO, {
    secreto: entorno.secretoServidor,
  })
  return createClient<Database>(entorno.url, entorno.clavePublicable, {
    auth: SIN_SESION,
    global: { headers },
  })
}

/** Usuario de Auth por correo (vía su perfil, que `handle_new_user` crea siempre). */
export async function buscarUsuarioPorEmail(
  servicio: ClienteSupabase,
  email: string
): Promise<User | null> {
  const { data: perfil, error } = await servicio
    .from("perfiles")
    .select("id")
    .eq("email", email)
    .maybeSingle()
  if (error) {
    throw new ErrorBootstrap(`No se pudo buscar el perfil: ${error.message}`)
  }
  if (!perfil) return null

  const { data, error: errorUsuario } = await servicio.auth.admin.getUserById(
    perfil.id
  )
  if (errorUsuario) {
    throw new ErrorBootstrap(
      `No se pudo leer el usuario: ${errorUsuario.message}`
    )
  }
  return data.user
}

export async function idDeRol(
  servicio: ClienteSupabase,
  clave: string
): Promise<string> {
  const { data, error } = await servicio
    .from("roles")
    .select("id")
    .eq("clave", clave)
    .single()
  if (error) {
    throw new ErrorBootstrap(`No existe el rol ${clave}: ${error.message}`)
  }
  return data.id
}

type CambiosPerfil = Database["public"]["Tables"]["perfiles"]["Update"]

export async function actualizarPerfil(
  servicio: ClienteSupabase,
  usuarioId: string,
  cambios: CambiosPerfil
): Promise<void> {
  const { error } = await servicio
    .from("perfiles")
    .update(cambios)
    .eq("id", usuarioId)
  if (error) {
    throw new ErrorBootstrap(
      `No se pudo actualizar el perfil: ${error.message}${error.details ? ` (${error.details})` : ""}`
    )
  }
}

/**
 * INVITADO → ACTIVO por la vía del sistema (`activar_perfil_srv`, exige el
 * correo confirmado). Idempotente: con otro estado no hace nada. El estado de
 * un perfil no se escribe con UPDATE (AMO_ESTADO_SOLO_VIA_TRANSICION).
 */
export async function activarPerfil(
  servicio: ClienteSupabase,
  usuarioId: string
): Promise<void> {
  const { error } = await servicio.rpc("activar_perfil_srv", {
    p_usuario_id: usuarioId,
  })
  if (error) {
    throw new ErrorBootstrap(
      `No se pudo activar el perfil: ${error.message}${error.details ? ` (${error.details})` : ""}`
    )
  }
}

/** Ruta de la página de confirmación de AMO (el GET no consume el token). */
export function rutaConfirmacion(
  tokenHash: string,
  tipo: "invite" | "recovery"
): string {
  return `/auth/confirm?${new URLSearchParams({ token_hash: tokenHash, type: tipo })}`
}

export function enlaceConfirmacion(
  sitioUrl: string,
  tokenHash: string,
  tipo: "invite" | "recovery"
): string {
  return `${sitioUrl}${rutaConfirmacion(tokenHash, tipo)}`
}
