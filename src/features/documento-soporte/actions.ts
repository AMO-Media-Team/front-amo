"use server"

/**
 * Server Actions del documento soporte (LIQ-004). Patrón:
 *
 * 1. DAL (`requerirPermiso`) antes que nada: `liquidaciones.aprobar` para emitir, registrar y corregir;
 *    `liquidaciones.ver` para descargar. Generar los archivos exige además `datos_sensibles.ver`: el
 *    documento lleva el nombre, el documento de identidad y la dirección del medio.
 * 2. zod: el MISMO esquema que el diálogo.
 * 3. Las escrituras van por los `*_srv` con actor y sesión (`contextoDelActor`) o por `transicionar`
 *    (anular); la BD revalida permiso, estado, numeración, resolución, CUDS y archivos.
 * 4. Los archivos que genera la plataforma se suben como servicio (`generacion.ts`); el PDF del proveedor y
 *    el de la nota de ajuste los sube el navegador con una URL firmada con la sesión (la política de
 *    Storage exige `liquidaciones.aprobar`) y se comprueban como servicio antes de registrarlos.
 * 5. Las descargas se firman como servicio (el equipo no lee `soportes`) con la ruta de la fila que la
 *    sesión puede leer: queda `URL_FIRMADA` en la bitácora.
 * 6. `revalidatePath` de la ficha, la lista de liquidaciones y los pagos, y `refresh()`.
 *
 * Los errores esperados se devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { refresh, revalidatePath } from "next/cache"

import {
  RUTA_LIQUIDACIONES,
  rutaLiquidacion,
} from "@/features/liquidaciones/rutas"
import { RUTA_PAGOS_MEDIOS } from "@/features/pagos-medios/rutas"
import type { SubidaPreparada, UrlFirmada } from "@/lib/archivos/tipos"
import { contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import {
  codigoNegocio,
  type ErrorBd,
  MENSAJE_INESPERADO,
} from "@/lib/errores-bd"
import { transicionar } from "@/lib/negocio/transicionar"
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
  carpetaSoporte,
  nuevaRuta,
  perteneceA,
} from "@/lib/storage/rutas"
import {
  confirmarObjeto,
  MENSAJES_SUBIDA,
  prepararSubidaFirmada,
} from "@/lib/storage/subidas"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"

import {
  type CampoDocumento,
  interpretarErrorDocumento,
  MENSAJES_DOCUMENTO,
  type OperacionDocumento,
} from "./errores"
import { generarArchivosDocumento, informar } from "./generacion"
import { nombreDescargaArchivo } from "./presentacion"
import { numeracionDocumentoSoporte } from "./queries"
import {
  type ArchivoDocumento,
  type EntradaAnularDocumento,
  type EntradaConfirmarPdf,
  type EntradaDocumento,
  type EntradaFirmarArchivo,
  type EntradaLiquidacion,
  type EntradaPrepararPdf,
  type EntradaRegistrarCuds,
  type EntradaRegistrarExpedido,
  type EntradaRegistrarNotaAjuste,
  esquemaAnularDocumento,
  esquemaConfirmarPdf,
  esquemaDocumento,
  esquemaFirmarArchivo,
  esquemaLiquidacion,
  esquemaPrepararPdf,
  esquemaRegistrarCuds,
  esquemaRegistrarExpedido,
  esquemaRegistrarNotaAjuste,
} from "./schemas"
import type { EstadoDocumentoSoporte } from "./tipos"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

const PERMISO_DATOS_SENSIBLES = "datos_sensibles.ver" as const

function falloBd(
  operacion: string,
  error: ErrorBd,
  tipo: OperacionDocumento
): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorDocumento(error, tipo)
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

function falloInesperado(operacion: string, error: unknown): ResultadoFallo {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

function falloCampo(campo: CampoDocumento | "motivo", mensaje: string) {
  return fallo(mensaje, { [campo]: [mensaje] })
}

/** Una subida no tiene campos que marcar: el primer motivo, junto al archivo. */
function falloArchivo(validacion: {
  error: { issues: { message: string }[] }
}): ResultadoFallo {
  return fallo(
    validacion.error.issues[0]?.message ?? MENSAJES_SUBIDA.noCoincide
  )
}

/** La ficha, la lista de liquidaciones y los pagos (documento listo) muestran el cambio. */
function revalidar(liquidacionId: string | null): void {
  if (liquidacionId) revalidatePath(rutaLiquidacion(liquidacionId))
  revalidatePath(RUTA_LIQUIDACIONES)
  revalidatePath(RUTA_PAGOS_MEDIOS)
  refresh()
}

function puedeVerDatosSensibles(actor: UsuarioSesion): boolean {
  return tieneAlgunPermiso(actor, [PERMISO_DATOS_SENSIBLES])
}

interface DocumentoSesion {
  id: string
  liquidacion_id: string
  estado: EstadoDocumentoSoporte
  numero: string | null
  cuds: string | null
  archivo_path: string | null
  archivo_proveedor_path: string | null
  nota_ajuste_path: string | null
}

const COLUMNAS_SESION =
  "id, liquidacion_id, estado, numero, cuds, archivo_path, archivo_proveedor_path, nota_ajuste_path"

/** El documento leído con la sesión (su RLS exige `liquidaciones.ver`): de aquí salen las rutas. */
async function documentoDeSesion(
  documentoId: string
): Promise<DocumentoSesion | null> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("documentos_soporte")
    .select(COLUMNAS_SESION)
    .eq("id", documentoId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** El documento no anulado de una liquidación (hay a lo sumo uno). */
async function documentoVigente(
  liquidacionId: string
): Promise<DocumentoSesion | null> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from("documentos_soporte")
    .select(COLUMNAS_SESION)
    .eq("liquidacion_id", liquidacionId)
    .neq("estado", "ANULADO")
    .maybeSingle()
  if (error) throw error
  return data
}

function rutaDeArchivo(
  documento: DocumentoSesion,
  archivo: ArchivoDocumento
): string | null {
  switch (archivo) {
    case "pdf":
      return documento.archivo_path
    case "proveedor":
      return documento.archivo_proveedor_path
    case "nota_ajuste":
      return documento.nota_ajuste_path
  }
}

// ── Emitir (numeración de la plataforma) ─────────────────────────────────────

export interface DocumentoEmitido {
  documentoId: string
  numero: string | null
  /** El documento quedó emitido pero sus archivos no: qué pasó y qué hacer. */
  aviso: string | null
}

/**
 * Emite el documento soporte de una liquidación aprobada con el siguiente consecutivo de la resolución
 * vigente (`emitir_documento_soporte_srv`, idempotente) y genera sus archivos. Si los archivos fallan, el
 * documento queda emitido igual y la respuesta lo avisa: la sección ofrece «Generar archivos».
 */
export async function emitirDocumentoSoporte(
  entrada: EntradaLiquidacion
): Promise<ResultadoAccion<DocumentoEmitido>> {
  const actor = await requerirPermiso("liquidaciones.aprobar")
  const validacion = esquemaLiquidacion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  if (!puedeVerDatosSensibles(actor)) {
    return fallo(MENSAJES_DOCUMENTO.sinDatosSensibles)
  }
  const { liquidacionId } = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { data: documentoId, error } = await contexto.admin.rpc(
      "emitir_documento_soporte_srv",
      argumentosRpc<"emitir_documento_soporte_srv">({
        p_liquidacion_id: liquidacionId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (error) {
      revalidar(liquidacionId)
      return falloBd("emitirDocumentoSoporte", error, "emitir")
    }
    const archivos = await generarArchivosDocumento(contexto, documentoId)
    revalidar(liquidacionId)
    if (archivos.ok) {
      return exito({ documentoId, numero: archivos.datos.numero, aviso: null })
    }
    const emitido = await documentoDeSesion(documentoId)
    return exito({
      documentoId,
      numero: emitido?.numero ?? null,
      aviso: `El documento quedó emitido, pero sus archivos no: ${archivos.error} Usa «Generar archivos» para intentarlo de nuevo.`,
    })
  } catch (error) {
    return falloInesperado("emitirDocumentoSoporte", error)
  }
}

/**
 * Genera (o vuelve a generar) el PDF y el archivo para el proveedor de un documento emitido por la
 * plataforma. Con la numeración del proveedor no: su PDF es el que vale.
 */
export async function generarArchivosDocumentoSoporte(
  entrada: EntradaDocumento
): Promise<ResultadoAccion<{ numero: string }>> {
  const actor = await requerirPermiso("liquidaciones.aprobar")
  const validacion = esquemaDocumento.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  if (!puedeVerDatosSensibles(actor)) {
    return fallo(MENSAJES_DOCUMENTO.sinDatosSensibles)
  }
  const { documentoId } = validacion.data

  try {
    if ((await numeracionDocumentoSoporte()) !== "PLATAFORMA") {
      return fallo(MENSAJES_DOCUMENTO.archivosConProveedor)
    }
    const documento = await documentoDeSesion(documentoId)
    if (!documento) return fallo(MENSAJES_DOCUMENTO.noEncontrado)
    if (documento.estado !== "EMITIDO") {
      revalidar(documento.liquidacion_id)
      return fallo(MENSAJES_DOCUMENTO.documentoNoEmitido)
    }
    const contexto = await contextoDelActor(actor)
    const archivos = await generarArchivosDocumento(contexto, documentoId)
    revalidar(documento.liquidacion_id)
    return archivos
  } catch (error) {
    return falloInesperado("generarArchivosDocumentoSoporte", error)
  }
}

// ── CUDS ─────────────────────────────────────────────────────────────────────

/**
 * Registra el CUDS que devolvió el proveedor tras transmitir el documento (`registrar_cuds_srv`; repetir
 * el mismo es inocuo) y, con la numeración de la plataforma, vuelve a generar el PDF para que lo muestre.
 * Si eso falla, el CUDS queda registrado y la respuesta lo avisa.
 */
export async function registrarCuds(
  entrada: EntradaRegistrarCuds
): Promise<ResultadoAccion<{ aviso: string | null }>> {
  const actor = await requerirPermiso("liquidaciones.aprobar")
  const validacion = esquemaRegistrarCuds.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { documentoId, cuds } = validacion.data

  try {
    const documento = await documentoDeSesion(documentoId)
    if (!documento) return fallo(MENSAJES_DOCUMENTO.noEncontrado)
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "registrar_cuds_srv",
      argumentosRpc<"registrar_cuds_srv">({
        p_documento_id: documentoId,
        p_cuds: cuds,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (error) {
      revalidar(documento.liquidacion_id)
      return falloBd("registrarCuds", error, "cuds")
    }

    let aviso: string | null = null
    if ((await numeracionDocumentoSoporte()) === "PLATAFORMA") {
      if (!puedeVerDatosSensibles(actor)) {
        aviso =
          "El CUDS quedó registrado. Para que el PDF lo muestre, alguien con el permiso «Ver datos sensibles» debe usar «Volver a generar»."
      } else {
        const archivos = await generarArchivosDocumento(contexto, documentoId)
        if (!archivos.ok) {
          aviso = `El CUDS quedó registrado, pero no pudimos actualizar el PDF: ${archivos.error} Usa «Volver a generar».`
        }
      }
    }
    revalidar(documento.liquidacion_id)
    return exito({ aviso })
  } catch (error) {
    return falloInesperado("registrarCuds", error)
  }
}

// ── PDF que sube Finanzas (documento del proveedor o nota de ajuste) ─────────

/**
 * Destino firmado para subir un PDF a `soportes/documento_soporte/{id}/`. Para el documento del proveedor,
 * `preparar_documento_soporte_srv` da el borrador de la liquidación aprobada (lo crea si el anterior se
 * anuló); para la nota de ajuste, el documento emitido y transmitido. La ruta la construye el servidor y
 * se firma con la sesión: Storage evalúa ya su política de INSERT.
 */
export async function prepararPdfDocumentoSoporte(
  entrada: EntradaPrepararPdf
): Promise<ResultadoAccion<SubidaPreparada>> {
  const actor = await requerirPermiso("liquidaciones.aprobar")
  const validacion = esquemaPrepararPdf.safeParse(entrada)
  if (!validacion.success) return falloArchivo(validacion)
  const { liquidacionId, uso, archivo } = validacion.data

  try {
    let documentoId: string
    if (uso === "expedido") {
      if ((await numeracionDocumentoSoporte()) !== "PROVEEDOR") {
        return fallo(MENSAJES_DOCUMENTO.numeracionPdfProveedor)
      }
      const contexto = await contextoDelActor(actor)
      const { data, error } = await contexto.admin.rpc(
        "preparar_documento_soporte_srv",
        argumentosRpc<"preparar_documento_soporte_srv">({
          p_liquidacion_id: liquidacionId,
          p_actor_id: contexto.actorId,
          p_session_id: contexto.sessionId,
        })
      )
      if (error)
        return falloBd("prepararPdfDocumentoSoporte", error, "expedido")
      documentoId = data
    } else {
      const documento = await documentoVigente(liquidacionId)
      if (!documento) return fallo(MENSAJES_DOCUMENTO.noEncontrado)
      if (documento.estado !== "EMITIDO" || !documento.cuds) {
        return fallo(MENSAJES_DOCUMENTO.notaSinCuds)
      }
      documentoId = documento.id
    }
    const destino = nuevaRuta(
      carpetaSoporte("documento_soporte", documentoId),
      archivo.tipo
    )
    return await prepararSubidaFirmada({
      cliente: await crearClienteServidor(),
      ...destino,
    })
  } catch (error) {
    return falloInesperado("prepararPdfDocumentoSoporte", error)
  }
}

export interface PdfCargado {
  documentoId: string
  ruta: string
}

/**
 * Comprueba el PDF ya subido: es de la carpeta del documento vigente de la liquidación y Storage lo
 * tiene con el peso y el tipo declarados (como servicio: el equipo no lee el bucket). No escribe nada:
 * repetirlo con la misma ruta devuelve lo mismo. El registro va después, con los datos del diálogo.
 */
export async function confirmarPdfDocumentoSoporte(
  entrada: EntradaConfirmarPdf
): Promise<ResultadoAccion<PdfCargado>> {
  const actor = await requerirPermiso("liquidaciones.aprobar")
  const validacion = esquemaConfirmarPdf.safeParse(entrada)
  if (!validacion.success) return falloArchivo(validacion)
  const { liquidacionId, archivo } = validacion.data

  try {
    const documento = await documentoVigente(liquidacionId)
    if (!documento) return fallo(MENSAJES_DOCUMENTO.noEncontrado)
    const destino = carpetaSoporte("documento_soporte", documento.id)
    if (!archivoPerteneceA(archivo, destino)) {
      return fallo(MENSAJES_SUBIDA.noCoincide)
    }
    const contexto = await contextoDelActor(actor)
    const objeto = await confirmarObjeto({
      cliente: contexto.admin,
      bucket: destino.bucket,
      ruta: archivo.ruta,
      esperado: { tamano: archivo.tamano, tipo: archivo.tipo },
    })
    if (!objeto.ok) return objeto
    return exito({ documentoId: documento.id, ruta: archivo.ruta })
  } catch (error) {
    return falloInesperado("confirmarPdfDocumentoSoporte", error)
  }
}

// ── Numeración del proveedor ─────────────────────────────────────────────────

/**
 * Registra el documento que expidió el proveedor tecnológico: prefijo y número dentro de una resolución
 * vigente, fecha (entre la generación de la liquidación y hoy), CUDS y su PDF ya cargado
 * (`registrar_documento_soporte_externo_srv`). Queda EMITIDO con su CUDS.
 */
export async function registrarDocumentoExpedido(
  entrada: EntradaRegistrarExpedido
): Promise<ResultadoAccion<{ numero: string }>> {
  const actor = await requerirPermiso("liquidaciones.aprobar")
  const validacion = esquemaRegistrarExpedido.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  if (
    !perteneceA(
      datos.archivoPath,
      carpetaSoporte("documento_soporte", datos.documentoId)
    )
  ) {
    return falloCampo("archivo", MENSAJES_DOCUMENTO.archivoNoCargado)
  }

  try {
    const documento = await documentoDeSesion(datos.documentoId)
    if (!documento) return fallo(MENSAJES_DOCUMENTO.noEncontrado)
    const contexto = await contextoDelActor(actor)
    const { data, error } = await contexto.admin.rpc(
      "registrar_documento_soporte_externo_srv",
      argumentosRpc<"registrar_documento_soporte_externo_srv">({
        p_documento_id: datos.documentoId,
        p_prefijo: datos.prefijo,
        p_consecutivo: datos.consecutivo,
        p_fecha_emision: datos.fechaEmision,
        p_cuds: datos.cuds,
        p_archivo_path: datos.archivoPath,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    revalidar(documento.liquidacion_id)
    if (error) return falloBd("registrarDocumentoExpedido", error, "expedido")
    const numero =
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      typeof data.numero === "string"
        ? data.numero
        : `${datos.prefijo}${datos.consecutivo}`
    return exito({ numero })
  } catch (error) {
    return falloInesperado("registrarDocumentoExpedido", error)
  }
}

// ── Corrección: nota de ajuste y anulación (D38 del RF) ──────────────────────

/**
 * Registra la nota de ajuste de un documento transmitido (con CUDS): número, CUDE opcional y su PDF ya
 * cargado (`registrar_nota_ajuste_srv`). Después se puede anular el documento y emitir otro.
 */
export async function registrarNotaAjuste(
  entrada: EntradaRegistrarNotaAjuste
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("liquidaciones.aprobar")
  const validacion = esquemaRegistrarNotaAjuste.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  if (
    !perteneceA(
      datos.archivoPath,
      carpetaSoporte("documento_soporte", datos.documentoId)
    )
  ) {
    return falloCampo("archivo", MENSAJES_DOCUMENTO.archivoNoCargado)
  }

  try {
    const documento = await documentoDeSesion(datos.documentoId)
    if (!documento) return fallo(MENSAJES_DOCUMENTO.noEncontrado)
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "registrar_nota_ajuste_srv",
      argumentosRpc<"registrar_nota_ajuste_srv">({
        p_documento_id: datos.documentoId,
        p_numero: datos.numero,
        p_cude: datos.cude,
        p_archivo_path: datos.archivoPath,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    revalidar(documento.liquidacion_id)
    if (error) return falloBd("registrarNotaAjuste", error, "nota_ajuste")
    return exito()
  } catch (error) {
    return falloInesperado("registrarNotaAjuste", error)
  }
}

/**
 * Anula el documento emitido con un motivo (`transicionar` EMITIDO → ANULADO). Si ya se transmitió sin
 * nota de ajuste, la BD lo rechaza (hint `requiere_nota_ajuste`). La liquidación sigue aprobada y admite
 * otro documento.
 */
export async function anularDocumentoSoporte(
  entrada: EntradaAnularDocumento
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("liquidaciones.aprobar")
  const validacion = esquemaAnularDocumento.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { documentoId, motivo } = validacion.data

  try {
    const documento = await documentoDeSesion(documentoId)
    if (!documento) return fallo(MENSAJES_DOCUMENTO.noEncontrado)
    const contexto = await contextoDelActor(actor)
    const { error } = await transicionar(contexto, {
      entidad: "documentos_soporte",
      id: documentoId,
      hacia: "ANULADO",
      motivo,
    })
    revalidar(documento.liquidacion_id)
    if (error) {
      if (codigoNegocio(error) === "AMO_MOTIVO_REQUERIDO") {
        return falloCampo("motivo", "Indica el motivo de la anulación.")
      }
      return falloBd("anularDocumentoSoporte", error, "anular")
    }
    return exito()
  } catch (error) {
    return falloInesperado("anularDocumentoSoporte", error)
  }
}

// ── Descargas ────────────────────────────────────────────────────────────────

/**
 * URL firmada para descargar el PDF, el archivo para el proveedor o la nota de ajuste de un documento
 * (también de uno anulado). La ruta sale de la fila que la sesión puede leer y se firma como servicio:
 * queda `URL_FIRMADA` en la bitácora. Un archivo de los datos demo puede no existir en Storage.
 */
export async function firmarArchivoDocumentoSoporte(
  entrada: EntradaFirmarArchivo
): Promise<ResultadoAccion<UrlFirmada>> {
  const actor = await requerirPermiso("liquidaciones.ver")
  const validacion = esquemaFirmarArchivo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { documentoId, archivo } = validacion.data

  try {
    const documento = await documentoDeSesion(documentoId)
    if (!documento) return fallo(MENSAJES_DOCUMENTO.noEncontrado)
    const ruta = rutaDeArchivo(documento, archivo)
    if (!ruta) return fallo(MENSAJES_DOCUMENTO.sinArchivo)
    return await firmarDescarga({
      bucket: "soportes",
      ruta,
      firmante: {
        como: "servicio",
        contexto: await contextoDelActor(actor),
        entidad: "documentos_soporte",
        entidadId: documentoId,
      },
      descarga: nombreDescargaArchivo(archivo, documento.numero),
    })
  } catch (error) {
    return falloInesperado("firmarArchivoDocumentoSoporte", error)
  }
}
