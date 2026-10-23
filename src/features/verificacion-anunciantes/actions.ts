"use server"

/**
 * Server Actions de la verificación de anunciantes (ADM-003). Patrón de cada
 * acción:
 *
 * 1. DAL (`requerirPermiso`) antes que nada: verificar y decidir documentos
 *    exige `anunciantes.verificar`; suspender y reactivar,
 *    `anunciantes.suspender`; cargar por cuenta de la empresa,
 *    `anunciantes.editar` (y verificar, para leer lo que se carga).
 * 2. zod: el MISMO esquema que el formulario.
 * 3. Los cambios de estado van por `transicionar` (`transicionar_srv`) con
 *    actor y sesión: la BD revalida permiso, estado, motivo y documentos (su
 *    `detail` dice qué falta) y registra la bitácora.
 * 4. Los archivos del bucket `documentos` no los lee el equipo AMO con su
 *    sesión: se lee la fila con la sesión (RLS) y se firma o se confirma COMO
 *    SERVICIO tras el DAL, con `URL_FIRMADA` en la bitácora al firmar.
 * 5. `refresh()` para que la cola, sus contadores y la ficha muestren el cambio.
 *
 * Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { refresh } from "next/cache"

import { vigenciaAdmisible } from "@/features/verificacion/vigencia"
import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import type { SubidaPreparada, UrlFirmada } from "@/lib/archivos/tipos"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { serializarFecha } from "@/lib/fechas"
import {
  type SolicitudTransicion,
  transicionar,
} from "@/lib/negocio/transicionar"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { firmarDescarga } from "@/lib/storage/descargas"
import {
  archivoPerteneceA,
  carpetaDocumentoAnunciante,
  nuevaRuta,
} from "@/lib/storage/rutas"
import {
  confirmarObjeto,
  MENSAJES_SUBIDA,
  prepararSubidaFirmada,
} from "@/lib/storage/subidas"
import { crearClienteServidor } from "@/lib/supabase/server"

import {
  interpretarErrorVerificacionAnunciante,
  MENSAJES_VERIFICACION_ANUNCIANTE as MENSAJES,
} from "./errores"
import {
  COLUMNAS_DOCUMENTO,
  documentoExpediente,
  type FilaDocumento,
} from "./filas"
import {
  type EntradaAnunciante,
  type EntradaAprobarDocumentoAnunciante,
  type EntradaConfirmarCarga,
  type EntradaDocumentoAnunciante,
  type EntradaMotivoAnunciante,
  type EntradaPrepararCarga,
  type EntradaRechazarDocumentoAnunciante,
  esquemaAnunciante,
  esquemaAprobarDocumentoAnunciante,
  esquemaConfirmarCarga,
  esquemaDocumentoAnunciante,
  esquemaMotivoAnunciante,
  esquemaPrepararCarga,
  esquemaRechazarDocumentoAnunciante,
} from "./schemas"
import type { DocumentoExpediente } from "./tipos"

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
  console.error(`[verificacion-anunciantes] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, campo, esperado } =
    interpretarErrorVerificacionAnunciante(error)
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

/** Ejecuta una transición ya validada y refresca la página si sale bien. */
async function aplicarTransicion(
  actor: UsuarioSesion,
  operacion: string,
  solicitud: SolicitudTransicion<"anunciantes" | "documentos_anunciante">
): Promise<ResultadoAccion> {
  try {
    const { error } = await transicionar(
      await contextoDelActor(actor),
      solicitud
    )
    if (error) return falloBd(operacion, error)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado(operacion, error)
  }
}

/** La fila que ya registró esta ruta (reintento de una confirmación). */
async function documentoPorRuta(
  supabase: ClienteUsuario,
  anuncianteId: string,
  ruta: string
): Promise<
  { fila: FilaDocumento | null; error: null } | { fila: null; error: ErrorBd }
> {
  const { data, error } = await supabase
    .from("documentos_anunciante")
    .select(COLUMNAS_DOCUMENTO)
    .eq("anunciante_id", anuncianteId)
    .eq("archivo_path", ruta)
    .maybeSingle()
  return error ? { fila: null, error } : { fila: data, error: null }
}

function confirmado(fila: FilaDocumento): ResultadoAccion<DocumentoExpediente> {
  // El expediente y la cola se vuelven a pintar con la carga nueva.
  refresh()
  return exito(documentoExpediente(fila))
}

/** Una subida no tiene campos que marcar: el primer motivo, junto al archivo. */
function falloArchivo(validacion: {
  error: { issues: { message: string }[] }
}): ResultadoFallo {
  return fallo(validacion.error.issues[0]?.message ?? MENSAJES.archivoInvalido)
}

// ── Archivos (URL firmadas de corta duración, como servicio) ─────────────────

/**
 * URL firmada para ver un documento de la empresa. El equipo AMO no tiene
 * lectura directa en el bucket `documentos`: se lee la fila con la sesión (su
 * RLS exige `anunciantes.verificar`) y se firma como servicio dejando
 * `URL_FIRMADA` en la bitácora. Sin opción de descarga: se revisa en pantalla.
 */
export async function firmarDocumentoAnunciante(
  entrada: EntradaDocumentoAnunciante
): Promise<ResultadoAccion<UrlFirmada>> {
  const actor = await requerirPermiso("anunciantes.verificar")
  const validacion = esquemaDocumentoAnunciante.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { documentoId } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("documentos_anunciante")
      .select("archivo_path")
      .eq("id", documentoId)
      .maybeSingle()
    if (error) return falloBd("leer el documento", error)
    if (!data) return fallo(MENSAJES.documentoNoEncontrado)
    return await firmarDescarga({
      bucket: "documentos",
      ruta: data.archivo_path,
      firmante: {
        como: "servicio",
        contexto: await contextoDelActor(actor),
        entidad: "documentos_anunciante",
        entidadId: documentoId,
      },
    })
  } catch (error) {
    return falloInesperado("firmarDocumentoAnunciante", error)
  }
}

// ── Documentos ───────────────────────────────────────────────────────────────

/** Aprueba un documento; opcionalmente fija su vigencia y observaciones. */
export async function aprobarDocumentoAnunciante(
  entrada: EntradaAprobarDocumentoAnunciante
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("anunciantes.verificar")
  const validacion = esquemaAprobarDocumentoAnunciante.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { documentoId, fechaVencimiento, observaciones } = validacion.data
  if (
    fechaVencimiento &&
    !vigenciaAdmisible(fechaVencimiento, serializarFecha(new Date()))
  ) {
    const mensaje = MENSAJES.vigenciaPasada
    return fallo(mensaje, { fechaVencimiento: [mensaje] })
  }
  const datos: Record<string, string> = {}
  if (fechaVencimiento) datos.fecha_vencimiento = fechaVencimiento
  if (observaciones) datos.observaciones = observaciones
  return aplicarTransicion(actor, "aprobarDocumentoAnunciante", {
    entidad: "documentos_anunciante",
    id: documentoId,
    hacia: "APROBADO",
    datos,
  })
}

/** Rechaza un documento con el motivo que la empresa recibe para cargarlo de nuevo. */
export async function rechazarDocumentoAnunciante(
  entrada: EntradaRechazarDocumentoAnunciante
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("anunciantes.verificar")
  const validacion = esquemaRechazarDocumentoAnunciante.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return aplicarTransicion(actor, "rechazarDocumentoAnunciante", {
    entidad: "documentos_anunciante",
    id: validacion.data.documentoId,
    hacia: "RECHAZADO",
    motivo: validacion.data.motivo,
  })
}

// ── Decisión sobre la empresa ────────────────────────────────────────────────

/**
 * Verifica una empresa PENDIENTE. La BD exige lo de su país (RUT y Cámara de
 * Comercio aprobados y vigentes en Colombia); si falta algo, su detalle lo
 * enumera con nombres legibles y se muestra tal cual.
 */
export async function verificarAnunciante(
  entrada: EntradaAnunciante
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("anunciantes.verificar")
  const validacion = esquemaAnunciante.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return aplicarTransicion(actor, "verificarAnunciante", {
    entidad: "anunciantes",
    id: validacion.data.anuncianteId,
    hacia: "VERIFICADO",
  })
}

/** Rechaza la verificación con el motivo que la empresa verá para corregir. */
export async function rechazarAnunciante(
  entrada: EntradaMotivoAnunciante
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("anunciantes.verificar")
  const validacion = esquemaMotivoAnunciante.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return aplicarTransicion(actor, "rechazarAnunciante", {
    entidad: "anunciantes",
    id: validacion.data.anuncianteId,
    hacia: "RECHAZADO",
    motivo: validacion.data.motivo,
  })
}

/** Suspende una empresa verificada: deja de enviar ofertas y de recibir aceptaciones. */
export async function suspenderAnunciante(
  entrada: EntradaMotivoAnunciante
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("anunciantes.suspender")
  const validacion = esquemaMotivoAnunciante.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return aplicarTransicion(actor, "suspenderAnunciante", {
    entidad: "anunciantes",
    id: validacion.data.anuncianteId,
    hacia: "SUSPENDIDO",
    motivo: validacion.data.motivo,
  })
}

/** Reactiva una empresa suspendida (vuelve a VERIFICADO). */
export async function reactivarAnunciante(
  entrada: EntradaMotivoAnunciante
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("anunciantes.suspender")
  const validacion = esquemaMotivoAnunciante.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  return aplicarTransicion(actor, "reactivarAnunciante", {
    entidad: "anunciantes",
    id: validacion.data.anuncianteId,
    hacia: "VERIFICADO",
    motivo: validacion.data.motivo,
  })
}

// ── Carga por cuenta de la empresa ───────────────────────────────────────────

/**
 * Destino firmado para subir un documento por cuenta de la empresa. La ruta
 * `anunciante/{id}/{tipo}/{uuid}.{ext}` la construye el servidor y se firma con
 * la sesión: Storage evalúa ya su política de INSERT (`anunciantes.editar`).
 */
export async function prepararCargaDocumentoAnunciante(
  entrada: EntradaPrepararCarga
): Promise<ResultadoAccion<SubidaPreparada>> {
  const actor = await requerirPermiso("anunciantes.editar")
  if (!tieneAlgunPermiso(actor, ["anunciantes.verificar"])) {
    return fallo(MENSAJES.sinPermisoCarga)
  }
  const validacion = esquemaPrepararCarga.safeParse(entrada)
  if (!validacion.success) return falloArchivo(validacion)
  try {
    const { anuncianteId, tipo, archivo } = validacion.data
    const destino = nuevaRuta(
      carpetaDocumentoAnunciante(anuncianteId, tipo),
      archivo.tipo
    )
    return await prepararSubidaFirmada({
      cliente: await crearClienteServidor(),
      ...destino,
    })
  } catch (error) {
    return falloInesperado("prepararCargaDocumentoAnunciante", error)
  }
}

/**
 * Registra el documento ya subido; idempotente por ruta
 * (`documentos_anunciante_archivo_path_key`). El objeto se comprueba como
 * servicio (el equipo AMO no lee el bucket) y la fila se inserta con la
 * sesión: RLS, `subido_por` = quien lo cargó y bitácora con el actor. Queda
 * PENDIENTE, como si lo hubiera cargado la empresa.
 */
export async function confirmarCargaDocumentoAnunciante(
  entrada: EntradaConfirmarCarga
): Promise<ResultadoAccion<DocumentoExpediente>> {
  const actor = await requerirPermiso("anunciantes.editar")
  if (!tieneAlgunPermiso(actor, ["anunciantes.verificar"])) {
    return fallo(MENSAJES.sinPermisoCarga)
  }
  const validacion = esquemaConfirmarCarga.safeParse(entrada)
  if (!validacion.success) return falloArchivo(validacion)
  const { anuncianteId, tipo, archivo } = validacion.data
  try {
    const destino = carpetaDocumentoAnunciante(anuncianteId, tipo)
    if (!archivoPerteneceA(archivo, destino)) {
      return fallo(MENSAJES_SUBIDA.noCoincide)
    }
    const supabase = await crearClienteServidor()
    const previo = await documentoPorRuta(supabase, anuncianteId, archivo.ruta)
    if (previo.error) return falloBd("buscar el documento", previo.error)
    if (previo.fila) return confirmado(previo.fila)

    const contexto = await contextoDelActor(actor)
    const objeto = await confirmarObjeto({
      cliente: contexto.admin,
      bucket: destino.bucket,
      ruta: archivo.ruta,
      esperado: { tamano: archivo.tamano, tipo: archivo.tipo },
    })
    if (!objeto.ok) return objeto

    const { data, error } = await supabase
      .from("documentos_anunciante")
      .insert({ anunciante_id: anuncianteId, tipo, archivo_path: archivo.ruta })
      .select(COLUMNAS_DOCUMENTO)
      .single()
    if (!error) return confirmado(data)
    if (error.code === "23505") {
      // Otra confirmación de la misma ruta ganó la carrera: es la misma fila.
      const repetido = await documentoPorRuta(
        supabase,
        anuncianteId,
        archivo.ruta
      )
      if (repetido.fila) return confirmado(repetido.fila)
    }
    return falloBd("registrar el documento", error)
  } catch (error) {
    return falloInesperado("confirmarCargaDocumentoAnunciante", error)
  }
}
