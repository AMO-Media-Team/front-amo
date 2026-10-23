"use server"

/**
 * Server Actions de «Mi empresa › Documentos» (ANU-001). Subida directa a
 * Storage (docs/modelo-datos.md §8):
 *
 * 1. DAL (`requerirPermiso("anunciantes.editar_propio")`) antes que nada; la
 *    empresa sale de la sesión, nunca del navegador.
 * 2. zod: el MISMO esquema que usa el navegador.
 * 3. `prepararSubidaDocumentoAnunciante` construye la ruta
 *    `anunciante/{id}/{tipo}/{uuid}.{ext}` y la firma con el cliente de
 *    SESIÓN: Storage evalúa ya su política de INSERT (solo la propia empresa,
 *    con `anunciantes.editar_propio`).
 * 4. `confirmarDocumentoAnunciante` comprueba que la ruta devuelta es una de
 *    las suyas (`archivoPerteneceA`), que el objeto existe y es el declarado
 *    (`confirmarObjeto`) e inserta la fila con la sesión (RLS + bitácora con
 *    el actor; la BD avisa a la cola de verificación). Es idempotente por ruta
 *    (`documentos_anunciante_archivo_path_key`): el navegador la repite si
 *    pierde la respuesta y recibe la misma fila.
 * 5. `firmarDocumentoAnunciante` lee la fila con la sesión y firma SU ruta
 *    como usuario (la empresa tiene SELECT sobre su carpeta del bucket).
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
  carpetaDocumentoAnunciante,
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
  interpretarErrorDocumentoAnunciante,
  mensajeValidacion,
  SIN_EMPRESA,
} from "./errores"
import {
  aDocumentoAnunciante,
  COLUMNAS_DOCUMENTO_ANUNCIANTE,
  type FilaDocumentoAnunciante,
} from "./filas"
import {
  type EntradaConfirmarDocumentoAnunciante,
  type EntradaFirmarDocumentoAnunciante,
  type EntradaPrepararDocumentoAnunciante,
  esquemaConfirmarDocumentoAnunciante,
  esquemaFirmarDocumentoAnunciante,
  esquemaPrepararDocumentoAnunciante,
} from "./schemas"
import type { DocumentoAnunciante } from "./tipos"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

type ClienteUsuario = Awaited<ReturnType<typeof crearClienteServidor>>

/** Log de servidor sin datos de la empresa: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[documentos-anunciante] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, esperado } = interpretarErrorDocumentoAnunciante(error)
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
  anuncianteId: string,
  ruta: string
): Promise<
  | { fila: FilaDocumentoAnunciante | null; error: null }
  | { fila: null; error: ErrorBd }
> {
  const { data, error } = await supabase
    .from("documentos_anunciante")
    .select(COLUMNAS_DOCUMENTO_ANUNCIANTE)
    .eq("anunciante_id", anuncianteId)
    .eq("archivo_path", ruta)
    .maybeSingle()
  return error ? { fila: null, error } : { fila: data, error: null }
}

function confirmado(
  fila: FilaDocumentoAnunciante
): ResultadoAccion<DocumentoAnunciante> {
  // La lista del servidor (y el avance de «Mi empresa») se vuelven a pintar.
  refresh()
  return exito(aDocumentoAnunciante(fila))
}

// ── Acciones ─────────────────────────────────────────────────────────────────

/** Destino firmado para subir un documento de la propia empresa. */
export async function prepararSubidaDocumentoAnunciante(
  entrada: EntradaPrepararDocumentoAnunciante
): Promise<ResultadoAccion<SubidaPreparada>> {
  const usuario = await requerirPermiso("anunciantes.editar_propio")
  const validacion = esquemaPrepararDocumentoAnunciante.safeParse(entrada)
  if (!validacion.success) return fallo(mensajeValidacion(validacion.error))
  if (!usuario.anuncianteId) return fallo(SIN_EMPRESA)
  try {
    const { tipo, archivo } = validacion.data
    const destino = nuevaRuta(
      carpetaDocumentoAnunciante(usuario.anuncianteId, tipo),
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
export async function confirmarDocumentoAnunciante(
  entrada: EntradaConfirmarDocumentoAnunciante
): Promise<ResultadoAccion<DocumentoAnunciante>> {
  const usuario = await requerirPermiso("anunciantes.editar_propio")
  const validacion = esquemaConfirmarDocumentoAnunciante.safeParse(entrada)
  if (!validacion.success) return fallo(mensajeValidacion(validacion.error))
  const anuncianteId = usuario.anuncianteId
  if (!anuncianteId) return fallo(SIN_EMPRESA)
  const { tipo, archivo } = validacion.data
  try {
    const destino = carpetaDocumentoAnunciante(anuncianteId, tipo)
    if (!archivoPerteneceA(archivo, destino)) {
      return fallo(MENSAJES_SUBIDA.noCoincide)
    }
    const supabase = await crearClienteServidor()
    const previo = await documentoPorRuta(supabase, anuncianteId, archivo.ruta)
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
      .from("documentos_anunciante")
      .insert({ anunciante_id: anuncianteId, tipo, archivo_path: archivo.ruta })
      .select(COLUMNAS_DOCUMENTO_ANUNCIANTE)
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
    return falloInesperado("confirmar el documento", error)
  }
}

/**
 * URL firmada de un documento propio para verlo (o descargarlo). La ruta sale
 * de la fila que la sesión puede leer, nunca del navegador.
 */
export async function firmarDocumentoAnunciante(
  entrada: EntradaFirmarDocumentoAnunciante
): Promise<ResultadoAccion<UrlFirmada>> {
  const usuario = await requerirPermiso("anunciantes.editar_propio")
  const validacion = esquemaFirmarDocumentoAnunciante.safeParse(entrada)
  if (!validacion.success) return fallo(MENSAJES_DESCARGA.noEncontrado)
  const anuncianteId = usuario.anuncianteId
  if (!anuncianteId) return fallo(SIN_EMPRESA)
  try {
    const supabase = await crearClienteServidor()
    const [{ data, error }, empresa] = await Promise.all([
      supabase
        .from("documentos_anunciante")
        .select(COLUMNAS_DOCUMENTO_ANUNCIANTE)
        .eq("id", validacion.data.documentoId)
        .eq("anunciante_id", anuncianteId)
        .maybeSingle(),
      supabase
        .from("anunciantes")
        .select("pais_iso2")
        .eq("id", anuncianteId)
        .maybeSingle(),
    ])
    if (error) return falloBd("leer el documento", error)
    if (!data?.archivo_path) return fallo(MENSAJES_DESCARGA.noEncontrado)
    const documento = aDocumentoAnunciante(data)
    return await firmarDescarga({
      bucket: "documentos",
      ruta: data.archivo_path,
      firmante: { como: "usuario", cliente: supabase },
      descarga: validacion.data.descargar
        ? nombreArchivoDocumento(
            documento.tipo,
            documento.formato,
            empresa.data?.pais_iso2.trim()
          )
        : undefined,
    })
  } catch (error) {
    return falloInesperado("firmar el documento", error)
  }
}
