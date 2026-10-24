"use server"

/**
 * Server Actions de los pagos a medios (LIQ-005, LIQ-006). Patrón:
 *
 * 1. DAL (`requerirPermiso("liquidaciones.registrar_pago")`) antes que nada.
 * 2. zod: el MISMO esquema que el diálogo.
 * 3. Las RPC `*_srv` con actor y sesión (`contextoDelActor` + `argumentosRpc`):
 *    la BD revalida permiso, estado, documento soporte, datos de pago y
 *    archivos, y deja la bitácora (`REVELAR_DATO` por medio, `EXPORTAR`, la
 *    transición a PAGADA y `URL_FIRMADA`).
 * 4. `revalidatePath` de Pagos a medios y de las fichas de liquidación.
 *
 * El archivo de pagos se arma SOLO aquí: los datos bancarios se descifran en
 * memoria, van al CSV que se sube como servicio y se entregan por URL
 * firmada. Nunca salen en logs ni en la respuesta. Los errores esperados se
 * devuelven como `ResultadoAccion`; nunca se lanzan.
 */
import "server-only"

import { revalidatePath } from "next/cache"

import { RUTA_LIQUIDACIONES } from "@/features/liquidaciones/rutas"
import { type ContextoActor, contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import type { SubidaPreparada, UrlFirmada } from "@/lib/archivos/tipos"
import { type ErrorBd, MENSAJE_INESPERADO } from "@/lib/errores-bd"
import { serializarFecha } from "@/lib/fechas"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { informarStorage } from "@/lib/storage/cliente"
import { firmarDescarga } from "@/lib/storage/descargas"
import {
  archivoPerteneceA,
  carpetaSoporte,
  nuevaRuta,
  perteneceA,
  type RutaStorage,
} from "@/lib/storage/rutas"
import { subirComoServicio } from "@/lib/storage/subidas-servidor"
import {
  confirmarObjeto,
  MENSAJES_SUBIDA,
  prepararSubidaFirmada,
} from "@/lib/storage/subidas"
import { argumentosRpc } from "@/lib/supabase/rpc"
import { crearClienteServidor } from "@/lib/supabase/server"

import { construirArchivoPagos, nombreArchivoPagos } from "./archivo-pagos"
import { descifrarPagos } from "./descifrado"
import {
  cambioDeEstado,
  HINTS_PAGOS,
  interpretarErrorPagos,
  mensajeDatosIlegibles,
  MENSAJES_PAGOS,
  respondioLaBd,
} from "./errores"
import { sumarNeto } from "./preparacion"
import { RUTA_PAGOS_MEDIOS } from "./rutas"
import {
  type EntradaConfirmarSoportePago,
  type EntradaDescargarArchivoPagos,
  type EntradaGenerarArchivoPagos,
  type EntradaPrepararSoportePago,
  type EntradaRegistrarPago,
  esquemaConfirmarSoportePago,
  esquemaDescargarArchivoPagos,
  esquemaGenerarArchivoPagos,
  esquemaPrepararSoportePago,
  esquemaRegistrarPago,
} from "./schemas"
import type {
  PagoRegistrado,
  ResultadoArchivoPagos,
  SoporteCargado,
} from "./tipos"

const PERMISO = "liquidaciones.registrar_pago"
const PERMISO_DATOS = "datos_sensibles.ver"
const MIME_CSV = "text/csv"

/** Log de servidor sin datos personales: operación y código. */
function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[pagos-medios] ${operacion} falló (${codigo})`)
}

function falloBd(operacion: string, error: ErrorBd): ResultadoFallo {
  const { mensaje, campo, esperado } = interpretarErrorPagos(error)
  if (!esperado) informar(operacion, error)
  return campo ? fallo(mensaje, { [campo]: [mensaje] }) : fallo(mensaje)
}

/** Pagos a medios (incluida la ficha de cada archivo) y las fichas de liquidación. */
function revalidar(): void {
  revalidatePath(RUTA_PAGOS_MEDIOS, "layout")
  revalidatePath(RUTA_LIQUIDACIONES, "layout")
}

// ── Archivo de pagos (LIQ-005) ───────────────────────────────────────────────

/**
 * Si la BD rechazó el registro, el CSV con datos bancarios no se deja
 * huérfano. Solo entonces: ante un fallo de transporte la dispersión pudo
 * quedar registrada y su archivo debe seguir en Storage.
 */
async function retirarArchivo(
  contexto: ContextoActor,
  destino: RutaStorage
): Promise<void> {
  try {
    const { error } = await contexto.admin.storage
      .from(destino.bucket)
      .remove([destino.ruta])
    if (error) informarStorage("retirarArchivoPagos", error)
  } catch (error) {
    informarStorage("retirarArchivoPagos", error)
  }
}

function yaDispersada(error: ErrorBd): ResultadoAccion<ResultadoArchivoPagos> {
  return exito({
    tipo: "ya_dispersada",
    mensaje: interpretarErrorPagos(error).mensaje,
  })
}

/**
 * Genera el archivo de pagos para el banco con las liquidaciones elegidas:
 * `datos_dispersion_srv` (valida y revela, cifrados, los datos de pago) →
 * descifrado en el servidor → CSV → `subirComoServicio` a
 * `dispersion/{uuid}/` → `registrar_dispersion_srv` → URL firmada como
 * servicio. Si alguna ya estaba en otro archivo y no se confirmó
 * (`repetir`), responde `ya_dispersada` para pedir «Incluirlas otra vez».
 */
export async function generarArchivoPagos(
  entrada: EntradaGenerarArchivoPagos
): Promise<ResultadoAccion<ResultadoArchivoPagos>> {
  const actor = await requerirPermiso(PERMISO)
  const validacion = esquemaGenerarArchivoPagos.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  if (!tieneAlgunPermiso(actor, [PERMISO_DATOS])) {
    return fallo(MENSAJES_PAGOS.sinDatosSensibles)
  }
  const { liquidacionIds, repetir } = validacion.data

  let contexto: ContextoActor | null = null
  let subido: RutaStorage | null = null
  // Solo se retira el CSV si la BD respondió que no lo registró.
  let rechazado = false
  try {
    contexto = await contextoDelActor(actor)
    const datos = await contexto.admin.rpc(
      "datos_dispersion_srv",
      argumentosRpc<"datos_dispersion_srv">({
        p_liquidacion_ids: liquidacionIds,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_repetir: repetir,
      })
    )
    if (datos.error) {
      if (cambioDeEstado(datos.error)) revalidar()
      return datos.error.hint === HINTS_PAGOS.yaDispersada
        ? yaDispersada(datos.error)
        : falloBd("datos_dispersion_srv", datos.error)
    }
    const filas = datos.data ?? []
    if (filas.length === 0) {
      informar("generarArchivoPagos", new Error("SinFilas"))
      return fallo(MENSAJE_INESPERADO)
    }
    const descifrado = descifrarPagos(filas)
    if (!descifrado.ok) return fallo(mensajeDatosIlegibles(descifrado.medios))

    const fecha = serializarFecha(new Date())
    const dispersionId = crypto.randomUUID()
    const destino = nuevaRuta(
      carpetaSoporte("dispersion", dispersionId),
      MIME_CSV
    )
    const subida = await subirComoServicio({
      cliente: contexto.admin,
      destino,
      contenido: construirArchivoPagos(descifrado.pagos, fecha),
      tipo: MIME_CSV,
    })
    if (!subida.ok) return subida
    subido = destino

    const registro = await contexto.admin.rpc(
      "registrar_dispersion_srv",
      argumentosRpc<"registrar_dispersion_srv">({
        p_dispersion_id: dispersionId,
        p_liquidacion_ids: liquidacionIds,
        p_archivo_path: destino.ruta,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_repetir: repetir,
      })
    )
    if (registro.error) {
      if (!respondioLaBd(registro.error)) {
        // Se perdió la respuesta: pudo quedar registrada (y su archivo, en
        // Storage). Se refresca para que «Archivos de pagos» lo muestre.
        informar("registrar_dispersion_srv", registro.error)
        revalidar()
        return fallo(MENSAJES_PAGOS.respuestaPerdida)
      }
      rechazado = true
      if (cambioDeEstado(registro.error)) revalidar()
      return registro.error.hint === HINTS_PAGOS.yaDispersada
        ? yaDispersada(registro.error)
        : falloBd("registrar_dispersion_srv", registro.error)
    }
    revalidar()

    const nombreArchivo = nombreArchivoPagos(fecha)
    const firma = await firmarDescarga({
      bucket: destino.bucket,
      ruta: destino.ruta,
      firmante: {
        como: "servicio",
        contexto,
        entidad: "dispersiones",
        entidadId: dispersionId,
      },
      descarga: nombreArchivo,
    })
    return exito({
      tipo: "generado",
      dispersionId,
      cantidad: descifrado.pagos.length,
      medios: new Set(filas.map((fila) => fila.medio_id)).size,
      total: sumarNeto(descifrado.pagos),
      nombreArchivo,
      url: firma.ok ? firma.datos.url : null,
      avisoDescarga: firma.ok ? null : firma.error,
    })
  } catch (error) {
    informar("generarArchivoPagos", error)
    return fallo(MENSAJE_INESPERADO)
  } finally {
    if (contexto && subido && rechazado) await retirarArchivo(contexto, subido)
  }
}

/**
 * URL de descarga de un archivo de pagos ya generado. La ruta sale de la fila
 * leída con la sesión (RLS: `liquidaciones.registrar_pago`) y se firma como
 * servicio (el equipo no lee el bucket; queda `URL_FIRMADA`). Revela datos
 * bancarios: exige también «Ver datos sensibles».
 */
export async function descargarArchivoPagos(
  entrada: EntradaDescargarArchivoPagos
): Promise<ResultadoAccion<UrlFirmada>> {
  const actor = await requerirPermiso(PERMISO)
  const validacion = esquemaDescargarArchivoPagos.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  if (!tieneAlgunPermiso(actor, [PERMISO_DATOS])) {
    return fallo(MENSAJES_PAGOS.sinDatosSensibles)
  }
  const { dispersionId } = validacion.data

  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("dispersiones")
      .select("archivo_path, created_at")
      .eq("id", dispersionId)
      .maybeSingle()
    if (error) return falloBd("descargarArchivoPagos", error)
    if (!data) return fallo(MENSAJES_PAGOS.sinArchivo)
    return await firmarDescarga({
      bucket: "soportes",
      ruta: data.archivo_path,
      firmante: {
        como: "servicio",
        contexto: await contextoDelActor(actor),
        entidad: "dispersiones",
        entidadId: dispersionId,
      },
      descarga: nombreArchivoPagos(serializarFecha(new Date(data.created_at))),
    })
  } catch (error) {
    informar("descargarArchivoPagos", error)
    return fallo(MENSAJE_INESPERADO)
  }
}

// ── Pago de una liquidación (LIQ-006) ────────────────────────────────────────

/**
 * Destino firmado para subir el soporte del pago a
 * `liquidacion/{id}/pago/{uuid}.{ext}`. Se firma con la sesión: Storage evalúa
 * ya su política de INSERT (`liquidaciones.registrar_pago`).
 */
export async function prepararSoportePago(
  entrada: EntradaPrepararSoportePago
): Promise<ResultadoAccion<SubidaPreparada>> {
  await requerirPermiso(PERMISO)
  const validacion = esquemaPrepararSoportePago.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { liquidacionId, descripcion } = validacion.data

  try {
    const destino = nuevaRuta(
      carpetaSoporte("liquidacion", liquidacionId, "pago"),
      descripcion.tipo
    )
    return await prepararSubidaFirmada({
      cliente: await crearClienteServidor(),
      ...destino,
    })
  } catch (error) {
    informar("prepararSoportePago", error)
    return fallo(MENSAJES_SUBIDA.noPreparada)
  }
}

/**
 * Comprueba que el soporte quedó en la carpeta de pago de esa liquidación con
 * el peso y el tipo declarados (idempotente por ruta). El objeto se verifica
 * como servicio: el equipo no tiene SELECT en `soportes`. No guarda nada: el
 * pago lo registra `registrarPagoLiquidacion`, que la BD vuelve a comprobar.
 */
export async function confirmarSoportePago(
  entrada: EntradaConfirmarSoportePago
): Promise<ResultadoAccion<SoporteCargado>> {
  const actor = await requerirPermiso(PERMISO)
  const validacion = esquemaConfirmarSoportePago.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { liquidacionId, archivo } = validacion.data

  try {
    const destino = carpetaSoporte("liquidacion", liquidacionId, "pago")
    if (!archivoPerteneceA(archivo, destino)) {
      return fallo(MENSAJES_PAGOS.soporteAjeno)
    }
    const contexto = await contextoDelActor(actor)
    const objeto = await confirmarObjeto({
      cliente: contexto.admin,
      bucket: destino.bucket,
      ruta: archivo.ruta,
      esperado: { tamano: archivo.tamano, tipo: archivo.tipo },
    })
    return objeto.ok ? exito({ ruta: archivo.ruta }) : fallo(objeto.error)
  } catch (error) {
    informar("confirmarSoportePago", error)
    return fallo(MENSAJES_SUBIDA.noVerificado)
  }
}

/**
 * Registra el pago de una liquidación aprobada con su fecha, referencia y
 * soporte ya cargado (`registrar_pago_liquidacion_srv`): la BD exige la fecha
 * entre la generación y hoy, el soporte en Storage y el documento soporte o la
 * factura del medio; pasa la liquidación y sus asignaciones a PAGADA y avisa
 * al medio («Pagamos tu liquidación…»).
 */
export async function registrarPagoLiquidacion(
  entrada: EntradaRegistrarPago
): Promise<ResultadoAccion<PagoRegistrado>> {
  const actor = await requerirPermiso(PERMISO)
  const validacion = esquemaRegistrarPago.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { liquidacionId, fecha, referencia, soportePath } = validacion.data
  if (
    !perteneceA(
      soportePath,
      carpetaSoporte("liquidacion", liquidacionId, "pago")
    )
  ) {
    return fallo(MENSAJES_PAGOS.soporteAjeno, {
      soporte: [MENSAJES_PAGOS.soporteAjeno],
    })
  }

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "registrar_pago_liquidacion_srv",
      argumentosRpc<"registrar_pago_liquidacion_srv">({
        p_liquidacion_id: liquidacionId,
        p_fecha: fecha,
        p_referencia: referencia,
        p_soporte_path: soportePath,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
      })
    )
    if (error) {
      if (cambioDeEstado(error)) revalidar()
      return falloBd("registrarPagoLiquidacion", error)
    }
    revalidar()
    return exito({ liquidacionId })
  } catch (error) {
    informar("registrarPagoLiquidacion", error)
    return fallo(MENSAJE_INESPERADO)
  }
}
