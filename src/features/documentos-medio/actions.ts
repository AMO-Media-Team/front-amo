"use server"

/**
 * Server Actions de «Mis documentos» (MED-003). Subida directa a Storage
 * (docs/modelo-datos.md §8):
 *
 * 1. DAL (`requerirPermiso("medios.editar_propio")`) antes que nada; el medio
 *    sale de la sesión, nunca del navegador.
 * 2. zod: el MISMO esquema que usa el navegador.
 * 3. `prepararSubidaDocumento` construye la ruta `medio/{id}/{tipo}/{uuid}.{ext}`
 *    y la firma con el cliente de SESIÓN: Storage evalúa ya su política de
 *    INSERT (solo el propio medio, con `medios.editar_propio`).
 * 4. `confirmarDocumento` comprueba que la ruta devuelta es una de las suyas
 *    (`archivoPerteneceA`), que el objeto existe y es el declarado
 *    (`confirmarObjeto`) e inserta la fila con la sesión (RLS + bitácora con el
 *    actor; la BD avisa a la cola de verificación). Es idempotente por ruta
 *    (`documentos_medio_archivo_path_key`): el navegador la repite si pierde la
 *    respuesta y recibe la misma fila.
 * 5. `firmarDocumento` lee la fila con la sesión y firma SU ruta como usuario
 *    (el dueño tiene SELECT sobre su carpeta del bucket).
 */
import "server-only"

import { refresh } from "next/cache"

import { requerirPermiso } from "@/lib/auth/dal"
import type { SubidaPreparada, UrlFirmada } from "@/lib/archivos/tipos"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import {
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { firmarDescarga, MENSAJES_DESCARGA } from "@/lib/storage/descargas"
import {
  archivoPerteneceA,
  carpetaDocumentoMedio,
  nuevaRuta,
} from "@/lib/storage/rutas"
import {
  confirmarObjeto,
  MENSAJES_SUBIDA,
  prepararSubidaFirmada,
} from "@/lib/storage/subidas"
import { crearClienteServidor } from "@/lib/supabase/server"

import { nombreArchivoDocumento } from "./catalogo"
import {
  interpretarErrorDocumento,
  mensajeValidacion,
  SIN_MEDIO,
} from "./errores"
import { aDocumentoCargado, type FilaDocumento } from "./filas"
import {
  type EntradaConfirmarDocumento,
  type EntradaFirmarDocumento,
  type EntradaPrepararDocumento,
  esquemaConfirmarDocumento,
  esquemaFirmarDocumento,
  esquemaPrepararDocumento,
} from "./schemas"
import type { DocumentoCargado } from "./tipos"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

const COLUMNAS_DOCUMENTO =
  "id, tipo, estado_validacion, metodo, observaciones, fecha_vencimiento, created_at, validado_at, archivo_path"

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[documentos-medio] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, esperado } = interpretarErrorDocumento(error)
  if (!esperado) informar(operacion, error)
  return fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

/** La fila que ya registró esta ruta (reintento de una confirmación). */
async function documentoPorRuta(
  supabase: ClienteUsuario,
  medioId: string,
  ruta: string
): Promise<
  { fila: FilaDocumento | null; error: null } | { fila: null; error: ErrorBd }
> {
  const { data, error } = await supabase
    .from("documentos_medio")
    .select(COLUMNAS_DOCUMENTO)
    .eq("medio_id", medioId)
    .eq("archivo_path", ruta)
    .maybeSingle()
  return error ? { fila: null, error } : { fila: data, error: null }
}

function confirmado(fila: FilaDocumento): ResultadoAccion<DocumentoCargado> {
  // La lista del servidor se vuelve a pintar con la carga nueva.
  refresh()
  return exito(aDocumentoCargado(fila))
}

// ── Acciones ─────────────────────────────────────────────────────────────────

/** Destino firmado para subir un documento del propio medio. */
export async function prepararSubidaDocumento(
  entrada: EntradaPrepararDocumento
): Promise<ResultadoAccion<SubidaPreparada>> {
  const usuario = await requerirPermiso("medios.editar_propio")
  const validacion = esquemaPrepararDocumento.safeParse(entrada)
  if (!validacion.success) return fallo(mensajeValidacion(validacion.error))
  if (!usuario.medioId) return fallo(SIN_MEDIO)
  try {
    const { tipo, archivo } = validacion.data
    const destino = nuevaRuta(
      carpetaDocumentoMedio(usuario.medioId, tipo),
      archivo.tipo
    )
    return await prepararSubidaFirmada({
      cliente: await crearClienteServidor(),
      ...destino,
    })
  } catch (error) {
    return falloInesperado("preparar la subida", error)
  }
}

/** Registra el documento ya subido; idempotente por ruta. */
export async function confirmarDocumento(
  entrada: EntradaConfirmarDocumento
): Promise<ResultadoAccion<DocumentoCargado>> {
  const usuario = await requerirPermiso("medios.editar_propio")
  const validacion = esquemaConfirmarDocumento.safeParse(entrada)
  if (!validacion.success) return fallo(mensajeValidacion(validacion.error))
  const medioId = usuario.medioId
  if (!medioId) return fallo(SIN_MEDIO)
  const { tipo, archivo } = validacion.data
  try {
    const destino = carpetaDocumentoMedio(medioId, tipo)
    if (!archivoPerteneceA(archivo, destino)) {
      return fallo(MENSAJES_SUBIDA.noCoincide)
    }
    const supabase = await crearClienteServidor()
    const previo = await documentoPorRuta(supabase, medioId, archivo.ruta)
    if (previo.error) return falloBd("buscar el documento", previo.error)
    if (previo.fila) return confirmado(previo.fila)

    const objeto = await confirmarObjeto({
      cliente: supabase,
      bucket: destino.bucket,
      ruta: archivo.ruta,
      esperado: { tamano: archivo.tamano, tipo: archivo.tipo },
    })
    if (!objeto.ok) return objeto

    const { data, error } = await supabase
      .from("documentos_medio")
      .insert({ medio_id: medioId, tipo, archivo_path: archivo.ruta })
      .select(COLUMNAS_DOCUMENTO)
      .single()
    if (!error) return confirmado(data)
    if (error.code === "23505") {
      // Otra confirmación de la misma ruta ganó la carrera: es la misma fila.
      const repetido = await documentoPorRuta(supabase, medioId, archivo.ruta)
      if (repetido.fila) return confirmado(repetido.fila)
    }
    return falloBd("registrar el documento", error)
  } catch (error) {
    return falloInesperado("confirmar el documento", error)
  }
}

/**
 * URL firmada de un documento propio para verlo (o descargarlo). La ruta sale
 * de la fila que la sesión puede leer, nunca del navegador.
 */
export async function firmarDocumento(
  entrada: EntradaFirmarDocumento
): Promise<ResultadoAccion<UrlFirmada>> {
  const usuario = await requerirPermiso("medios.editar_propio")
  const validacion = esquemaFirmarDocumento.safeParse(entrada)
  if (!validacion.success) return fallo(MENSAJES_DESCARGA.noEncontrado)
  const medioId = usuario.medioId
  if (!medioId) return fallo(SIN_MEDIO)
  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("documentos_medio")
      .select(COLUMNAS_DOCUMENTO)
      .eq("id", validacion.data.documentoId)
      .eq("medio_id", medioId)
      .maybeSingle()
    if (error) return falloBd("leer el documento", error)
    if (!data?.archivo_path) return fallo(MENSAJES_DESCARGA.noEncontrado)
    const documento = aDocumentoCargado(data)
    return await firmarDescarga({
      bucket: "documentos",
      ruta: data.archivo_path,
      firmante: { como: "usuario", cliente: supabase },
      descarga: validacion.data.descargar
        ? nombreArchivoDocumento(documento.tipo, documento.formato)
        : undefined,
    })
  } catch (error) {
    return falloInesperado("firmar el documento", error)
  }
}
