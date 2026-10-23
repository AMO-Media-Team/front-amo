/**
 * Tipos del marketplace del medio (MED-008, MED-009, MED-010) que las
 * consultas entregan a la interfaz. Son DTO planos (serializables en RSC):
 * solo lo que el medio puede ver de una oferta y lo que recibiría con cada
 * una de SUS cuentas; nunca datos de otros medios ni el presupuesto del
 * anunciante.
 */
import type {
  Corte,
  EstadoAsignacion,
  EstadoOferta,
  Plataforma,
} from "@/features/operacion/estados"
import type { ResultadoExito, ResultadoFallo } from "@/lib/result"

/** Una cuenta del medio que cabe en un cupo libre de la oferta (listado). */
export interface CuentaEnOferta {
  cuentaSocialId: string
  handle: string
  /** Franja de seguidores de la cuenta ("F1"). */
  franjaClave: string
  /** Cupos que quedan en su franja. */
  cuposRestantes: number
  /** Lo que recibe el medio con esa cuenta; `null` si no hay tarifa vigente. */
  montoMedio: number | null
}

/** Datos comunes de una oferta que ve el medio (tarjeta y ficha). */
export interface OfertaBaseMedio {
  id: string
  titulo: string
  /** Nombre del formato ("Reel", "Post de feed"…). */
  formato: string
  plataforma: Plataforma
  publicacionesPorMedio: number
  permiteMultiplesCupos: boolean
  ventanaInicio: string
  ventanaFin: string
  fechaLimiteAceptacion: string
  permanenciaDias: number
  exclusividadDias: number | null
  cortes: Corte[]
  /** Marca o producto que se anuncia (de la campaña). */
  marca: string
  /** Nombre comercial del anunciante. */
  anunciante: string
}

/** Una tarjeta del marketplace (`marketplace_medio`). */
export interface OfertaMarketplace extends OfertaBaseMedio {
  anuncianteId: string
  /** El medio marcó «No me interesa». */
  rechazada: boolean
  /** El medio ya abrió su detalle (sin abrir: «Nueva»). */
  vista: boolean
  /** El mayor pago entre sus cuentas; `null` si ninguna tiene tarifa. */
  pagoMaximo: number | null
  /** Sus cuentas que caben en un cupo, de la que más paga a la que menos. */
  cuentas: CuentaEnOferta[]
}

export interface PaginaMarketplace {
  filas: OfertaMarketplace[]
  /** Ofertas que cumplen los filtros (todas las páginas). */
  total: number
  /** Página que se muestra (1 = la primera). */
  pagina: number
}

/**
 * Una opción de los filtros por sector o anunciante: los que tienen ofertas
 * que el medio puede aceptar hoy (`marketplace_facetas`).
 */
export interface OpcionFaceta {
  id: string
  nombre: string
}

/** Opciones de los filtros por sector y anunciante, cada grupo por nombre. */
export interface FacetasMarketplace {
  sectores: OpcionFaceta[]
  anunciantes: OpcionFaceta[]
}

/** Razón por la que el medio no ve ofertas (`mi_elegibilidad_marketplace`). */
export const MOTIVOS_ELEGIBILIDAD = [
  "OK",
  "SIN_MEDIO",
  "MEDIO_PENDIENTE",
  "MEDIO_RECHAZADO",
  "MEDIO_SUSPENDIDO",
  "NIVEL_0",
  "SIN_CUENTA_VIGENTE",
  "BAJO_UMBRAL",
] as const

export type MotivoElegibilidad = (typeof MOTIVOS_ELEGIBILIDAD)[number]

export interface Elegibilidad {
  motivo: MotivoElegibilidad
  /** Explicación lista para mostrar (la escribe la BD); `null` con `OK`. */
  detalle: string | null
}

/** Desglose del precio (solo con `comision.visible_para_medio`). */
export interface DesglosePrecio {
  /** Tarifa base de la franja y el formato, por publicación. */
  tarifaBase: number | null
  montoBruto: number
  /** Fracción (0,2 = 20 %). */
  porcentajeComision: number
  montoComision: number
}

/** Lo que recibiría el medio con una cuenta (`cotizar_oferta`). */
export interface Cotizacion {
  franjaClave: string
  seguidores: number
  publicaciones: number
  multiplicadorCalidad: number
  multiplicadorGeografico: number
  multiplicadorExclusividad: number
  /** Lo que recibe el medio antes de retenciones. */
  montoMedio: number
  /** `null` si la plataforma no le muestra la comisión al medio. */
  desglose: DesglosePrecio | null
}

/** Una cuenta del medio en la ficha de la oferta, con su cotización. */
export interface CuentaCotizada {
  cuentaSocialId: string
  handle: string
  franjaClave: string
  cuposRestantes: number
  /** `null` si no se pudo cotizar (p. ej. sin tarifa vigente): ver `aviso`. */
  cotizacion: Cotizacion | null
  aviso: string | null
  /**
   * Con el pago de esta cuenta superaría la participación máxima de un medio
   * en la campaña (`impedimentos_aceptar`): la reserva respondería
   * `AMO_TOPE_MEDIO`. `false` si no se pudo leer.
   */
  superaTopeCampana: boolean
}

/** Una asignación del medio en esta oferta que sigue en pie. */
export interface AsignacionEnOferta {
  id: string
  estado: EstadoAsignacion
  handle: string | null
  aceptadaAt: string | null
  montoMedio: number | null
}

/** Todo lo que muestra la ficha de la oferta para el medio. */
export interface DetalleOfertaMedio extends OfertaBaseMedio {
  estado: EstadoOferta
  instrucciones: string | null
  restricciones: string | null
  /** Sus cuentas de la plataforma que cumplen los requisitos de la oferta. */
  cuentas: CuentaCotizada[]
  /** Sus asignaciones en pie en esta oferta (la más reciente primero). */
  asignaciones: AsignacionEnOferta[]
  /**
   * Choca con la exclusividad de otra campaña del mismo sector
   * (`impedimentos_aceptar`): la reserva respondería `AMO_EXCLUSIVIDAD` con
   * cualquier cuenta. `false` si no se pudo leer.
   */
  chocaExclusividad: boolean
}

// ── Resultados de las acciones ───────────────────────────────────────────────

/** Pantalla a la que conviene ir para resolver un error. */
export interface EnlaceError {
  texto: string
  href: string
}

/** Fallo al aceptar: además del mensaje, qué hacer con la clave y la ficha. */
export interface FalloAceptar extends ResultadoFallo {
  /** Código `AMO_*` de la BD (`null`: fallo inesperado o de validación). */
  codigo: string | null
  /** Título breve en voz del medio («No quedan cupos en tu franja»). */
  titulo: string
  /**
   * Respuesta firme de la BD: el próximo intento usa una clave de
   * idempotencia nueva. Si es `false` (fallo inesperado) se reintenta con la
   * misma, por si la reserva sí se hizo.
   */
  definitivo: boolean
  /** Ya no se puede aceptar ahora: la ficha se actualiza al cerrar el aviso. */
  bloquea: boolean
  enlace: EnlaceError | null
}

/** Aceptación hecha: la asignación y el pago que quedó congelado. */
export interface Aceptada {
  asignacionId: string
  /** Lo que recibe el medio, congelado al reservar; `null` si no llegó. */
  montoMedio: number | null
}

export type ResultadoAceptar = ResultadoExito<Aceptada> | FalloAceptar
