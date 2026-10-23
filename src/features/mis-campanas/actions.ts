"use server"

/**
 * Server Actions de «Mis campañas» (MED-010 desistir, MED-012 contenido).
 * Patrón de cada acción:
 *
 * 1. DAL (`requerirPermiso`) antes que nada.
 * 2. zod: el MISMO esquema que usa la interfaz.
 * 3. Descargar y desistir van por sus `*_srv` con actor y sesión
 *    (`contextoDelActor`): la BD revalida propiedad, estado, plazos y motivo y
 *    hace la transición (`registrar_descarga_srv` deja la asignación en
 *    CONTENIDO_ENTREGADO y registra la versión; `desistir_asignacion_srv` la
 *    pasa a RECHAZADA y libera el cupo).
 * 4. Los archivos se firman con el cliente del USUARIO: Storage solo deja
 *    leerlos a quien tiene la asignación en pie y ya descargó el contenido.
 * 5. Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { refresh } from "next/cache"

import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso } from "@/lib/auth/dal"
import type { UrlFirmada } from "@/lib/archivos/tipos"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { firmarDescarga } from "@/lib/storage/descargas"
import { crearClienteServidor } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"

import { nombreArchivoDescarga } from "./contenido"
import { interpretarErrorMisCampanas, MENSAJES_MIS_CAMPANAS } from "./errores"
import {
  type EntradaAsignacion,
  type EntradaDesistir,
  type EntradaFirmarArchivo,
  esquemaAsignacion,
  esquemaDesistir,
  esquemaFirmarArchivo,
} from "./schemas"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[mis-campanas] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, esperado } = interpretarErrorMisCampanas(error)
  if (!esperado) informar(operacion, error)
  return fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

/** Versión del creativo que devolvió `registrar_descarga_srv`. */
function versionDescargada(datos: Json): number | null {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) return null
  const version = datos.version
  return typeof version === "number" ? version : null
}

// ── Contenido ────────────────────────────────────────────────────────────────

/**
 * «Descargar el contenido» (MED-012): registra la descarga con la versión
 * vigente (la primera pasa la asignación a CONTENIDO_ENTREGADO) y vuelve a
 * pintar la pantalla, que ya muestra los archivos para ver y guardar.
 */
export async function descargarContenido(
  entrada: EntradaAsignacion
): Promise<ResultadoAccion<{ version: number | null }>> {
  const usuario = await requerirPermiso("asignaciones.ejecutar")
  const validacion = esquemaAsignacion.safeParse(entrada)
  if (!validacion.success) return fallo(MENSAJES_MIS_CAMPANAS.noEncontrada)
  if (!usuario.medioId) return fallo(MENSAJES_MIS_CAMPANAS.sinMedio)

  try {
    const contexto = await contextoDelActor(usuario)
    const { data, error } = await contexto.admin.rpc("registrar_descarga_srv", {
      p_asignacion_id: validacion.data.asignacionId,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
    })
    if (error) return falloBd("registrar la descarga del contenido", error)
    refresh()
    return exito({ version: versionDescargada(data) })
  } catch (error) {
    return falloInesperado("registrar la descarga del contenido", error)
  }
}

/**
 * URL firmada (vigencia de `archivos.vigencia_url_firmada_segundos`, 300 s)
 * de un archivo del contenido de la asignación, para verlo o, con
 * `descargar`, para guardarlo. La fila se lee con la sesión y debe ser de un
 * creativo de la oferta de ESTA asignación; la ruta nunca viene del cliente.
 */
export async function firmarArchivoContenido(
  entrada: EntradaFirmarArchivo
): Promise<ResultadoAccion<UrlFirmada>> {
  await requerirPermiso("asignaciones.ejecutar")
  const validacion = esquemaFirmarArchivo.safeParse(entrada)
  if (!validacion.success) {
    return fallo(MENSAJES_MIS_CAMPANAS.archivoNoEncontrado)
  }
  const { asignacionId, archivoId, descargar } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const [asignacion, archivo] = await Promise.all([
      supabase.rpc("mis_asignaciones_medio", {
        p_id: asignacionId,
        p_limite: 1,
      }),
      supabase
        .from("creativo_archivos")
        .select(
          "archivo_path, mime, orden, creativo:creativos ( oferta_id, version )"
        )
        .eq("id", archivoId)
        .maybeSingle(),
    ])
    if (asignacion.error) {
      return falloBd("leer la asignación del archivo", asignacion.error)
    }
    if (archivo.error) return falloBd("leer el archivo", archivo.error)
    const ofertaId = asignacion.data.at(0)?.oferta_id
    const fila = archivo.data
    if (!ofertaId || !fila?.creativo || fila.creativo.oferta_id !== ofertaId) {
      return fallo(MENSAJES_MIS_CAMPANAS.archivoNoEncontrado)
    }
    return await firmarDescarga({
      bucket: "creativos",
      ruta: fila.archivo_path,
      firmante: { como: "usuario", cliente: supabase },
      descarga: descargar
        ? nombreArchivoDescarga(fila.creativo.version, fila.orden, fila.mime)
        : undefined,
    })
  } catch (error) {
    return falloInesperado("firmar el archivo del contenido", error)
  }
}

// ── Desistir (MED-010) ───────────────────────────────────────────────────────

/**
 * Desistir de una asignación aceptada antes de descargar el contenido y de
 * la fecha límite de aceptación, con motivo. La asignación pasa a RECHAZADA y
 * el cupo queda libre para otro medio.
 */
export async function desistirAsignacion(
  entrada: EntradaDesistir
): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso("ofertas.aceptar")
  const validacion = esquemaDesistir.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  if (!usuario.medioId) return fallo(MENSAJES_MIS_CAMPANAS.sinMedio)

  try {
    const contexto = await contextoDelActor(usuario)
    const { error } = await contexto.admin.rpc("desistir_asignacion_srv", {
      p_asignacion_id: validacion.data.asignacionId,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
      p_motivo: validacion.data.motivo,
    })
    if (error) return falloBd("desistir de la asignación", error)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("desistir de la asignación", error)
  }
}
