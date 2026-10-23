/**
 * Contratos del paquete creativo (ANU-008, ANU-010; docs/entregas-2-3/fase-2.md,
 * paquete CR). Los importan el asistente de oferta, la ficha de la oferta y la
 * moderación: se amplían agregando campos, nunca quitando ni renombrando.
 */
import type { Database } from "@/types/database.types"

type Enums = Database["public"]["Enums"]

export type Plataforma = Enums["plataforma"]
export type TipoCreativo = Enums["creativo_tipo"]
export type EstadoOferta = Enums["oferta_estado"]
/** `anunciantes.estado_verificacion` de la empresa dueña de la oferta. */
export type EstadoEmpresa = Enums["anunciante_estado"]

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

/** Topes de configuración pública que aplican a todo creativo. */
export interface LimitesCreativo {
  /** `archivos.max_creativo_mb`: el formato nunca permite más. */
  maxCreativoMb: number
  /** `archivos.tolerancia_aspecto` (0.02 = ±2 %). */
  toleranciaAspecto: number
}

/** Textos del paquete tal como se guardan (hashtags con `#`, menciones con `@`). */
export interface TextosCreativo {
  copySugerido: string | null
  hashtags: string[]
  menciones: string[]
  enlaceDestino: string | null
}

/**
 * Lo que pinta el panel creativo de una oferta: la versión que se puede editar
 * (la vigente de una oferta sin publicar o la pendiente de una publicada), la
 * vigente para consultarla y, si no se puede editar, por qué.
 */
export interface DatosCreativo {
  ofertaId: string
  estadoOferta: EstadoOferta
  formato: FormatoOferta
  limites: LimitesCreativo
  editable: VersionCreativo | null
  vigente: VersionCreativo | null
  /** Motivo por el que no se puede editar (estado o permisos); `null` si se puede. */
  bloqueo: string | null
  /** Oferta publicada sin versión pendiente: se puede preparar una nueva. */
  admiteVersionNueva: boolean
  /**
   * Por qué el anunciante no puede activar una versión nueva de la oferta
   * publicada (su empresa no está verificada o está suspendida:
   * `activar_creativo_srv` lo rechaza); `null` si puede o si no aplica.
   */
  bloqueoActivacion: string | null
}

/** URL firmadas de los archivos de una versión (original y miniatura). */
export interface FirmasVersion {
  /** Id del archivo → URL; los que Storage no firmó (no existen) no están. */
  archivos: Record<string, { url: string; miniatura: string | null }>
  vigenciaSegundos: number
}

/** Resultado de preparar la versión nueva de una oferta publicada. */
export interface VersionPreparada {
  version: VersionCreativo
  /** Se creó, pero no todos los archivos de la vigente se pudieron copiar. */
  aviso: string | null
}

/** Resultado de activar la versión pendiente. */
export interface VersionActivada {
  version: number
  /** Id de la versión que deja de estar vigente (si había). */
  reemplazaA: string | null
}

/** Resultado de descartar la versión en preparación. */
export interface VersionDescartada {
  creativoId: string
  version: number
}
