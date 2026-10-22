"use server"

/**
 * Server Actions de la vinculación de medios (MED-001).
 *
 * - `registrarSolicitudVinculacion` es PÚBLICA (formulario `/vincular`, sin
 *   sesión; figura en `ACCIONES_PUBLICAS`): campo trampa, zod, huella de la
 *   conexión y la RPC `crear_solicitud_vinculacion_srv` con el cliente de
 *   servicio. La BD limita las solicitudes por conexión y absorbe en silencio
 *   los duplicados; la respuesta es siempre la misma salvo errores de
 *   validación y el límite.
 * - `invitarSolicitud` y `descartarSolicitud` atienden la cola: DAL
 *   (`medios.verificar`) primero, zod, y `resolver_solicitud_vinculacion_srv`
 *   con el actor y su sesión. «Invitar» reutiliza `registrarMedio` (registro
 *   de medios) y `crearUsuario` (Usuarios), que vuelven a autorizar.
 */
import "server-only"

import { refresh } from "next/cache"

import { registrarMedio } from "@/features/gestion-medios/actions"
import { normalizarEspacios } from "@/features/gestion-medios/schemas"
import { crearUsuario } from "@/features/usuarios/actions"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import { contextoDelActor } from "@/lib/auth/contexto-actor"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { getEnvServidor } from "@/lib/env.server"
import {
  type ErrorBd,
  interpretarErrorBd,
  MENSAJE_INESPERADO,
} from "@/lib/errores-bd"
import { obtenerMunicipio } from "@/lib/geo/catalogo"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { crearClienteAdmin } from "@/lib/supabase/admin"
import { obtenerContextoSolicitud } from "@/lib/supabase/contexto"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"

import {
  conMedioRegistrado,
  interpretarErrorEnvio,
  MENSAJES_VINCULACION,
  renombrarCampos,
} from "./errores"
import { huellaConexion } from "./ip"
import { nombreNormalizadoMedio } from "./presentacion"
import {
  CAMPOS_MEDIO_EN_HOJA,
  CAMPOS_USUARIO_EN_HOJA,
  datosParaRpc,
  type EntradaDescartarSolicitud,
  type EntradaInvitarSolicitud,
  type EntradaSolicitudVinculacion,
  esEnvioAutomatico,
  esquemaDescartarSolicitud,
  esquemaInvitarSolicitud,
  esquemaSolicitudVinculacion,
} from "./schemas"
import type { SolicitudInvitada } from "./tipos"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[vinculacion] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { codigo, mensaje, esperado } = interpretarErrorBd(error)
  if (!esperado) informar(operacion, error)
  // Lo abierto ya no coincide con la BD (otra persona la atendió): se repinta.
  if (codigo === "AMO_TRANSICION_INVALIDA") refresh()
  return fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

/** La cola cambió por debajo: se repinta con lo vigente y se explica. */
function conflicto(mensaje: string): ResultadoFallo {
  refresh()
  return fallo(mensaje)
}

function esFallo<T extends object>(
  resultado: T | ResultadoFallo
): resultado is ResultadoFallo {
  return "ok" in resultado && resultado.ok === false
}

interface SolicitudPendiente {
  id: string
  creadaAt: string
}

/** La solicitud sigue PENDIENTE (lectura con la sesión: RLS `medios.verificar`). */
async function leerPendiente(
  supabase: ClienteUsuario,
  solicitudId: string
): Promise<SolicitudPendiente | ResultadoFallo> {
  const { data, error } = await supabase
    .from("solicitudes_vinculacion")
    .select("id, estado, created_at")
    .eq("id", solicitudId)
    .maybeSingle()
  if (error) return falloBd("leer solicitud", error)
  if (!data) return conflicto(MENSAJES_VINCULACION.solicitudInexistente)
  if (data.estado !== "PENDIENTE") {
    return conflicto(MENSAJES_VINCULACION.solicitudAtendida)
  }
  return { id: data.id, creadaAt: data.created_at }
}

interface MedioElegido {
  id: string
  nombre: string
}

async function leerMedio(
  supabase: ClienteUsuario,
  medioId: string
): Promise<MedioElegido | ResultadoFallo> {
  const { data, error } = await supabase
    .from("medios")
    .select("id, nombre")
    .eq("id", medioId)
    .is("deleted_at", null)
    .maybeSingle()
  if (error) return falloBd("leer medio", error)
  return (
    data ??
    fallo(MENSAJES_VINCULACION.medioInexistente, {
      medioExistenteId: [MENSAJES_VINCULACION.medioInexistente],
    })
  )
}

/**
 * Medio que salió de un intento anterior con esta misma solicitud (mismo
 * nombre y municipio, registrado después de recibirla): reintentar no lo
 * duplica aunque la hoja se haya cerrado.
 */
async function medioDeIntentoAnterior(
  supabase: ClienteUsuario,
  solicitud: SolicitudPendiente,
  nombre: string,
  municipioCodigo: string
): Promise<MedioElegido | null> {
  const { data, error } = await supabase
    .from("medios")
    .select("id, nombre")
    .eq("nombre_normalizado", nombreNormalizadoMedio(nombre))
    .eq("municipio_codigo", municipioCodigo)
    .gte("created_at", solicitud.creadaAt)
    .is("deleted_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle()
  if (error) {
    informar("buscar medio de un intento anterior", error)
    return null
  }
  return data
}

type MedioDeInvitacion = MedioElegido & { nuevo: boolean }

/** El medio al que se invita: el elegido, el de un intento anterior o uno nuevo. */
async function resolverMedio(
  actor: UsuarioSesion,
  supabase: ClienteUsuario,
  solicitud: SolicitudPendiente,
  entrada: EntradaInvitarSolicitud
): Promise<MedioDeInvitacion | ResultadoFallo> {
  if (entrada.medioExistenteId) {
    const medio = await leerMedio(supabase, entrada.medioExistenteId)
    return esFallo(medio) ? medio : { ...medio, nuevo: false }
  }
  if (!tieneAlgunPermiso(actor, ["medios.editar"])) {
    return fallo(MENSAJES_VINCULACION.sinPermisoRegistrar)
  }
  const anterior = await medioDeIntentoAnterior(
    supabase,
    solicitud,
    entrada.nombreMedio,
    entrada.municipioCodigo
  )
  if (anterior) return { ...anterior, nuevo: true }

  const registro = await registrarMedio({
    nombre: entrada.nombreMedio,
    tipo: entrada.tipo,
    municipioCodigo: entrada.municipioCodigo,
    descripcionAudiencia: "",
    categoriaIds: [],
  })
  if (!registro.ok) return renombrarCampos(registro, CAMPOS_MEDIO_EN_HOJA)
  return {
    id: registro.datos.id,
    nombre: normalizarEspacios(entrada.nombreMedio),
    nuevo: true,
  }
}

// ── Formulario público ──────────────────────────────────────────────────────

/**
 * Registra la solicitud de un medio que quiere unirse. Pública: no revela si
 * el correo ya tiene cuenta o una solicitud abierta (la BD las absorbe) y
 * responde igual a un envío automático (campo trampa).
 */
export async function registrarSolicitudVinculacion(
  entrada: EntradaSolicitudVinculacion
): Promise<ResultadoAccion> {
  if (esEnvioAutomatico(entrada)) return exito()
  const validacion = esquemaSolicitudVinculacion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  if (!obtenerMunicipio(datos.municipioCodigo)) {
    return fallo(MENSAJES_VINCULACION.municipioDesconocido, {
      municipioCodigo: [MENSAJES_VINCULACION.municipioDesconocido],
    })
  }

  try {
    const { ip } = await obtenerContextoSolicitud()
    const admin = await crearClienteAdmin()
    const { error } = await admin.rpc(
      "crear_solicitud_vinculacion_srv",
      argumentosRpc<"crear_solicitud_vinculacion_srv">({
        p_datos: datosParaRpc(datos),
        p_ip_hash: huellaConexion(ip, getEnvServidor().AMO_SERVIDOR_SECRET),
      })
    )
    if (error) {
      const { resultado, esperado } = interpretarErrorEnvio(error)
      if (!esperado) informar("crear solicitud de vinculación", error)
      return resultado
    }
    return exito()
  } catch (error) {
    informar("registrarSolicitudVinculacion", error)
    return fallo(MENSAJES_VINCULACION.envioFallido)
  }
}

// ── Cola interna ────────────────────────────────────────────────────────────

/** Fallo de «Invitar» después de registrar el medio: la hoja pasa a ese medio. */
export type FalloInvitacion = ResultadoFallo & {
  medioRegistrado?: { id: string; nombre: string }
}

/**
 * «Invitar» en un paso: registra el medio con los datos de la solicitud (o
 * usa el elegido), crea la cuenta de la persona de contacto con la
 * organización fija y marca la solicitud INVITADA. La credencial se devuelve
 * UNA vez.
 */
export async function invitarSolicitud(
  entrada: EntradaInvitarSolicitud
): Promise<ResultadoAccion<SolicitudInvitada> | FalloInvitacion> {
  const actor = await requerirPermiso("medios.verificar")
  const validacion = esquemaInvitarSolicitud.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  if (!tieneAlgunPermiso(actor, ["usuarios.invitar"])) {
    return fallo(MENSAJES_VINCULACION.sinPermisoInvitar)
  }

  try {
    const supabase = await crearClienteServidor()
    const solicitud = await leerPendiente(supabase, validacion.data.solicitudId)
    if (esFallo(solicitud)) return solicitud
    const medio = await resolverMedio(actor, supabase, solicitud, entrada)
    if (esFallo(medio)) return medio

    // Se envían los valores tal como se escribieron: `crearUsuario` aplica su esquema.
    const alta = await crearUsuario({
      nombre: entrada.contactoNombre,
      email: entrada.email,
      celular: entrada.celular,
      rolId: entrada.rolId,
      organizacionId: medio.id,
      metodo: entrada.metodo,
    })
    if (!alta.ok) {
      const resultado = renombrarCampos(alta, CAMPOS_USUARIO_EN_HOJA)
      if (!medio.nuevo) return resultado
      refresh()
      return {
        ...conMedioRegistrado(resultado, medio.nombre),
        medioRegistrado: { id: medio.id, nombre: medio.nombre },
      }
    }

    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "resolver_solicitud_vinculacion_srv",
      argumentosRpc<"resolver_solicitud_vinculacion_srv">({
        p_id: solicitud.id,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_estado: "INVITADA",
        p_medio_id: medio.id,
        p_motivo: null,
      })
    )
    if (error) informar("marcar solicitud invitada", error)
    refresh()
    return exito({
      medio: { id: medio.id, nombre: medio.nombre },
      email: alta.datos.email,
      credencial: alta.datos.credencial,
      advertencia: error ? MENSAJES_VINCULACION.sinMarcarInvitada : null,
    })
  } catch (error) {
    return falloInesperado("invitarSolicitud", error)
  }
}

/** «Descartar» con motivo (queda en la bitácora). No se avisa a quien la envió. */
export async function descartarSolicitud(
  entrada: EntradaDescartarSolicitud
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("medios.verificar")
  const validacion = esquemaDescartarSolicitud.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "resolver_solicitud_vinculacion_srv",
      argumentosRpc<"resolver_solicitud_vinculacion_srv">({
        p_id: validacion.data.solicitudId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_estado: "DESCARTADA",
        p_medio_id: null,
        p_motivo: validacion.data.motivo,
      })
    )
    if (error) return falloBd("descartar solicitud", error)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("descartarSolicitud", error)
  }
}
