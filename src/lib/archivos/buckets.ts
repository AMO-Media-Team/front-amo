/**
 * Buckets privados de Storage con sus límites, tal como los crea la migración
 * `20261001044423_storage` (docs/modelo-datos.md §8). Storage los vuelve a
 * imponer: esto sirve para avisar ANTES de subir y para validar en el servidor
 * lo que declara el cliente.
 */
import { MIB } from "./formato"
import type { MimeConocido } from "./mime"

export interface LimitesBucket {
  maxBytes: number
  mimes: readonly MimeConocido[]
}

export const BUCKETS = {
  avatares: {
    maxBytes: 2 * MIB,
    mimes: ["image/jpeg", "image/png", "image/webp"],
  },
  documentos: {
    maxBytes: 10 * MIB,
    mimes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
    ],
  },
  creativos: {
    // Máximo global del plan; `archivos.max_creativo_mb` puede bajarlo.
    maxBytes: 50 * MIB,
    mimes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/quicktime",
    ],
  },
  evidencias: {
    maxBytes: 10 * MIB,
    mimes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  },
  soportes: {
    maxBytes: 10 * MIB,
    // JSON: archivo genérico del documento soporte para el proveedor tecnológico (e3_finanzas).
    mimes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "text/csv",
      "application/json",
    ],
  },
} as const satisfies Record<string, LimitesBucket>

export type BucketStorage = keyof typeof BUCKETS

export const NOMBRES_BUCKETS = Object.keys(BUCKETS) as BucketStorage[]

export function esBucketStorage(valor: string): valor is BucketStorage {
  return Object.hasOwn(BUCKETS, valor)
}

export function mimePermitidoEn(
  bucket: BucketStorage,
  mime: string
): mime is MimeConocido {
  return (BUCKETS[bucket].mimes as readonly string[]).includes(mime)
}
