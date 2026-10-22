/**
 * Datos que las consultas de verificación entregan a la interfaz. Nunca llevan
 * la ruta de un archivo en Storage (se firma en el servidor por id) ni datos
 * de `*_privado`: solo el MIME, para elegir cómo mostrarlo.
 */
import type {
  EstadoMedio,
  Plataforma,
  TipoMedio,
} from "@/features/operacion/estados"
import type { VigenciaVerificacion } from "@/features/operacion/calculos"
import type { Database } from "@/types/database.types"

import type { Cola } from "./colas"
import type { DocumentoRequisito, NivelRequisitos } from "./requisitos"
import type { RangoFranja } from "./seguidores"

type Enums = Database["public"]["Enums"]

export type MetodoVerificacion = Enums["metodo_verificacion"]

/** `null`: la persona no tiene acceso a esa cola. */
export type ContadoresColas = Readonly<Record<Cola, number | null>>

export interface Pagina<T> {
  filas: T[]
  total: number
  pagina: number
}

export interface MedioResumen {
  id: string
  nombre: string
}

export interface MedioEnCola extends MedioResumen {
  tipo: TipoMedio
  municipio: string | null
  departamento: string | null
  enviadoAt: string
  /** Lo rechazaron antes y volvió a enviarlo. */
  reenvio: boolean
  documentosPorRevisar: number | null
  cuentasPorVerificar: number
  cuentasVerificadas: number
}

export interface MedioSinEnviar extends MedioResumen {
  creadoAt: string
}

export interface ColaMedios extends Pagina<MedioEnCola> {
  sinEnviar: { total: number; primeros: MedioSinEnviar[] }
}

export interface DocumentoEnCola extends DocumentoExpediente {
  medio: MedioResumen & { estado: EstadoMedio; nivel: number }
}

export interface CuentaVerificada {
  id: string
  plataforma: Plataforma
  handle: string
  url: string
  /** Última cifra aprobada (para comparar). */
  seguidoresVerificados: number | null
  ultimaVerificacionAt: string | null
}

export interface VerificacionEnCola {
  id: string
  metodo: MetodoVerificacion
  seguidoresReportados: number
  creadaAt: string
  /** Última carga de la captura (la BD la compara con el vencimiento del código). */
  actualizadaAt: string
  codigoExpiraAt: string | null
  /** MIME de la captura; `null` si aún no la carga. */
  mimeCaptura: string | null
  cuenta: CuentaVerificada
  medio: MedioResumen
}

export interface ColaCuentas extends Pagina<VerificacionEnCola> {
  /** Verificaciones abiertas a las que aún les falta la captura del medio. */
  esperandoCaptura: number
}

/** Documento tal como se revisa: metadatos y el MIME del archivo (nunca su ruta). */
export interface DocumentoExpediente extends DocumentoRequisito {
  observaciones: string | null
  validadoAt: string | null
  /** `null` sin archivo (prueba de vida por videollamada). */
  mime: string | null
}

export interface CuentaExpediente extends CuentaVerificada {
  verificada: boolean
  vigencia: VigenciaVerificacion
  venceAt: string | null
  franja: string | null
  pendiente: VerificacionEnCola | null
}

export interface NivelExpediente extends NivelRequisitos {
  tope: number | null
}

export interface ExpedienteMedio {
  medio: MedioResumen & {
    estado: EstadoMedio
    nivel: number
    enviadoAt: string | null
    motivoEstado: string | null
  }
  /** `null` sin `datos_sensibles.ver` (la RLS no los entrega). */
  documentos: DocumentoExpediente[] | null
  cuentas: CuentaExpediente[]
  niveles: NivelExpediente[]
  franjas: RangoFranja[]
  /** `YYYY-MM-DD` de Bogotá con que se evalúan las vigencias. */
  hoy: string
}
