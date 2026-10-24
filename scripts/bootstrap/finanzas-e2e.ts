/**
 * Plan de las fábricas E2E de la fase 5 (módulo puro): los medios y la
 * campaña de Finanzas, el periodo que se liquida, los números que se
 * registran (consecutivos, CUFE/CUDS, facturas del medio), la base donde se
 * puede restablecer y el resumen de la limpieza. Las escrituras están en
 * `fabricas-finanzas.ts`; los specs las usan desde `e2e/utilidades/finanzas.ts`.
 *
 * Las campañas llevan su propio prefijo («Finanzas E2E…»): ninguna otra
 * limpieza las toca, y `restablecerFinanzas` solo limpia estas y lo de los dos
 * medios de Finanzas.
 */
import { randomBytes } from "node:crypto"

import type { Database } from "../../src/types/database.types"
import { ENTORNOS } from "../db/entorno-db"
import { MEDIO_FACTURA_E2E, MEDIO_FINANZAS_E2E } from "./medios-e2e"
import { esProduccion } from "./produccion"
import { esBaseLocal } from "./validacion-e2e"

type Enums = Database["public"]["Enums"]
export type EstadoLiquidacion = Enums["liquidacion_estado"]
export type EstadoFactura = Enums["factura_estado"]

/** Campañas de las fábricas de Finanzas: las limpia `restablecerFinanzas`. */
export const PREFIJO_FINANZAS = "Finanzas E2E"

/** Motivo con el que la limpieza y las fábricas dejan constancia en la bitácora. */
export const MOTIVO_FINANZAS_E2E = "Pruebas E2E de Finanzas"

// ── Medios ───────────────────────────────────────────────────────────────────

/** Los dos medios de Finanzas, por la clave de su cuenta E2E. */
export type MedioFinanzas = "MEDIO_FINANZAS" | "MEDIO_FACTURA"

export interface DatosMedioFinanzas {
  id: string
  nombre: string
  /** Cuenta E2E de la persona del medio (`E2E_<cuenta>_EMAIL`). */
  cuenta: MedioFinanzas
  /** Está obligado a facturar: carga su factura en lugar de llevar documento soporte. */
  factura: boolean
}

export const MEDIOS_FINANZAS: Readonly<
  Record<MedioFinanzas, DatosMedioFinanzas>
> = {
  MEDIO_FINANZAS: {
    id: MEDIO_FINANZAS_E2E.id,
    nombre: MEDIO_FINANZAS_E2E.nombre,
    cuenta: "MEDIO_FINANZAS",
    factura: false,
  },
  MEDIO_FACTURA: {
    id: MEDIO_FACTURA_E2E.id,
    nombre: MEDIO_FACTURA_E2E.nombre,
    cuenta: "MEDIO_FACTURA",
    factura: true,
  },
}

export const CLAVES_MEDIOS_FINANZAS = Object.keys(
  MEDIOS_FINANZAS
) as MedioFinanzas[]

export function esMedioFinanzas(valor: string): valor is MedioFinanzas {
  return Object.hasOwn(MEDIOS_FINANZAS, valor)
}

// ── Etapas ───────────────────────────────────────────────────────────────────

/**
 * Hasta dónde llega una liquidación de las fábricas:
 *
 * - `BORRADOR`: la genera el ADMIN E2E (Finanzas puede aprobarla: D17).
 * - `APROBADA`: la aprueba Finanzas.
 * - `EMITIDA`: con el documento soporte emitido (medio que no factura) o la
 *   factura del medio registrada (medio que factura): lista para pagar.
 * - `PAGADA`: Finanzas registra el pago con su soporte.
 */
export const ETAPAS_LIQUIDACION = [
  "BORRADOR",
  "APROBADA",
  "EMITIDA",
  "PAGADA",
] as const

export type EtapaLiquidacion = (typeof ETAPAS_LIQUIDACION)[number]

export function llegaLiquidacion(
  hasta: EtapaLiquidacion,
  etapa: EtapaLiquidacion
): boolean {
  return ETAPAS_LIQUIDACION.indexOf(hasta) >= ETAPAS_LIQUIDACION.indexOf(etapa)
}

/** Estado de la liquidación al terminar la fábrica (`EMITIDA` sigue APROBADA). */
export function estadoTrasEtapa(hasta: EtapaLiquidacion): EstadoLiquidacion {
  switch (hasta) {
    case "BORRADOR":
      return "BORRADOR"
    case "APROBADA":
    case "EMITIDA":
      return "APROBADA"
    case "PAGADA":
      return "PAGADA"
  }
}

/** `BORRADOR`: lo genera Finanzas; `EMITIDA`: además, registrado como expedido. */
export const ETAPAS_FACTURA = ["BORRADOR", "EMITIDA"] as const
export type EtapaFactura = (typeof ETAPAS_FACTURA)[number]

// ── Fechas y periodo ─────────────────────────────────────────────────────────

const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const DIA_MS = 86_400_000

function aUtc(fecha: string): number {
  const partes = FECHA_ISO.exec(fecha)
  const instante = partes
    ? Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))
    : Number.NaN
  if (
    !partes ||
    new Date(instante).toISOString().slice(0, 10) !== fecha.slice(0, 10)
  ) {
    throw new RangeError(`Fecha inválida: ${fecha}`)
  }
  return instante
}

function deUtc(instante: number): string {
  return new Date(instante).toISOString().slice(0, 10)
}

/** `YYYY-MM-DD` más `dias` (pueden ser negativos), sin zonas horarias. */
export function sumarDias(fecha: string, dias: number): string {
  return deUtc(aUtc(fecha) + dias * DIA_MS)
}

export type Periodicidad = "SEMANAL" | "QUINCENAL" | "MENSUAL"

/** `liquidaciones.periodicidad` (cualquier otro valor se trata como QUINCENAL, como la BD). */
export function leerPeriodicidad(valor: unknown): Periodicidad {
  return valor === "SEMANAL" || valor === "MENSUAL" ? valor : "QUINCENAL"
}

/**
 * Primer día del periodo que contiene `fecha` (`private.periodo_liquidacion`):
 * SEMANAL, el lunes; QUINCENAL, el 1 o el 16; MENSUAL, el 1.
 */
export function inicioPeriodo(
  fecha: string,
  periodicidad: Periodicidad
): string {
  const instante = aUtc(fecha)
  const dia = Number(fecha.slice(8, 10))
  const mes = fecha.slice(0, 8)
  switch (periodicidad) {
    case "SEMANAL": {
      const semana = (new Date(instante).getUTCDay() + 6) % 7
      return deUtc(instante - semana * DIA_MS)
    }
    case "MENSUAL":
      return `${mes}01`
    case "QUINCENAL":
      return dia <= 15 ? `${mes}01` : `${mes}16`
  }
}

export interface PeriodoLiquidacion {
  inicio: string
  fin: string
}

/**
 * Periodo con que las fábricas liquidan lo verificado hoy: termina hoy (la BD
 * rechaza un periodo que no ha cerrado y lo verificado hoy solo entra si el
 * fin es hoy) y empieza al inicio del periodo vigente, o el día siguiente a la
 * última liquidación vigente del medio si es posterior (sin traslapes). `null`
 * si el medio ya tiene una liquidación vigente que cubre hoy: hay que anularla
 * o restablecer (`restablecerFinanzas`) antes de generar otra.
 */
export function periodoParaLiquidar({
  hoy,
  periodicidad,
  ultimaFin,
}: {
  hoy: string
  periodicidad: Periodicidad
  /** Fin de la última liquidación del medio que no está ANULADA (o `null`). */
  ultimaFin: string | null
}): PeriodoLiquidacion | null {
  if (ultimaFin !== null && ultimaFin >= hoy) return null
  const desdePeriodo = inicioPeriodo(hoy, periodicidad)
  const despuesDeLaUltima = ultimaFin === null ? null : sumarDias(ultimaFin, 1)
  const inicio =
    despuesDeLaUltima !== null && despuesDeLaUltima > desdePeriodo
      ? despuesDeLaUltima
      : desdePeriodo
  return { inicio, fin: hoy }
}

// ── Numeración ───────────────────────────────────────────────────────────────

/**
 * El siguiente número libre de una resolución para registrar un documento o
 * una factura expedidos fuera de la plataforma: después del consecutivo de la
 * resolución y de los ya registrados, dentro del rango. `null` si se agotó.
 */
export function siguienteConsecutivo({
  consecutivoActual,
  usados,
  rangoDesde,
  rangoHasta,
}: {
  consecutivoActual: number
  usados: readonly number[]
  rangoDesde: number
  rangoHasta: number
}): number | null {
  const siguiente =
    Math.max(consecutivoActual, rangoDesde - 1, ...usados.map(Number)) + 1
  return siguiente <= rangoHasta ? siguiente : null
}

/** 96 caracteres hexadecimales en minúscula: la forma de un CUFE, CUDS o CUDE. */
export function codigoDianE2E(
  azar: (bytes: number) => Buffer = randomBytes
): string {
  return azar(48).toString("hex")
}

export const FORMATO_CODIGO_DIAN = /^[0-9a-f]{96}$/

/**
 * Número de la factura que carga el medio que factura: cumple el patrón de
 * `registrar_factura_medio_srv` (mayúsculas, dígitos, espacios y guiones,
 * hasta 60).
 */
export function numeroFacturaMedioE2E(sufijo: string): string {
  return `FE E2E-${sufijo.toUpperCase().replace(/[^A-Z0-9]/g, "")}`.slice(0, 60)
}

export const FORMATO_NUMERO_FACTURA_MEDIO = /^[A-Z0-9][A-Z0-9 -]{0,59}$/

/** Referencia bancaria del pago que registra Finanzas. */
export function referenciaPagoE2E(sufijo: string): string {
  return `PAGO-E2E-${sufijo.toUpperCase()}`
}

// ── Archivo de pagos de la fábrica ───────────────────────────────────────────

export interface FilaDispersionE2E {
  tipoDocumento: string
  numeroDocumento: string
  titular: string
  metodo: string
  entidad: string
  tipoCuenta: string
  numeroCuenta: string
  valor: number
  referencia: string
  medio: string
}

function celdaCsv(valor: string | number): string {
  const texto = String(valor)
  // Sin fórmulas al abrirlo en una hoja de cálculo; comillas si hace falta.
  const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

/**
 * CSV genérico del archivo de pagos de una dispersión de las fábricas (la app
 * genera el suyo; aquí basta con que exista para registrar la dispersión).
 * Lleva datos bancarios FICTICIOS de los medios E2E: no se imprime.
 */
export function csvDispersionE2E(filas: readonly FilaDispersionE2E[]): string {
  const encabezado = [
    "tipo_documento",
    "numero_documento",
    "titular",
    "metodo",
    "entidad",
    "tipo_cuenta",
    "numero_cuenta",
    "valor",
    "referencia",
    "medio",
  ]
  const lineas = filas.map((fila) =>
    [
      fila.tipoDocumento,
      fila.numeroDocumento,
      fila.titular,
      fila.metodo,
      fila.entidad,
      fila.tipoCuenta,
      fila.numeroCuenta,
      Math.round(fila.valor),
      fila.referencia,
      fila.medio,
    ]
      .map(celdaCsv)
      .join(",")
  )
  return `${[encabezado.join(","), ...lineas].join("\n")}\n`
}

/**
 * `LIQ-{AAAAMMDD}-{12 últimos hex del id}`, como la referencia del archivo de
 * la app (la parte aleatoria del uuid v7: el inicio se repite en un corte).
 */
export function referenciaDispersionE2E(
  liquidacionId: string,
  hoy: string
): string {
  return `LIQ-${hoy.replace(/-/g, "")}-${liquidacionId.replace(/-/g, "").slice(-12)}`
}

// ── Base del restablecimiento ────────────────────────────────────────────────

export type BaseRestablecible = "local" | "develop"

/**
 * Dónde puede borrar `restablecerFinanzas` (por la conexión directa de
 * Postgres, en modo carga y purga): la pila local o develop. Producción y
 * cualquier otro proyecto, nunca.
 */
export function baseRestablecible(
  supabaseUrl: string | undefined
): BaseRestablecible {
  if (esProduccion(supabaseUrl)) {
    throw new RangeError(
      "restablecerFinanzasE2E nunca corre contra producción: borra liquidaciones, documentos y facturas."
    )
  }
  if (esBaseLocal(supabaseUrl)) return "local"
  if (
    supabaseUrl &&
    URL.canParse(supabaseUrl) &&
    new URL(supabaseUrl).hostname.toLowerCase() ===
      `${ENTORNOS.develop}.supabase.co`
  ) {
    return "develop"
  }
  throw new RangeError(
    "restablecerFinanzasE2E solo corre contra la base local o develop (borra por la conexión directa de Postgres)."
  )
}

// ── Resumen de la limpieza ───────────────────────────────────────────────────

export interface FinanzasRestablecidas {
  campanas: number
  asignaciones: number
  liquidaciones: number
  documentosSoporte: number
  dispersiones: number
  facturas: number
  pagos: number
  notasCredito: number
  notificaciones: number
  archivos: number
}

export function finanzasSinCambios(): FinanzasRestablecidas {
  return {
    campanas: 0,
    asignaciones: 0,
    liquidaciones: 0,
    documentosSoporte: 0,
    dispersiones: 0,
    facturas: 0,
    pagos: 0,
    notasCredito: 0,
    notificaciones: 0,
    archivos: 0,
  }
}

/** Resumen legible de `restablecerFinanzas` para el registro de una corrida. */
export function describirRestablecimientoFinanzas(
  resultado: FinanzasRestablecidas
): string {
  const etiquetas: [keyof FinanzasRestablecidas, string][] = [
    ["campanas", "campaña(s) «Finanzas E2E»"],
    ["asignaciones", "asignación(es)"],
    ["liquidaciones", "liquidación(es)"],
    ["documentosSoporte", "documento(s) soporte"],
    ["dispersiones", "archivo(s) de pagos"],
    ["facturas", "factura(s)"],
    ["pagos", "pago(s) de anunciante"],
    ["notasCredito", "nota(s) crédito"],
    ["notificaciones", "aviso(s)"],
    ["archivos", "archivo(s) en Storage"],
  ]
  const partes = etiquetas
    .filter(([clave]) => resultado[clave] > 0)
    .map(([clave, etiqueta]) => `${resultado[clave]} ${etiqueta}`)
  return partes.length > 0
    ? `borrados: ${partes.join(", ")}`
    : "sin pruebas de Finanzas anteriores"
}
