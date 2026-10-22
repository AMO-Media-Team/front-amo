/**
 * Reglas puras del transporte de subida a Storage (docs/modelo-datos.md §8):
 * hasta 6 MB, PUT a la URL firmada que preparó el servidor; por encima, TUS
 * reanudable en bloques de 6 MB con el JWT de la sesión (la RLS de
 * `storage.objects` decide). Y cuándo renovar una URL firmada de lectura.
 */
import type { BucketStorage } from "./buckets"
import { MIB } from "./formato"

/** Supabase recomienda la subida estándar hasta 6 MB y TUS por encima. */
export const UMBRAL_TUS_BYTES = 6 * MIB
/** Supabase exige bloques de exactamente 6 MB en TUS. */
export const BLOQUE_TUS_BYTES = 6 * MIB
/** Los objetos no cambian (cada versión es un uuid nuevo). */
export const CACHE_CONTROL_SEGUNDOS = "3600"
/** Parte de la vigencia tras la cual una URL firmada se vuelve a pedir. */
export const FRACCION_RENOVACION = 0.8

export type MetodoSubida = "firmada" | "tus"

export function metodoSubida(tamano: number, permitirTus = true): MetodoSubida {
  return permitirTus && tamano > UMBRAL_TUS_BYTES ? "tus" : "firmada"
}

function sinBarraFinal(url: string): string {
  return url.replace(/\/+$/, "")
}

function codificarRuta(ruta: string): string {
  return ruta.split("/").map(encodeURIComponent).join("/")
}

/** Mismo destino que `uploadToSignedUrl` de supabase-js. */
export function urlSubidaFirmada(
  urlSupabase: string,
  bucket: BucketStorage,
  ruta: string,
  token: string
): string {
  const base = sinBarraFinal(urlSupabase)
  return `${base}/storage/v1/object/upload/sign/${bucket}/${codificarRuta(ruta)}?token=${encodeURIComponent(token)}`
}

export function endpointTus(urlSupabase: string): string {
  return `${sinBarraFinal(urlSupabase)}/storage/v1/upload/resumable`
}

/** Metadatos que exige el servidor TUS de Supabase. */
export function metadatosTus(
  bucket: BucketStorage,
  ruta: string,
  tipo: string
): Record<string, string> {
  return {
    bucketName: bucket,
    objectName: ruta,
    contentType: tipo,
    cacheControl: CACHE_CONTROL_SEGUNDOS,
  }
}

/** Progreso conjunto (0–1) de varias partes que se suben por bytes. */
export function progresoConjunto(
  partes: readonly { enviados: number; total: number }[]
): number {
  const total = partes.reduce((suma, parte) => suma + parte.total, 0)
  if (total <= 0) return 0
  const enviados = partes.reduce(
    (suma, parte) => suma + Math.min(parte.enviados, parte.total),
    0
  )
  return Math.min(1, enviados / total)
}

/**
 * Momento (ms de época) en que conviene renovar una URL firmada recibida en
 * `recibidaEn`: al consumir el 80 % de su vida, con al menos 5 s de margen.
 */
export function momentoRenovacion(
  recibidaEn: number,
  vigenciaSegundos: number,
  fraccion: number = FRACCION_RENOVACION
): number {
  const vidaMs = vigenciaSegundos * 1000
  const margen = Math.max(5_000, vidaMs * (1 - fraccion))
  return recibidaEn + Math.max(0, vidaMs - margen)
}
