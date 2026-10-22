import "server-only"

/**
 * URL firmadas de lectura (docs/modelo-datos.md §8, reglas de firma):
 *
 * 1. `como: "usuario"`: se firma con el cliente de sesión, de modo que aplica
 *    la RLS de `storage.objects`. Es el camino normal (dueño o contraparte).
 * 2. `como: "servicio"`: se firma con la secret key, SOLO después de que la
 *    acción (a) validó el permiso con el DAL y (b) leyó con la sesión la fila
 *    que referencia el objeto y tomó la ruta de ESA fila (nunca del cliente).
 *    Aquí se cumple (c): queda `URL_FIRMADA` en la bitácora antes de firmar y,
 *    sin ese registro, no se entrega nada. Es el camino de los internos en
 *    `documentos` y `soportes`, y de las capturas demo `evidencias/muestras/`.
 *
 * La vigencia sale de `archivos.vigencia_url_firmada_segundos`.
 */
import type { ContextoActor } from "@/lib/auth/contexto-actor"
import { registrarEvento } from "@/lib/auth/registro"
import type { BucketStorage } from "@/lib/archivos/buckets"
import type { UrlFirmada } from "@/lib/archivos/tipos"
import { exito, fallo, type ResultadoAccion } from "@/lib/result"
import { vigenciaUrlFirmada } from "@/lib/supabase/url-firmada"

import { type ClienteStorage, estadoDeError, informarStorage } from "./cliente"
import { asegurarRutaSegura } from "./rutas"

export const MENSAJES_DESCARGA = {
  noEncontrado: "No encontramos el archivo o no tienes acceso a él.",
  sinRegistro:
    "No pudimos registrar el acceso al archivo, así que no se abrió. Inténtalo de nuevo.",
  inesperado: "No pudimos abrir el archivo. Inténtalo de nuevo.",
} as const

export type Firmante =
  | { como: "usuario"; cliente: ClienteStorage }
  | {
      como: "servicio"
      contexto: ContextoActor
      /** Tabla de la fila que referencia el objeto (p. ej. `documentos_medio`). */
      entidad: string
      entidadId: string | null
    }

export interface OpcionesFirmarDescargas {
  bucket: BucketStorage
  /** Rutas tomadas de filas que la persona puede leer (RLS), nunca del cliente. */
  rutas: readonly string[]
  firmante: Firmante
  /**
   * Fuerza la descarga (`Content-Disposition: attachment`) con ese nombre; con
   * `true`, el nombre del objeto. Sin él, el navegador lo muestra si puede.
   */
  descarga?: string | true
}

export interface UrlsFirmadas {
  /** Ruta → URL; las que Storage no firmó (no existen, sin acceso) no están. */
  urls: Record<string, string>
  vigenciaSegundos: number
}

const LARGO_NOMBRE_DESCARGA = 120
const LARGO_MAXIMO_EXTENSION = 10

/**
 * Nombre seguro para `Content-Disposition`: solo letras sin tilde, cifras,
 * espacio, punto, guion y guion bajo. supabase-js codifica `download` dos
 * veces (`URLSearchParams` y luego `encodeURI`), así que cualquier otro
 * carácter llegaría como `%C3%A9` en el nombre del archivo descargado
 * («Cédula» → «Cedula»). Conserva la extensión al recortar.
 */
export function nombreDescarga(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^A-Za-z0-9._ -]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ (?=\.)/g, "")
    .replace(/^[\s.]+/, "")
    .trim()
  if (limpio.length <= LARGO_NOMBRE_DESCARGA) return limpio || "archivo"
  const punto = limpio.lastIndexOf(".")
  const extension =
    punto > 0 && limpio.length - punto <= LARGO_MAXIMO_EXTENSION + 1
      ? limpio.slice(punto)
      : ""
  const base = limpio
    .slice(0, LARGO_NOMBRE_DESCARGA - extension.length)
    .trimEnd()
  return `${base}${extension}`
}

function opcionDescarga(descarga: string | true | undefined) {
  if (descarga === undefined) return undefined
  return { download: descarga === true ? true : nombreDescarga(descarga) }
}

async function clienteFirmante(
  firmante: Firmante,
  bucket: BucketStorage,
  rutas: readonly string[],
  vigenciaSegundos: number
): Promise<ClienteStorage | null> {
  if (firmante.como === "usuario") return firmante.cliente
  const registrado = await registrarEvento({
    actorId: firmante.contexto.actorId,
    admin: firmante.contexto.admin,
    accion: "URL_FIRMADA",
    entidad: firmante.entidad,
    entidadId: firmante.entidadId,
    metadatos: { bucket, rutas: [...rutas], expira_s: vigenciaSegundos },
  })
  return registrado ? firmante.contexto.admin : null
}

/**
 * Firma varias rutas del mismo bucket en una sola llamada (listas de
 * documentos, galerías). Con `como: "servicio"` registra una sola vez todas.
 */
export async function firmarDescargas({
  bucket,
  rutas,
  firmante,
  descarga,
}: OpcionesFirmarDescargas): Promise<ResultadoAccion<UrlsFirmadas>> {
  try {
    const unicas = [...new Set(rutas.map(asegurarRutaSegura))]
    const vigenciaSegundos = await vigenciaUrlFirmada()
    if (unicas.length === 0) return exito({ urls: {}, vigenciaSegundos })

    const cliente = await clienteFirmante(
      firmante,
      bucket,
      unicas,
      vigenciaSegundos
    )
    if (!cliente) return fallo(MENSAJES_DESCARGA.sinRegistro)

    const { data, error } = await cliente.storage
      .from(bucket)
      .createSignedUrls(unicas, vigenciaSegundos, opcionDescarga(descarga))
    if (error) {
      const estado = estadoDeError(error)
      if (estado === 400 || estado === 403 || estado === 404) {
        return fallo(MENSAJES_DESCARGA.noEncontrado)
      }
      informarStorage(`createSignedUrls(${bucket})`, error)
      return fallo(MENSAJES_DESCARGA.inesperado)
    }
    const urls = Object.fromEntries(
      data.flatMap((firmada) =>
        firmada.path && firmada.signedUrl && !firmada.error
          ? [[firmada.path, firmada.signedUrl] as const]
          : []
      )
    )
    return exito({ urls, vigenciaSegundos })
  } catch (error) {
    informarStorage(`firmarDescargas(${bucket})`, error)
    return fallo(MENSAJES_DESCARGA.inesperado)
  }
}

export interface OpcionesFirmarDescarga extends Omit<
  OpcionesFirmarDescargas,
  "rutas"
> {
  ruta: string
}

/** Firma una sola ruta: lo que consume `VisorArchivoFirmado`. */
export async function firmarDescarga({
  ruta,
  ...opciones
}: OpcionesFirmarDescarga): Promise<ResultadoAccion<UrlFirmada>> {
  const resultado = await firmarDescargas({ ...opciones, rutas: [ruta] })
  if (!resultado.ok) return resultado
  const url = resultado.datos.urls[ruta]
  return url
    ? exito({ url, vigenciaSegundos: resultado.datos.vigenciaSegundos })
    : fallo(MENSAJES_DESCARGA.noEncontrado)
}
