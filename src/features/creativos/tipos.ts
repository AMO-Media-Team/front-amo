/**
 * STUB DEL LÍDER (fase 2): contrato del paquete CR. El paquete CR lo reemplaza
 * conservando estos nombres y formas (docs/entregas-2-3/fase-2.md).
 */
import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type Plataforma = Enums["plataforma"]
export type TipoCreativo = Enums["creativo_tipo"]

/** `formatos.requisitos` interpretado. */
export interface RequisitosFormato {
  mime: readonly string[]
  pesoMaxMb: number | null
  duracionMaxSeg: number | null
  /** Textos como `"9:16"` o `"1.91:1"`. */
  relacionesAspecto: readonly string[]
  maxArchivos: number
}

export interface FormatoOferta {
  id: string
  plataforma: Plataforma
  clave: string
  nombre: string
  requisitos: RequisitosFormato
}

export interface ArchivoCreativo {
  id: string
  ruta: string
  mime: string
  tamanoBytes: number
  ancho: number | null
  alto: number | null
  duracionSegundos: number | null
  orden: number
  sha256: string | null
}

export interface VersionCreativo {
  id: string
  version: number
  tipo: TipoCreativo
  vigente: boolean
  /** Versión nueva de una oferta publicada aún sin activar. */
  pendiente: boolean
  activadoAt: string | null
  copySugerido: string | null
  hashtags: string[]
  menciones: string[]
  enlaceDestino: string | null
  archivos: ArchivoCreativo[]
  createdAt: string
}

/** Lo que el asistente necesita saber del paso creativo. */
export interface EstadoCreativo {
  listo: boolean
  archivos: number
  faltan: string[]
}
