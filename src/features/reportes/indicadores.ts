/**
 * Indicadores de cabecera de los reportes (tarjetas KPI, hoja "Indicadores"
 * del Excel e indicadores del PDF). Forma serializable: el servidor los arma
 * y el cliente los pinta o los exporta. Módulo puro.
 */
import type { DefinicionKpi } from "@/components/kpi/definiciones-kpi"
import { type PresentacionDelta, presentarDelta } from "@/components/kpi/delta"
import { propsDesdeFila } from "@/components/kpi/desde-fila"
import { formatearValorKpi } from "@/components/kpi/formato-kpi"
import type { FilaKpi, SentidoKpi, UnidadKpi } from "@/components/kpi/tipos"
import { formatearNumero } from "@/lib/format"

/** Ícono decorativo de la tarjeta (se resuelve con un mapa estático en el cliente). */
export type IconoIndicador =
  | "dinero"
  | "comision"
  | "porcentaje"
  | "negocios"
  | "alcance"
  | "medios"
  | "campanas"
  | "anunciantes"
  | "usuarios"
  | "ingresos"
  | "fallos"
  | "alerta"
  | "escudo"
  | "mapa"
  | "factura"
  | "recaudo"
  | "reloj"
  | "pago"

export interface IndicadorReporte {
  clave: string
  titulo: string
  valor: number | null
  unidad: UnidadKpi
  valorAnterior: number | null
  variacion: number | null
  sentido: SentidoKpi
  /** Muestra del valor (tasas): con menos de `nMinimo` no se compara. */
  n: number | null
  nMinimo: number | null
  serie: (number | null)[] | null
  definicion: DefinicionKpi | null
  icono: IconoIndicador | null
  /**
   * Por qué el indicador no se compara con el periodo anterior (rótulo de la
   * tarjeta, el Excel y el PDF); `null` si se compara. Sin comparativo no hay
   * valor anterior ni variación.
   */
  sinComparativo: string | null
}

/**
 * Foto de hoy: la cifra no depende del periodo elegido (p. ej. las cuentas
 * sin verificación en dos pasos).
 */
export const ETIQUETA_FOTO = "Foto de hoy, sin comparativo"

/**
 * La cifra es del periodo, pero se cuenta sobre las cuentas que existen hoy:
 * en el periodo anterior contaría también las que aún no se habían creado.
 */
export const ETIQUETA_CUENTAS_DE_HOY =
  "Sobre las cuentas de hoy, sin comparativo"

/** Tarjeta desde una fila `kpi_fila` (nombre, sentido y definición del diccionario). */
export function indicadorDesdeFila(
  fila: FilaKpi,
  nMinimo: number,
  icono: IconoIndicador | null = null
): IndicadorReporte {
  const props = propsDesdeFila(fila, nMinimo)
  return {
    clave: fila.kpi,
    titulo: props.titulo,
    valor: props.valor,
    unidad: props.unidad ?? "conteo",
    valorAnterior: props.valorAnterior ?? null,
    variacion: props.variacion ?? null,
    sentido: props.sentido ?? "neutro",
    n: props.n ?? null,
    nMinimo: props.nMinimo ?? null,
    serie: props.serie ? [...props.serie] : null,
    definicion: props.definicion ?? null,
    icono,
    sinComparativo: null,
  }
}

/** (actual − anterior) / anterior; `null` sin base (anterior 0 o ausente). */
export function variacionRelativa(
  actual: number | null,
  anterior: number | null
): number | null {
  if (actual === null || anterior === null || anterior === 0) return null
  if (!Number.isFinite(actual) || !Number.isFinite(anterior)) return null
  return (actual - anterior) / Math.abs(anterior)
}

export interface EntradaIndicador {
  clave: string
  titulo: string
  actual: number | null
  anterior?: number | null
  unidad: UnidadKpi
  sentido: SentidoKpi
  definicion?: DefinicionKpi | null
  n?: number | null
  nMinimo?: number | null
  icono?: IconoIndicador | null
  serie?: (number | null)[] | null
  /**
   * El indicador no se compara (`ETIQUETA_FOTO`, `ETIQUETA_CUENTAS_DE_HOY`…):
   * se ignora `anterior` y el rótulo reemplaza al comparativo.
   */
  sinComparativo?: string
  /**
   * Razón de una entidad concreta (un anunciante, una campaña): es una cifra
   * contable exacta y se informa siempre, con su n al lado si es pequeña
   * (docs/kpis.md §0.4). Sin esto la razón es un agregado y exige el mínimo.
   */
  entidad?: boolean
}

/**
 * Indicador calculado en la app (sumas o razones de las filas del reporte)
 * con su comparativo. Una tasa agregada con muestra menor al mínimo no se
 * informa (docs/kpis.md §0.4): su valor queda en `null` y la tarjeta lo
 * explica; la de una entidad concreta sí, con su n.
 */
export function indicador(entrada: EntradaIndicador): IndicadorReporte {
  const pequena =
    entrada.n != null && entrada.nMinimo != null && entrada.n < entrada.nMinimo
  const actual = pequena && !entrada.entidad ? null : entrada.actual
  const sinComparativo = entrada.sinComparativo ?? null
  const anterior = sinComparativo ? null : (entrada.anterior ?? null)
  // Una entidad sin dato no tiene "muestra insuficiente": simplemente no hay
  // dato. El mínimo solo se conserva para anotar el n junto a su cifra.
  const sinDatoDeEntidad = entrada.entidad === true && actual === null
  return {
    clave: entrada.clave,
    titulo: entrada.titulo,
    valor: actual,
    unidad: entrada.unidad,
    valorAnterior: anterior,
    variacion:
      entrada.unidad === "%" ? null : variacionRelativa(actual, anterior),
    sentido: entrada.sentido,
    n: entrada.n ?? null,
    nMinimo: sinDatoDeEntidad ? null : (entrada.nMinimo ?? null),
    serie: entrada.serie ?? null,
    // La ayuda se titula como la tarjeta («Alcance acumulado», «Municipios
    // con medios»), no con el nombre genérico del diccionario.
    definicion: entrada.definicion
      ? { ...entrada.definicion, nombre: entrada.titulo }
      : null,
    icono: entrada.icono ?? null,
    sinComparativo,
  }
}

/** Cociente de sumas (nunca promedio de razones, docs/kpis.md §0.4). */
export function razon(numerador: number, denominador: number): number | null {
  return denominador > 0 ? numerador / denominador : null
}

export function sumar<T>(
  filas: readonly T[],
  valor: (fila: T) => number | null
): number {
  return filas.reduce((total, fila) => total + (valor(fila) ?? 0), 0)
}

/** El valor no se informa porque su muestra es menor al mínimo. */
export function muestraInsuficiente(ind: IndicadorReporte): boolean {
  return (
    ind.valor === null &&
    ind.n != null &&
    ind.nMinimo != null &&
    ind.n < ind.nMinimo
  )
}

/**
 * "$ 1.234.567", "12,5 %", "Muestra insuficiente (n = 7)" o "—". Con
 * `conMuestra: false` la muestra no se repite (va en su propia columna).
 */
export function textoValorIndicador(
  ind: IndicadorReporte,
  { conMuestra = true }: { conMuestra?: boolean } = {}
): string {
  if (ind.valor !== null && Number.isFinite(ind.valor)) {
    return formatearValorKpi(ind.valor, ind.unidad)
  }
  if (!muestraInsuficiente(ind)) return "—"
  return conMuestra
    ? `Muestra insuficiente (n = ${formatearNumero(ind.n ?? 0)})`
    : "Muestra insuficiente"
}

export function textoAnteriorIndicador(ind: IndicadorReporte): string {
  return ind.valorAnterior !== null && Number.isFinite(ind.valorAnterior)
    ? formatearValorKpi(ind.valorAnterior, ind.unidad)
    : "—"
}

/** Variación con el mismo criterio que la tarjeta; `null` si no se compara. */
function deltaIndicador(ind: IndicadorReporte): PresentacionDelta | null {
  if (ind.valor === null || ind.sinComparativo) return null
  return presentarDelta({
    valor: ind.valor,
    valorAnterior: ind.valorAnterior,
    variacion: ind.variacion,
    unidad: ind.unidad,
    sentido: ind.sentido,
  })
}

/**
 * "+12,5 %", "−2,1 pp", "Nuevo" o "—" (mismo criterio que la tarjeta); un
 * indicador que no se compara dice por qué.
 */
export function textoVariacionIndicador(ind: IndicadorReporte): string {
  return ind.sinComparativo ?? deltaIndicador(ind)?.texto ?? "—"
}

/** Cifra de la tarjeta del PDF: corta, para que nunca desborde su caja. */
export function textoCifraIndicador(ind: IndicadorReporte): string {
  return ind.valor !== null && Number.isFinite(ind.valor)
    ? formatearValorKpi(ind.valor, ind.unidad)
    : "—"
}

function detalleComparativo(ind: IndicadorReporte): string | null {
  const delta = deltaIndicador(ind)
  if (!delta || delta.tipo === "sin-comparativo") return null
  return delta.tipo === "nuevo"
    ? "Sin registro en el periodo anterior"
    : `${delta.texto} vs. anterior`
}

/**
 * Detalle bajo la cifra del PDF: comparativo (o por qué no lo hay) y muestra pequeña. Una
 * cifra que no se informa lo explica aquí ("Muestra insuficiente (n = 7)").
 */
export function detalleIndicador(
  ind: IndicadorReporte,
  conComparativo: boolean
): string | undefined {
  if (ind.valor === null) {
    return muestraInsuficiente(ind) ? textoValorIndicador(ind) : undefined
  }
  const partes: string[] = []
  if (ind.sinComparativo) {
    partes.push(ind.sinComparativo)
  } else if (conComparativo) {
    const comparativo = detalleComparativo(ind)
    if (comparativo) partes.push(comparativo)
  }
  if (ind.n != null && ind.nMinimo != null && ind.n < ind.nMinimo) {
    partes.push(`n = ${formatearNumero(ind.n)}`)
  }
  return partes.length > 0 ? partes.join(" · ") : undefined
}
