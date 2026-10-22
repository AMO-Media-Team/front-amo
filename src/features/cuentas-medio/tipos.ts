/**
 * DTO de «Mi medio › Cuentas sociales» (MED-005, MED-006): lo que el servidor
 * entrega a la interfaz. Nunca lleva la huella del código ni la ruta de la
 * captura: el código se muestra una sola vez (`CodigoGenerado`) y la captura
 * se firma por el id de su verificación.
 */
import type {
  EstadoValidacion,
  Plataforma,
} from "@/features/operacion/estados"
import type { Database } from "@/types/database.types"

export type MetodoVerificacion = Database["public"]["Enums"]["metodo_verificacion"]

/** Un intento de verificación (o de reverificación) de la cuenta. */
export interface VerificacionCuentaMedio {
  id: string
  metodo: MetodoVerificacion
  estado: EstadoValidacion
  seguidoresReportados: number
  seguidoresVerificados: number | null
  tieneCaptura: boolean
  /** Solo en CODIGO_HISTORIA: hasta cuándo se puede cargar la captura. */
  codigoExpiraAt: string | null
  /** Observaciones de quien la revisó (motivo del rechazo). */
  observaciones: string | null
  creadaAt: string
  validadaAt: string | null
}

export interface FranjaSeguidores {
  id: string
  clave: string
  nombre: string
  seguidoresMin: number
  seguidoresMax: number | null
}

export interface CuentaMedio {
  id: string
  plataforma: Plataforma
  handle: string
  url: string
  tarifaReferencia: number | null
  verificada: boolean
  seguidoresVerificados: number | null
  franja: Pick<FranjaSeguidores, "clave" | "nombre"> | null
  metodoVerificacion: MetodoVerificacion | null
  ultimaVerificacionAt: string | null
  creadaAt: string
  /** Versión para el bloqueo optimista al editar. */
  actualizadaAt: string
  /** De la más reciente a la más antigua (hasta `MAX_HISTORIAL`). */
  verificaciones: VerificacionCuentaMedio[]
}

/** Parámetros de configuración que gobiernan la verificación. */
export interface ParametrosVerificacion {
  /** `medios.reverificacion_dias`. */
  diasVigencia: number
  /** `medios.reverificacion_gracia_dias`. */
  diasGracia: number
  /** `medios.codigo_verificacion_minutos`. */
  minutosCodigo: number
  /** `medios.umbral_seguidores`: por debajo no hay franja ni ofertas. */
  umbralSeguidores: number
}

export interface PanelCuentas {
  cuentas: CuentaMedio[]
  franjas: FranjaSeguidores[]
  parametros: ParametrosVerificacion
}

/** Respuesta de generar el código: la ÚNICA vez que viaja en claro. */
export interface CodigoGenerado {
  verificacionId: string
  codigo: string
  expiraAt: string
}

export interface CuentaGuardada {
  id: string
  actualizadaAt: string
}

export interface VerificacionEnviada {
  verificacionId: string
}
