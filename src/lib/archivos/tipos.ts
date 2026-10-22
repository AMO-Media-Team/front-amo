/**
 * Contratos compartidos entre el navegador (subida, visor) y el servidor
 * (`src/lib/storage`, las Server Actions de cada feature).
 */
import type { BucketStorage } from "./buckets"

export interface Dimensiones {
  ancho: number
  alto: number
}

/**
 * Lo que el navegador declara al pedir dónde subir un archivo. El servidor lo
 * valida con `esquemaDescripcionArchivo` y nunca recibe una ruta del cliente.
 */
export interface DescripcionArchivo {
  /** Nombre original (solo para mostrarlo; la ruta usa un uuid). */
  nombre: string
  /** MIME normalizado (`mimeDeArchivo`). */
  tipo: string
  tamano: number
  /** Hex de 64 caracteres, si se pidió calcularlo. */
  sha256: string | null
  dimensiones: Dimensiones | null
  duracionSeg: number | null
  /** El navegador generó una miniatura y necesita destino para ella. */
  conMiniatura: boolean
}

/** Destino firmado de una subida: ruta construida por el servidor y su token. */
export interface DestinoSubida {
  ruta: string
  token: string
}

/** Respuesta de `preparar` (lo que devuelve `prepararSubidaFirmada`). */
export interface SubidaPreparada extends DestinoSubida {
  bucket: BucketStorage
  /** Destino de la miniatura (`{uuid}-min.webp`), si se pidió. */
  miniatura: DestinoSubida | null
}

/** Lo que recibe `confirmar` cuando el objeto ya está en Storage. */
export interface ArchivoSubido extends DescripcionArchivo {
  bucket: BucketStorage
  ruta: string
  rutaMiniatura: string | null
}

/** URL de lectura de corta duración (`firmarDescarga`). */
export interface UrlFirmada {
  url: string
  /** Segundos de vida desde que se emitió (`archivos.vigencia_url_firmada_segundos`). */
  vigenciaSegundos: number
}
