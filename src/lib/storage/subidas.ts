import "server-only"

/**
 * Subida directa a Storage (docs/modelo-datos.md §8): la Server Action de cada
 * feature autoriza con el DAL, construye la ruta con `rutas.ts` y llama a
 * `prepararSubidaFirmada`; el navegador sube con el token (o con TUS si pesa
 * más de 6 MB) y la acción de confirmar comprueba la ruta que devuelve el
 * navegador con `archivoPerteneceA` (rutas.ts) y con `confirmarObjeto` que el
 * objeto existe y es el que se declaró antes de guardarlo en su fila. Esa
 * acción debe ser idempotente por ruta: el navegador la repite si pierde la
 * respuesta. No hay Server Actions aquí: son utilidades que cada `actions.ts`
 * usa.
 */
import type { SubidaPreparada } from "@/lib/archivos/tipos"
import { exito, fallo, type ResultadoAccion } from "@/lib/result"

import { type ClienteStorage, estadoDeError, informarStorage } from "./cliente"
import {
  asegurarRutaSegura,
  ErrorRutaStorage,
  type RutaStorage,
  rutaMiniatura,
} from "./rutas"

export const MENSAJES_SUBIDA = {
  sinPermiso: "No tienes permiso para subir archivos aquí.",
  noPreparada: "No pudimos preparar la subida. Inténtalo de nuevo.",
  noSubido: "El archivo no terminó de subir. Inténtalo de nuevo.",
  noCoincide:
    "El archivo recibido no coincide con el que elegiste. Súbelo de nuevo.",
  noVerificado: "No pudimos verificar el archivo. Inténtalo de nuevo.",
} as const

function esDenegado(error: unknown): boolean {
  const estado = estadoDeError(error)
  const mensaje =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : ""
  return (
    estado === 401 ||
    estado === 403 ||
    /row-level security|unauthorized|not allowed/i.test(mensaje)
  )
}

export interface OpcionesPrepararSubida extends RutaStorage {
  cliente: ClienteStorage
  /** Firma también el destino de la miniatura (`{uuid}-min.webp`). */
  miniatura?: boolean
}

/**
 * Pide a Storage una URL firmada de subida para una ruta que construyó el
 * servidor. Con el cliente de sesión, Storage evalúa ya aquí la política
 * INSERT de `storage.objects`: si la persona no puede subir ahí, falla antes de
 * transferir un byte. El token vale 2 horas y solo para esa ruta.
 */
export async function prepararSubidaFirmada({
  cliente,
  bucket,
  ruta,
  miniatura = false,
}: OpcionesPrepararSubida): Promise<ResultadoAccion<SubidaPreparada>> {
  try {
    const almacen = cliente.storage.from(bucket)
    const rutas = miniatura
      ? [asegurarRutaSegura(ruta), rutaMiniatura(ruta)]
      : [asegurarRutaSegura(ruta)]
    const firmas = await Promise.all(
      rutas.map((destino) => almacen.createSignedUploadUrl(destino))
    )
    const destinos: { path: string; token: string }[] = []
    for (const { data, error } of firmas) {
      if (error) {
        if (esDenegado(error)) return fallo(MENSAJES_SUBIDA.sinPermiso)
        informarStorage(`createSignedUploadUrl(${bucket})`, error)
        return fallo(MENSAJES_SUBIDA.noPreparada)
      }
      destinos.push(data)
    }
    const [principal, deMiniatura] = destinos
    return exito({
      bucket,
      ruta: principal.path,
      token: principal.token,
      miniatura: deMiniatura
        ? { ruta: deMiniatura.path, token: deMiniatura.token }
        : null,
    })
  } catch (error) {
    informarStorage(
      error instanceof ErrorRutaStorage
        ? `prepararSubidaFirmada(${bucket}): ${error.message}`
        : `prepararSubidaFirmada(${bucket})`,
      error
    )
    return fallo(MENSAJES_SUBIDA.noPreparada)
  }
}

export interface ObjetoStorage extends RutaStorage {
  /** Bytes según Storage (no según el navegador). */
  tamano: number | null
  /** MIME con que quedó guardado. */
  tipo: string | null
}

export interface OpcionesConfirmarObjeto extends RutaStorage {
  cliente: ClienteStorage
  /** Lo que el navegador declaró: si Storage dice otra cosa, se rechaza. */
  esperado?: { tamano?: number; tipo?: string }
}

/**
 * Comprueba que el objeto existe (y, si se pasa `esperado`, que su peso y su
 * MIME son los declarados) antes de guardar la ruta en la fila de negocio.
 * Devuelve lo que Storage sabe del objeto, para no confiar en el cliente.
 * Con el cliente de sesión exige SELECT sobre el objeto (RLS).
 */
export async function confirmarObjeto({
  cliente,
  bucket,
  ruta,
  esperado,
}: OpcionesConfirmarObjeto): Promise<ResultadoAccion<ObjetoStorage>> {
  try {
    const { data, error } = await cliente.storage
      .from(bucket)
      .info(asegurarRutaSegura(ruta))
    if (error) {
      const estado = estadoDeError(error)
      if (estado === 400 || estado === 404) {
        return fallo(MENSAJES_SUBIDA.noSubido)
      }
      informarStorage(`info(${bucket})`, error)
      return fallo(MENSAJES_SUBIDA.noVerificado)
    }
    const objeto: ObjetoStorage = {
      bucket,
      ruta,
      tamano: typeof data.size === "number" ? data.size : null,
      tipo: data.contentType ?? null,
    }
    const tamanoDistinto =
      esperado?.tamano !== undefined &&
      objeto.tamano !== null &&
      objeto.tamano !== esperado.tamano
    const tipoDistinto =
      esperado?.tipo !== undefined &&
      objeto.tipo !== null &&
      objeto.tipo !== esperado.tipo
    if (tamanoDistinto || tipoDistinto) return fallo(MENSAJES_SUBIDA.noCoincide)
    return exito(objeto)
  } catch (error) {
    informarStorage(`confirmarObjeto(${bucket})`, error)
    return fallo(MENSAJES_SUBIDA.noVerificado)
  }
}
