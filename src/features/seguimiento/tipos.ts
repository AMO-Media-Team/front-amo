/**
 * Tipos del seguimiento de una campaña (ANU-011). Lo que llega aquí sale de
 * `seguimiento_campana` (definer, filtrada a la empresa del usuario): el perfil
 * público del medio, la cuenta con la que aceptó, sus publicaciones y los
 * cortes de métricas APROBADOS. Nunca documentos, datos bancarios ni lo que
 * recibe el medio: el monto es el valor bruto que paga el anunciante.
 */
import type {
  Corte,
  EstadoAsignacion,
  EstadoValidacion,
  Plataforma,
  TipoMedio,
} from "@/features/operacion/estados"

export type { Corte, EstadoAsignacion, EstadoValidacion, Plataforma, TipoMedio }

/** Corte estándar (el personalizado no entra al seguimiento ni al consolidado). */
export type CorteEstandar = Exclude<Corte, "PERSONALIZADO">

/** Corte de métricas aprobado por el equipo AMO (cifras normalizadas). */
export interface CorteAprobado {
  corte: CorteEstandar
  /** Instante del corte (ISO). */
  fechaCorte: string
  /** Alcance (TikTok: espectadores únicos). */
  alcance: number | null
  /** Impresiones (TikTok: reproducciones). */
  impresiones: number | null
  interacciones: number | null
  reproducciones: number | null
  clics: number | null
}

export interface PublicacionSeguimiento {
  id: string
  /** 1..n dentro de la asignación. */
  numero: number
  urlPost: string
  fechaPublicacion: string
  estadoValidacion: EstadoValidacion
  /** El medio subió la captura del panel (se firma bajo demanda). */
  conCaptura: boolean
  /** Cortes aprobados, del más antiguo al más reciente. */
  cortes: CorteAprobado[]
}

/** La cuenta con la que el medio aceptó (alcance declarado al aceptar). */
export interface CuentaSeguimiento {
  plataforma: Plataforma
  handle: string | null
  url: string | null
  seguidoresAlAceptar: number | null
  franja: string | null
}

/** Perfil público del medio que basta para la tarjeta. */
export interface MedioSeguimiento {
  id: string
  nombre: string
  /** "Pasto"; `null` si el medio no tiene municipio. */
  municipio: string | null
  /** "Nariño"; `null` en Bogotá (no se repite) o sin municipio. */
  departamento: string | null
  nivel: number
}

export interface AsignacionSeguimiento {
  id: string
  ofertaId: string
  oferta: string
  plataforma: Plataforma
  /** Cupo dentro de la oferta (varias asignaciones de un mismo medio). */
  slot: number
  estado: EstadoAsignacion
  estadoPrevioDisputa: EstadoAsignacion | null
  aceptadaAt: string
  contenidoDescargadoAt: string | null
  fechaLimitePublicacion: string | null
  publicadaAt: string | null
  evidenciaValidadaAt: string | null
  metricasCargadasAt: string | null
  verificadaAt: string | null
  vencidaAt: string | null
  enDisputaAt: string | null
  canceladaAt: string | null
  /** Valor bruto del cupo: lo que paga el anunciante (precio congelado). */
  montoBruto: number
  medio: MedioSeguimiento
  cuenta: CuentaSeguimiento
  publicaciones: PublicacionSeguimiento[]
}

export interface SeguimientoCampana {
  campanaId: string
  asignaciones: AsignacionSeguimiento[]
  /** Instante ISO de la consulta (la pestaña cuenta el minuto desde aquí). */
  consultadoAt: string
}

/** Cuenta verificada del medio en su perfil público. */
export interface CuentaPublica {
  plataforma: Plataforma
  handle: string | null
  url: string | null
  seguidores: number | null
  franja: string | null
  alcanceMediano: number | null
}

/**
 * Ficha pública de un medio participante (`medios_publico`): lo que cualquier
 * anunciante con negocios con él puede consultar. Sin documentos, contacto,
 * datos bancarios ni montos.
 */
export interface PerfilMedio {
  id: string
  nombre: string
  tipo: TipoMedio | null
  municipio: string | null
  departamento: string | null
  nivel: number
  /** Fracción 0–1; `null` sin historial suficiente. */
  tasaCumplimiento: number | null
  nCumplimiento: number
  publicacionesVerificadas: number
  cuentas: CuentaPublica[]
}
