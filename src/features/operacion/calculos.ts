/**
 * Cálculos puros de las fichas de operación: indicadores de un conjunto de
 * asignaciones (con las mismas reglas de docs/kpis.md), serie mensual,
 * vigencia de la verificación de una cuenta, llenado de cupos y cartera.
 * Sin acceso a datos: las consultas entregan filas y aquí se resumen.
 */
import { differenceInCalendarDays } from "date-fns"
import { tz } from "@date-fns/tz"

import { serializarFecha, ZONA } from "@/lib/fechas"

import {
  consumeCupo,
  ESTADOS_CUMPLIDOS,
  ESTADOS_POR_GRUPO,
  type EstadoAsignacion,
  type EstadoFactura,
  GRUPOS_ASIGNACION,
  type GrupoAsignacion,
} from "./estados"

const enBogota = { in: tz(ZONA) }

export interface AsignacionParaIndicadores {
  estado: EstadoAsignacion
  estadoPrevioDisputa: EstadoAsignacion | null
  montoBruto: number | null
  /** Valor para el medio (`asignacion_montos`); `null` si no es visible. */
  montoMedio: number | null
  aceptadaAt: string | null
  verificadaAt: string | null
}

export interface IndicadoresAsignaciones {
  total: number
  porGrupo: Readonly<Record<GrupoAsignacion, number>>
  /** Σ bruto de las cumplidas (docs/kpis.md §1.2, GMV oficial). */
  gmvVerificado: number
  /** Σ bruto de las que aún consumen cupo (§1.1, "comprometido vigente"). */
  gmvComprometido: number
  /** Σ valor para el medio aceptado este año y que consume cupo (tope por nivel). */
  consumidoAnio: number
  /** Ticket promedio de las cumplidas; `null` sin cumplidas. */
  ticketPromedio: number | null
}

function anioBogota(instante: string | Date): string {
  return serializarFecha(new Date(instante)).slice(0, 4)
}

export function indicadoresAsignaciones(
  asignaciones: readonly AsignacionParaIndicadores[],
  ahora: Date = new Date()
): IndicadoresAsignaciones {
  const porGrupo = Object.fromEntries(
    GRUPOS_ASIGNACION.map((grupo) => [grupo, 0])
  ) as Record<GrupoAsignacion, number>
  let gmvVerificado = 0
  let cumplidas = 0
  let gmvComprometido = 0
  let consumidoAnio = 0
  const anioActual = anioBogota(ahora)

  for (const asignacion of asignaciones) {
    const grupo = GRUPOS_ASIGNACION.find((g) =>
      ESTADOS_POR_GRUPO[g].includes(asignacion.estado)
    )
    if (grupo) porGrupo[grupo] += 1
    const bruto = asignacion.montoBruto ?? 0
    if (ESTADOS_CUMPLIDOS.includes(asignacion.estado)) {
      gmvVerificado += bruto
      cumplidas += 1
    }
    const vigente =
      asignacion.aceptadaAt !== null &&
      consumeCupo(asignacion.estado, asignacion.estadoPrevioDisputa)
    if (vigente) {
      gmvComprometido += bruto
      if (anioBogota(asignacion.aceptadaAt as string) === anioActual) {
        consumidoAnio += asignacion.montoMedio ?? 0
      }
    }
  }

  return {
    total: asignaciones.length,
    porGrupo,
    gmvVerificado,
    gmvComprometido,
    consumidoAnio,
    ticketPromedio: cumplidas > 0 ? gmvVerificado / cumplidas : null,
  }
}

// ── Serie mensual ────────────────────────────────────────────────────────────

export interface PuntoMensual {
  /** `YYYY-MM` en hora de Bogotá. */
  periodo: string
  /** "sept 2026". */
  etiqueta: string
  /** Asignaciones aceptadas en el mes. */
  aceptadas: number
  /** GMV verificado en el mes (ancla `verificada_at`). */
  gmvVerificado: number
}

const mesCorto = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  month: "short",
  year: "numeric",
})

function claveMes(instante: string | Date): string {
  return serializarFecha(new Date(instante)).slice(0, 7)
}

/** Primer día de los últimos `meses` meses de Bogotá, del más antiguo al actual. */
function mesesHasta(
  ahora: Date,
  meses: number
): { clave: string; fecha: Date }[] {
  const [anio, mes] = claveMes(ahora).split("-").map(Number)
  return Array.from({ length: meses }, (_, indice) => {
    const desplazamiento = meses - 1 - indice
    const fecha = new Date(Date.UTC(anio, mes - 1 - desplazamiento, 15))
    return { clave: claveMes(fecha), fecha }
  })
}

/**
 * Aceptadas y GMV verificado por mes (los últimos `meses`, incluidos los
 * vacíos), para el gráfico de la ficha del medio y del anunciante.
 */
export function serieMensual(
  asignaciones: readonly AsignacionParaIndicadores[],
  meses = 12,
  ahora: Date = new Date()
): PuntoMensual[] {
  const puntos = mesesHasta(ahora, meses).map(({ clave, fecha }) => ({
    periodo: clave,
    etiqueta: mesCorto.format(fecha).replace(" de ", " "),
    aceptadas: 0,
    gmvVerificado: 0,
  }))
  const porClave = new Map(puntos.map((punto) => [punto.periodo, punto]))

  for (const asignacion of asignaciones) {
    if (asignacion.aceptadaAt) {
      const punto = porClave.get(claveMes(asignacion.aceptadaAt))
      if (punto) punto.aceptadas += 1
    }
    if (
      asignacion.verificadaAt &&
      ESTADOS_CUMPLIDOS.includes(asignacion.estado)
    ) {
      const punto = porClave.get(claveMes(asignacion.verificadaAt))
      if (punto) punto.gmvVerificado += asignacion.montoBruto ?? 0
    }
  }
  return puntos
}

/** ¿Hay algo que dibujar en la serie? */
export function serieConDatos(puntos: readonly PuntoMensual[]): boolean {
  return puntos.some((punto) => punto.aceptadas > 0 || punto.gmvVerificado > 0)
}

// ── Verificación de cuentas sociales ─────────────────────────────────────────

export type VigenciaVerificacion =
  "sin_verificar" | "vigente" | "por_vencer" | "en_gracia" | "vencida"

export interface ResultadoVigencia {
  vigencia: VigenciaVerificacion
  /** Fin de la vigencia (sin la gracia); `null` sin verificación. */
  venceAt: Date | null
  /** Último día en que la cuenta sigue elegible (con la gracia). */
  elegibleHasta: Date | null
}

/** Con esta antelación (días) una verificación vigente se marca "por vencer". */
export const DIAS_AVISO_VENCIMIENTO = 5

const MS_DIA = 86_400_000

/**
 * Vigencia de la verificación de una cuenta (`medios.reverificacion_dias` +
 * `medios.reverificacion_gracia_dias`, igual que `private.cuenta_vigente`).
 */
export function vigenciaVerificacion(
  ultimaVerificacionAt: string | null,
  diasVigencia: number,
  diasGracia: number,
  ahora: Date = new Date()
): ResultadoVigencia {
  if (!ultimaVerificacionAt) {
    return { vigencia: "sin_verificar", venceAt: null, elegibleHasta: null }
  }
  const inicio = new Date(ultimaVerificacionAt).getTime()
  const venceAt = new Date(inicio + diasVigencia * MS_DIA)
  const elegibleHasta = new Date(inicio + (diasVigencia + diasGracia) * MS_DIA)
  const instante = ahora.getTime()

  let vigencia: VigenciaVerificacion
  if (instante >= elegibleHasta.getTime()) vigencia = "vencida"
  else if (instante >= venceAt.getTime()) vigencia = "en_gracia"
  else if (venceAt.getTime() - instante <= DIAS_AVISO_VENCIMIENTO * MS_DIA)
    vigencia = "por_vencer"
  else vigencia = "vigente"

  return { vigencia, venceAt, elegibleHasta }
}

// ── Cupos y presupuesto ──────────────────────────────────────────────────────

/** Proporción 0–1 acotada; `null` si no hay base. */
export function proporcion(parte: number, total: number): number | null {
  if (!Number.isFinite(parte) || !Number.isFinite(total) || total <= 0) {
    return null
  }
  return Math.min(1, Math.max(0, parte / total))
}

export interface CupoFranja {
  franjaId: string
  clave: string
  nombre: string
  orden: number
  totales: number
  ocupados: number
}

export interface ResumenCupos {
  franjas: CupoFranja[]
  totales: number
  ocupados: number
  libres: number
  llenado: number | null
}

export function resumirCupos(cupos: readonly CupoFranja[]): ResumenCupos {
  const franjas = [...cupos].sort((a, b) => a.orden - b.orden)
  const totales = franjas.reduce((suma, cupo) => suma + cupo.totales, 0)
  const ocupados = franjas.reduce((suma, cupo) => suma + cupo.ocupados, 0)
  return {
    franjas,
    totales,
    ocupados,
    libres: Math.max(0, totales - ocupados),
    llenado: proporcion(ocupados, totales),
  }
}

// ── Cartera ──────────────────────────────────────────────────────────────────

export interface FacturaParaCartera {
  estado: EstadoFactura
  total: number | null
  pagado: number
  /** `YYYY-MM-DD`. */
  fechaVencimiento: string | null
}

export const TRAMOS_CARTERA = ["0_30", "31_60", "61_90", "90_mas"] as const

export type TramoCartera = (typeof TRAMOS_CARTERA)[number]

export const ETIQUETAS_TRAMO: Readonly<Record<TramoCartera, string>> = {
  "0_30": "0–30 días",
  "31_60": "31–60 días",
  "61_90": "61–90 días",
  "90_mas": "Más de 90 días",
}

export interface ResumenCartera {
  facturado: number
  pagado: number
  saldo: number
  porTramo: Readonly<Record<TramoCartera, number>>
  facturasVencidas: number
}

function tramoDeMora(diasMora: number | null): TramoCartera {
  if (diasMora === null || diasMora <= 30) return "0_30"
  if (diasMora <= 60) return "31_60"
  if (diasMora <= 90) return "61_90"
  return "90_mas"
}

/**
 * Cartera al día de hoy con la misma regla que `reporte_cartera`: facturas
 * emitidas (no borrador ni anuladas), saldo = total − pagado y antigüedad por
 * días desde el vencimiento (0–30 incluye lo que aún no vence).
 */
export function resumirCartera(
  facturas: readonly FacturaParaCartera[],
  ahora: Date = new Date()
): ResumenCartera {
  const porTramo: Record<TramoCartera, number> = {
    "0_30": 0,
    "31_60": 0,
    "61_90": 0,
    "90_mas": 0,
  }
  let facturado = 0
  let pagado = 0
  let saldo = 0
  let facturasVencidas = 0
  for (const factura of facturas) {
    if (factura.estado === "BORRADOR" || factura.estado === "ANULADA") continue
    const total = factura.total ?? 0
    const pendiente = Math.max(0, total - factura.pagado)
    facturado += total
    pagado += factura.pagado
    saldo += pendiente
    const mora = factura.fechaVencimiento
      ? -diasHasta(factura.fechaVencimiento, ahora)
      : null
    porTramo[tramoDeMora(mora)] += pendiente
    if (pendiente > 0 && mora !== null && mora > 0) facturasVencidas += 1
  }
  return { facturado, pagado, saldo, porTramo, facturasVencidas }
}

// ── Vencimientos (`date`) ────────────────────────────────────────────────────

/**
 * Días de calendario de Bogotá que faltan para una fecha `YYYY-MM-DD`: 0 = es
 * hoy (sigue vigente hasta el final del día), negativo = ya pasó.
 */
export function diasHasta(dia: string, ahora: Date = new Date()): number {
  return differenceInCalendarDays(
    new Date(`${dia}T12:00:00-05:00`),
    ahora,
    enBogota
  )
}

export type AvisoVencimiento = "vencido" | "hoy" | "manana" | "pronto"

/** Con esta anticipación (días) se avisa el vencimiento de un documento. */
export const DIAS_AVISO_DOCUMENTO = 30

/** ¿El documento ya venció o está por vencer? `null` si aún falta más del aviso. */
export function avisoVencimiento(
  venceAt: string | null,
  ahora: Date = new Date()
): { aviso: AvisoVencimiento; dias: number } | null {
  if (!venceAt) return null
  const dias = diasHasta(venceAt, ahora)
  if (dias < 0) return { aviso: "vencido", dias }
  if (dias === 0) return { aviso: "hoy", dias }
  if (dias === 1) return { aviso: "manana", dias }
  return dias <= DIAS_AVISO_DOCUMENTO ? { aviso: "pronto", dias } : null
}

// ── Tope anual por nivel ─────────────────────────────────────────────────────

export type SituacionTope = "sin_tope" | "normal" | "alerta" | "bloqueo"

/**
 * Cuánto del tope anual del nivel lleva consumido el medio y si ya cruzó el
 * umbral de alerta o el de bloqueo (fracciones de `niveles_verificacion`).
 */
export function situacionTope(tope: {
  tope: number | null
  consumido: number
  alerta: number
  bloqueo: number
}): { fraccion: number | null; situacion: SituacionTope } {
  if (tope.tope === null || tope.tope <= 0) {
    return { fraccion: null, situacion: "sin_tope" }
  }
  const fraccion = Math.max(0, tope.consumido / tope.tope)
  const situacion: SituacionTope =
    fraccion >= tope.bloqueo
      ? "bloqueo"
      : fraccion >= tope.alerta
        ? "alerta"
        : "normal"
  return { fraccion, situacion }
}
