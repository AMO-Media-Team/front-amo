/**
 * El tablero de «Mis campañas» (MED-011, módulo puro): cada asignación como
 * tarjeta con lo que sigue, repartida en su segmento y ordenada por urgencia.
 * Solo lleva al navegador lo que pinta la tarjeta.
 */
import {
  SEGMENTOS_MIS_CAMPANAS,
  type SegmentoMisCampanas,
  segmentoDe,
} from "./estados"
import { siguientePaso, vencimientoDelPaso } from "./siguiente-accion"
import type {
  AccionMedio,
  AsignacionMedio,
  EstadoAsignacion,
  PasoMedio,
  Plataforma,
} from "./tipos"

/** Lo más que devuelve `mis_asignaciones_medio` por llamada (el tablero). */
export const LIMITE_TABLERO = 200

export interface TarjetaAsignacion {
  id: string
  estado: EstadoAsignacion
  segmento: SegmentoMisCampanas
  ofertaTitulo: string
  /** Marca de la campaña o, sin ella, el anunciante. */
  marca: string | null
  plataforma: Plataforma
  formatoNombre: string
  handle: string | null
  /** Lo que recibe (antes de retenciones). */
  montoMedio: number | null
  publicaciones: number
  paso: PasoMedio
  /** Último cambio registrado: ordena lo que ya no tiene plazo. */
  ultimaActividadAt: string
}

export type TableroMisCampanas = Readonly<
  Record<SegmentoMisCampanas, readonly TarjetaAsignacion[]>
>

const MARCAS_DE_TIEMPO = [
  "creadaAt",
  "aceptadaAt",
  "contenidoDescargadoAt",
  "publicadaAt",
  "evidenciaValidadaAt",
  "metricasCargadasAt",
  "verificadaAt",
  "liquidadaAt",
  "pagadaAt",
  "rechazadaAt",
  "vencidaAt",
  "enDisputaAt",
  "canceladaAt",
] as const satisfies readonly (keyof AsignacionMedio)[]

function milisegundos(iso: string | null | undefined): number {
  const valor = iso ? new Date(iso).getTime() : Number.NaN
  return Number.isFinite(valor) ? valor : Number.NaN
}

/** El más reciente de los instantes de transición de la asignación. */
export function ultimaActividad(asignacion: AsignacionMedio): string {
  let ultima = asignacion.creadaAt
  for (const columna of MARCAS_DE_TIEMPO) {
    const valor = asignacion[columna]
    if (valor && milisegundos(valor) > milisegundos(ultima)) ultima = valor
  }
  return ultima
}

export function tarjetaDe(
  asignacion: AsignacionMedio,
  acciones: readonly AccionMedio[]
): TarjetaAsignacion {
  return {
    id: asignacion.id,
    estado: asignacion.estado,
    segmento: segmentoDe(asignacion.estado, asignacion.estadoPrevioDisputa),
    ofertaTitulo: asignacion.ofertaTitulo,
    marca: asignacion.marca ?? asignacion.anuncianteNombre,
    plataforma: asignacion.plataforma,
    formatoNombre: asignacion.formatoNombre,
    handle: asignacion.handle,
    montoMedio: asignacion.pago.montoMedio,
    publicaciones: asignacion.publicaciones,
    paso: siguientePaso(asignacion, acciones),
    ultimaActividadAt: ultimaActividad(asignacion),
  }
}

/**
 * Plazo que ordena la tarjeta: el de su acción, o el de reclamar una vencida
 * mientras siga abierto. Sin plazo vigente, `NaN`.
 */
function plazoVigente(tarjeta: TarjetaAsignacion, ahora: Date): number {
  const plazo = milisegundos(vencimientoDelPaso(tarjeta.paso))
  if (tarjeta.paso.tipo === "reclamo" && !(plazo > ahora.getTime())) {
    return Number.NaN
  }
  return plazo
}

/**
 * Lo que tiene plazo primero (el más cercano arriba, también los ya
 * vencidos: siguen pendientes); después, lo más reciente.
 */
export function compararTarjetas(
  a: TarjetaAsignacion,
  b: TarjetaAsignacion,
  ahora: Date
): number {
  const plazoA = plazoVigente(a, ahora)
  const plazoB = plazoVigente(b, ahora)
  const conPlazoA = Number.isFinite(plazoA)
  const conPlazoB = Number.isFinite(plazoB)
  if (conPlazoA !== conPlazoB) return conPlazoA ? -1 : 1
  if (conPlazoA && conPlazoB && plazoA !== plazoB) return plazoA - plazoB
  return (
    milisegundos(b.ultimaActividadAt) - milisegundos(a.ultimaActividadAt) ||
    b.id.localeCompare(a.id)
  )
}

/** Las tarjetas de cada segmento, ya ordenadas. */
export function armarTablero(
  asignaciones: readonly AsignacionMedio[],
  acciones: readonly AccionMedio[],
  ahora: Date
): TableroMisCampanas {
  const tablero = Object.fromEntries(
    SEGMENTOS_MIS_CAMPANAS.map((segmento) => [
      segmento,
      [] as TarjetaAsignacion[],
    ])
  ) as Record<SegmentoMisCampanas, TarjetaAsignacion[]>
  for (const asignacion of asignaciones) {
    const tarjeta = tarjetaDe(asignacion, acciones)
    tablero[tarjeta.segmento].push(tarjeta)
  }
  for (const segmento of SEGMENTOS_MIS_CAMPANAS) {
    tablero[segmento].sort((a, b) => compararTarjetas(a, b, ahora))
  }
  return tablero
}

export function conteoDelTablero(
  tablero: TableroMisCampanas
): Record<SegmentoMisCampanas, number> {
  return Object.fromEntries(
    SEGMENTOS_MIS_CAMPANAS.map((segmento) => [
      segmento,
      tablero[segmento].length,
    ])
  ) as Record<SegmentoMisCampanas, number>
}
