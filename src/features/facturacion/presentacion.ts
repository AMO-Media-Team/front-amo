/**
 * Presentación de la facturación al anunciante (módulo puro, LIQ-008): textos
 * del esquema y del medio de pago, qué admite cada estado, vencimiento en voz
 * de la persona, efecto de un pago o de una nota crédito antes de registrarlo,
 * numeración sugerida y lo por facturar agrupado por anunciante.
 */
import { diasHasta } from "@/features/operacion/calculos"
import type { Tono } from "@/features/operacion/estados"
import { formatearVigencia, instanteDeDia } from "@/features/operacion/formato"
import { serializarFecha } from "@/lib/fechas"
import { type EstiloFecha, formatearFecha, formatearNumero } from "@/lib/format"

import type {
  EsquemaFacturacion,
  EstadoAsignacion,
  EstadoFactura,
  GrupoPorFacturar,
  MedioPago,
  PendienteFacturacion,
  ResolucionActiva,
} from "./tipos"

// ── Catálogos ────────────────────────────────────────────────────────────────

export const ESQUEMAS: Readonly<
  Record<EsquemaFacturacion, { etiqueta: string; descripcion: string }>
> = {
  COMPRA_REVENTA: {
    etiqueta: "Compra y reventa",
    descripcion:
      "AMO compra y revende la pauta: el IVA se calcula sobre el valor total.",
  },
  MANDATO: {
    etiqueta: "Mandato",
    descripcion:
      "El IVA se calcula solo sobre la comisión de AMO; el valor de los medios va como ingreso para terceros.",
  },
}

export function esEsquema(valor: string): valor is EsquemaFacturacion {
  return valor === "COMPRA_REVENTA" || valor === "MANDATO"
}

export const ETIQUETAS_MEDIO_PAGO: Readonly<Record<MedioPago, string>> = {
  TRANSFERENCIA: "Transferencia",
  PSE: "PSE",
  CONSIGNACION: "Consignación",
  CHEQUE: "Cheque",
  OTRO: "Otro",
}

export function etiquetaMedioPago(valor: string): string {
  return (
    (ETIQUETAS_MEDIO_PAGO as Readonly<Record<string, string>>)[valor] ?? valor
  )
}

// ── Qué admite cada estado ──────────────────────────────────────────────────

/** Estados de una asignación que se facturan (`generar_factura_srv`). */
export const ESTADOS_FACTURABLES: readonly EstadoAsignacion[] = [
  "VERIFICADA",
  "LIQUIDADA",
  "PAGADA",
]

/** ¿La asignación sigue siendo facturable? Si no (disputa, cancelación), pide nota crédito. */
export function sigueFacturable(estado: EstadoAsignacion): boolean {
  return ESTADOS_FACTURABLES.includes(estado)
}

/** Expedidas con saldo: admiten pagos y notas crédito. */
export const ESTADOS_CON_SALDO: readonly EstadoFactura[] = [
  "EMITIDA",
  "PAGADA_PARCIAL",
  "VENCIDA",
]

export function admiteCobro(estado: EstadoFactura): boolean {
  return ESTADOS_CON_SALDO.includes(estado)
}

/** «Consolidada» cuando cubre todas las campañas del anunciante. */
export function alcanceFactura(campana: string | null): string {
  return campana ?? "Consolidada"
}

/** El número (`FE1234`) o «Borrador» mientras no se expida. */
export function tituloFactura(numero: string | null): string {
  return numero ?? "Borrador"
}

// ── Fechas de calendario (`date`) ───────────────────────────────────────────

/** Una columna `date` con el estilo pedido, sin correrse al día anterior. */
export function formatearDia(
  dia: string | null,
  estilo: EstiloFecha = "medio"
): string {
  return dia ? formatearFecha(instanteDeDia(dia), estilo) : "—"
}

/** «1 de oct – 15 de oct de 2026»; «—» si falta un extremo. */
export function describirPeriodo(
  desde: string | null,
  hasta: string | null
): string {
  return desde && hasta ? formatearVigencia(desde, hasta) : "—"
}

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/

/** `YYYY-MM-DD` + días, en aritmética de calendario (sin zona horaria). */
export function sumarDias(dia: string, dias: number): string {
  const partes = DIA.exec(dia)
  if (!partes) return dia
  const [, anio, mes, d] = partes
  const fecha = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(d)))
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

/** Días de calendario de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  const a = DIA.exec(desde)
  const b = DIA.exec(hasta)
  if (!a || !b) return 0
  const inicio = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]))
  const fin = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]))
  return Math.round((fin - inicio) / 86_400_000)
}

/** Vencimiento por defecto: la emisión más los días configurados. */
export function vencimientoSugerido(
  emision: string,
  dias: number | null
): string | null {
  if (!DIA.test(emision) || dias === null || dias < 0) return null
  return sumarDias(emision, dias)
}

/** Día de calendario de Bogotá de un instante (`timestamptz`). */
export function diaDeInstante(instante: string): string {
  return serializarFecha(new Date(instante))
}

function dias(n: number): string {
  return n === 1 ? "1 día" : `${formatearNumero(n)} días`
}

export interface SituacionVencimiento {
  texto: string
  tono: Tono
  vencida: boolean
}

/** Con esta anticipación el vencimiento se resalta. */
export const DIAS_AVISO_VENCIMIENTO = 5

/**
 * Vencimiento de una factura con saldo, en voz de quien cobra: «Vence en 5
 * días», «Vence hoy», «Venció hace 12 días». `null` si no hay nada que cobrar.
 */
export function situacionVencimiento(
  factura: {
    estado: EstadoFactura
    fechaVencimiento: string | null
    saldo: number
  },
  ahora: Date = new Date()
): SituacionVencimiento | null {
  const { estado, fechaVencimiento, saldo } = factura
  if (!fechaVencimiento || saldo <= 0 || !admiteCobro(estado)) return null
  const faltan = diasHasta(fechaVencimiento, ahora)
  if (faltan < 0) {
    return {
      texto: faltan === -1 ? "Venció ayer" : `Venció hace ${dias(-faltan)}`,
      tono: "peligro",
      vencida: true,
    }
  }
  if (faltan === 0) return { texto: "Vence hoy", tono: "aviso", vencida: false }
  if (faltan === 1)
    return { texto: "Vence mañana", tono: "aviso", vencida: false }
  return {
    texto: `Vence en ${dias(faltan)}`,
    tono: faltan <= DIAS_AVISO_VENCIMIENTO ? "aviso" : "neutro",
    vencida: false,
  }
}

// ── Códigos DIAN (CUFE, CUDE) ───────────────────────────────────────────────

/** CUFE y CUDE: 96 caracteres hexadecimales (SHA-384), como los guarda la BD. */
export const PATRON_CODIGO_DIAN = /^[0-9a-f]{96}$/

/** Como lo pega la persona (con espacios o saltos, en mayúsculas) → como lo guarda la BD. */
export function normalizarCodigoDian(texto: string): string {
  return texto.replace(/\s+/g, "").toLowerCase()
}

/** «3f9a1c0b…e4d2a1» para mostrarlo en una línea; el completo va en el título. */
export function abreviarCodigo(codigo: string): string {
  return codigo.length > 18
    ? `${codigo.slice(0, 8)}…${codigo.slice(-6)}`
    : codigo
}

// ── Numeración sugerida ─────────────────────────────────────────────────────

export interface NumeracionSugerida {
  prefijo: string
  /** El siguiente de la resolución; `null` si ya no quedan. */
  consecutivo: number | null
  agotada: boolean
  quedan: number
}

/**
 * Prefijo y número siguiente de la resolución de facturación activa. Es solo
 * una sugerencia: el número real lo asigna el software de facturación.
 */
export function sugerenciaNumeracion(
  resolucion: ResolucionActiva | null
): NumeracionSugerida | null {
  if (!resolucion) return null
  const siguiente = Math.max(
    resolucion.consecutivoActual + 1,
    resolucion.rangoDesde
  )
  const agotada = siguiente > resolucion.rangoHasta
  return {
    prefijo: resolucion.prefijo,
    consecutivo: agotada ? null : siguiente,
    agotada,
    quedan: agotada ? 0 : resolucion.rangoHasta - siguiente + 1,
  }
}

// ── Efecto de un pago o de una nota crédito ──────────────────────────────────

/** Compara en centavos: las cifras llegan con dos decimales. */
export function enCentavos(valor: number): number {
  return Math.round(valor * 100)
}

export type EfectoPago = "total" | "parcial" | "excede" | "vacio"

/** Qué pasa con la factura si se registra ese pago (antes de enviarlo). */
export function efectoPago({
  monto,
  retenciones,
  saldo,
}: {
  monto: number
  retenciones: number
  saldo: number
}): { efecto: EfectoPago; saldoRestante: number } {
  const aplicado = enCentavos(monto) + enCentavos(retenciones)
  const pendiente = enCentavos(saldo)
  if (aplicado <= 0) return { efecto: "vacio", saldoRestante: saldo }
  if (aplicado > pendiente) return { efecto: "excede", saldoRestante: saldo }
  const restante = (pendiente - aplicado) / 100
  return {
    efecto: restante === 0 ? "total" : "parcial",
    saldoRestante: restante,
  }
}

/**
 * Qué hace una nota crédito (D38 del RF): si cubre todo el saldo de una
 * factura sin pagos, la anula (sale de la cartera); si cubre el saldo de una
 * con pagos, la deja pagada; si no, rebaja el saldo.
 */
export type EfectoNotaCredito = "anula" | "salda" | "rebaja" | "excede"

export function efectoNotaCredito({
  valor,
  saldo,
  pagado,
}: {
  valor: number
  saldo: number
  pagado: number
}): EfectoNotaCredito {
  const nota = enCentavos(valor)
  const pendiente = enCentavos(saldo)
  if (nota > pendiente) return "excede"
  if (nota < pendiente) return "rebaja"
  return enCentavos(pagado) === 0 ? "anula" : "salda"
}

// ── Lo por facturar ──────────────────────────────────────────────────────────

/**
 * Agrupa `pendientes_facturacion` por anunciante (de mayor a menor valor),
 * con sus campañas de mayor a menor.
 */
export function agruparPendientes(
  filas: readonly PendienteFacturacion[]
): GrupoPorFacturar[] {
  const grupos = new Map<string, PendienteFacturacion[]>()
  for (const fila of filas) {
    const lista = grupos.get(fila.anuncianteId) ?? []
    lista.push(fila)
    grupos.set(fila.anuncianteId, lista)
  }
  return [...grupos.values()]
    .map((campanas) => {
      const ordenadas = [...campanas].sort(
        (a, b) =>
          b.montoBruto - a.montoBruto || a.campana.localeCompare(b.campana)
      )
      return {
        anuncianteId: ordenadas[0].anuncianteId,
        anunciante: ordenadas[0].anunciante,
        asignaciones: ordenadas.reduce((suma, c) => suma + c.asignaciones, 0),
        montoBruto:
          ordenadas.reduce((suma, c) => suma + enCentavos(c.montoBruto), 0) /
          100,
        primeraVerificada: ordenadas
          .map((c) => diaDeInstante(c.primeraVerificada))
          .sort()[0],
        campanas: ordenadas,
      }
    })
    .sort(
      (a, b) =>
        b.montoBruto - a.montoBruto ||
        a.anunciante.localeCompare(b.anunciante, "es-CO")
    )
}

export interface SeleccionPorFacturar {
  asignaciones: number
  montoBruto: number
  primeraVerificada: string
}

/** Lo que entra en la factura: todo el anunciante (consolidada) o una campaña. */
export function seleccionPorFacturar(
  grupo: GrupoPorFacturar,
  campanaId: string | null
): SeleccionPorFacturar | null {
  if (campanaId === null) {
    return {
      asignaciones: grupo.asignaciones,
      montoBruto: grupo.montoBruto,
      primeraVerificada: grupo.primeraVerificada,
    }
  }
  const campana = grupo.campanas.find((c) => c.campanaId === campanaId)
  return campana
    ? {
        asignaciones: campana.asignaciones,
        montoBruto: campana.montoBruto,
        primeraVerificada: diaDeInstante(campana.primeraVerificada),
      }
    : null
}

/** «12 asignaciones» / «1 asignación». */
export function contarAsignaciones(cantidad: number): string {
  return cantidad === 1
    ? "1 asignación"
    : `${formatearNumero(cantidad)} asignaciones`
}
