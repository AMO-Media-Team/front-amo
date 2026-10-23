/**
 * Tipos del asistente de oferta (ANU-004…009): lo que el servidor entrega a la
 * página (campaña, catálogo, configuración pública y ofertas en curso) y lo
 * que devuelven sus acciones. Módulo puro.
 */
import type { FormatoOferta, Plataforma } from "@/features/creativos/tipos"
import type { Database } from "@/types/database.types"

import type { PasoOferta } from "./pasos"

type Enums = Database["public"]["Enums"]

export type { Plataforma }
export type EstadoOferta = Enums["oferta_estado"]
export type EstadoCampana = Enums["campana_estado"]
export type EstadoAnunciante = Enums["anunciante_estado"]
export type Corte = Enums["corte_metrica"]
/** Cortes que una oferta puede exigir (`PERSONALIZADO` no: `ofertas_cortes_chk`). */
export type CorteOferta = Exclude<Corte, "PERSONALIZADO">

/** Formato activo de una plataforma, con sus requisitos ya interpretados. */
export interface FormatoAsistente extends FormatoOferta {
  orden: number
}

/** Franja de seguidores activa (F1, F2…). */
export interface FranjaAsistente {
  id: string
  clave: string
  /** «30.000 – 60.000». */
  nombre: string
  seguidoresMin: number
  seguidoresMax: number | null
}

export interface CategoriaAsistente {
  id: string
  nombre: string
}

export interface CatalogoAsistente {
  formatos: readonly FormatoAsistente[]
  franjas: readonly FranjaAsistente[]
  categorias: readonly CategoriaAsistente[]
}

/** Configuración pública que el asistente aplica y explica (`configuracion.es_publica`). */
export interface ConfiguracionAsistente {
  anticipacionHoras: number
  /** Cupos mínimos de una oferta (`ofertas.minimo_medios`). */
  minimoMedios: number
  /**
   * Medios mínimos por franja para que el estimador diga cuántos son y dé
   * cifras (y exclusiones mínimas para que cuenten al estimar).
   */
  estimadorMinimo: number
  /** Fracción (0,15 = 15 %). */
  topePorcentaje: number
  /** Multiplicador (1,25 = 25 % más). */
  recargoExclusividad: number
  cortesPorDefecto: readonly CorteOferta[]
  umbralSeguidores: number
  /** Tope de peso de un archivo de creativo en la plataforma (MB). */
  maximoCreativoMb: number
}

export interface CampanaAsistente {
  id: string
  nombre: string
  estado: EstadoCampana
  /** 'YYYY-MM-DD' (día de Bogotá). */
  fechaInicio: string
  fechaFin: string
  presupuestoTotal: number
  /** Lo que queda para ofertas nuevas (`disponible_campana`); null si no se pudo leer. */
  disponible: number | null
}

/** Medio excluido de una oferta: solo su nombre público y municipio (sin cifras). */
export interface MedioExcluido {
  id: string
  nombre: string
  municipio: string | null
}

/** Oferta ya creada por el asistente (un borrador por formato). */
export interface OfertaEnCurso {
  ofertaId: string
  formatoId: string
  estado: EstadoOferta
  /**
   * Versión de la fila (`updated_at`) que vio el asistente: al guardar, si
   * otra persona la cambió entretanto, no se pisa su cambio.
   */
  actualizadaAt: string
}

/** Oferta leída para continuar o editar (el servidor arma los valores del formulario con ella). */
export interface OfertaGuardadaBd extends OfertaEnCurso {
  titulo: string
  publicacionesPorMedio: number
  presupuestoMaximo: number
  topePorcentaje: number
  departamentos: string[]
  municipios: string[]
  categorias: string[]
  seguidoresMinimos: number | null
  mediosExcluidos: string[]
  ventanaInicio: string
  ventanaFin: string
  fechaLimite: string
  permanenciaDias: number
  exclusividadDias: number | null
  cortes: CorteOferta[]
  instrucciones: string | null
  restricciones: string | null
  comentarioModeracion: string | null
  devueltaAt: string | null
  cupos: { franjaId: string; cantidad: number }[]
}

/**
 * Una franja del estimador (`estimar_oferta`). Con menos medios de los
 * configurados (`ofertas.estimador_n_minimo`) la BD no dice cuántos son ni da
 * cifras: `mediosElegibles` null = «Menos de N medios»; el resto null =
 * «Sin estimación».
 */
export interface EstimacionFranja {
  franjaId: string
  mediosElegibles: number | null
  precioMediano: number | null
  inversionEstimada: number | null
  alcanceMediano: number | null
}

/** Una oferta que la BD no dejó pasar a revisión y el paso que lo resuelve. */
export interface RechazoEnvio {
  ofertaId: string
  paso: PasoOferta
  mensaje: string
}

export interface ResultadoEnvio {
  ofertas: OfertaEnCurso[]
  /** Ofertas que pasaron a EN_REVISION en este envío. */
  enviadas: string[]
  rechazos: RechazoEnvio[]
}
