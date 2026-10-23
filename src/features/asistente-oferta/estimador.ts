/**
 * Lectura del estimador de la oferta (ANU-005, ANU-007; módulo puro). El
 * anunciante no fija precios: ve por franja cuántos medios cumplen su
 * segmentación, el precio mediano, la inversión estimada y el alcance
 * mediano. La BD nunca deja conocer a un medio concreto:
 * - con menos medios de los configurados en una franja no dice cuántos son
 *   («Menos de 5») ni da cifras («Sin estimación»);
 * - excluir menos de ese número de medios de una franja no cambia la
 *   estimación (la oferta sí los excluye);
 * - el mínimo de seguidores se aproxima hacia abajo a múltiplos de 5.000 para
 *   estimar (la oferta aplica la cifra exacta).
 */
import { textoANumero } from "@/features/configuracion/numeros"
import { formatearCOP, formatearNumero } from "@/lib/format"

import type { ParametrosEstimacion, ValoresOferta } from "./schemas"
import type { EstimacionFranja, FranjaAsistente } from "./tipos"

export const SIN_ESTIMACION = "Sin estimación"

/** Escalón al que la BD aproxima hacia abajo el mínimo de seguidores al estimar. */
export const ESCALON_SEGUIDORES_ESTIMACION = 5_000

/** Mínimo de seguidores que la BD aplica: nunca por debajo del umbral de AMO. */
export function seguidoresEfectivos(
  minimo: number | null,
  umbral: number
): number {
  return Math.max(umbral, minimo ?? 0)
}

/**
 * Mínimo de seguidores con el que estima la BD: el pedido, aproximado hacia
 * abajo a múltiplos de 5.000 y nunca por debajo del umbral (una búsqueda
 * fina revelaría los seguidores de un medio). La oferta usa la cifra exacta.
 */
export function seguidoresParaEstimar(
  minimo: number | null,
  umbral: number
): number {
  const escalon = ESCALON_SEGUIDORES_ESTIMACION
  return Math.max(umbral, Math.floor((minimo ?? 0) / escalon) * escalon)
}

/** Cupos pedidos por franja, solo los positivos (`{ franjaId: n }`). */
export function cuposPedidos(
  cupos: readonly { franjaId: string; cantidad: string | number }[]
): Record<string, number> {
  return Object.fromEntries(
    cupos
      .map((cupo) => [cupo.franjaId, cantidadDe(cupo.cantidad)] as const)
      .filter(([, cantidad]) => cantidad > 0)
  )
}

/** Cifra escrita de cupos → entero (lo que no se entiende cuenta 0). */
export function cantidadDe(valor: string | number): number {
  const numero = typeof valor === "number" ? valor : textoANumero(valor)
  return numero !== null && Number.isInteger(numero) && numero > 0 ? numero : 0
}

/**
 * Se estima con un cupo por franja: el precio mediano no depende de cuántos
 * se pidan y la inversión es ese precio por los cupos (como en la BD). Así
 * cambiar los cupos no vuelve a consultar.
 */
export function cuposDeConteo(
  franjas: readonly Pick<FranjaAsistente, "id">[]
): Record<string, number> {
  return Object.fromEntries(franjas.map((franja) => [franja.id, 1]))
}

function enteroEn(
  texto: string,
  minimo: number,
  maximo: number
): number | null {
  const numero = textoANumero(texto)
  return numero !== null &&
    Number.isInteger(numero) &&
    numero >= minimo &&
    numero <= maximo
    ? numero
    : null
}

/**
 * Parámetros del estimador para un formato con lo que hay escrito en los
 * pasos 1 a 3 (lo que aún no es válido no filtra: una exclusividad sin días
 * no recarga, un mínimo ilegible no restringe).
 */
export function parametrosEstimacion(
  valores: Pick<ValoresOferta, "que" | "quien" | "cuando">,
  formatoId: string,
  franjas: readonly Pick<FranjaAsistente, "id">[]
): ParametrosEstimacion {
  const { que, quien, cuando } = valores
  return {
    formatoId,
    departamentos: [...quien.segmentacion.departamentos],
    municipios: [...quien.segmentacion.municipios],
    categorias: [...quien.categorias],
    seguidoresMinimos: enteroEn(quien.seguidoresMinimos, 0, 1_000_000_000),
    cupos: cuposDeConteo(franjas),
    exclusividadDias: cuando.exclusividad
      ? enteroEn(cuando.exclusividadDias, 1, 90)
      : null,
    mediosExcluidos: quien.mediosExcluidos.map((medio) => medio.id),
    publicaciones: enteroEn(que.publicacionesPorMedio, 1, 10) ?? 1,
  }
}

/** Inversión de una franja: precio mediano por los cupos pedidos. */
export function inversionFranja(
  fila: Pick<EstimacionFranja, "precioMediano"> | undefined,
  cupos: number
): number | null {
  if (!fila || fila.precioMediano === null) return null
  return fila.precioMediano * cupos
}

export interface ResumenElegibles {
  /** Medios de las franjas con cifra (cada medio está en una por plataforma). */
  conocidos: number
  /** Franjas con menos medios de los configurados: la BD no dice cuántos. */
  pocos: number
}

/** Medios elegibles de todas las franjas de un formato. */
export function resumenElegibles(
  filas: readonly EstimacionFranja[]
): ResumenElegibles {
  return filas.reduce<ResumenElegibles>(
    (resumen, fila) =>
      fila.mediosElegibles === null
        ? { ...resumen, pocos: resumen.pocos + 1 }
        : { ...resumen, conocidos: resumen.conocidos + fila.mediosElegibles },
    { conocidos: 0, pocos: 0 }
  )
}

/**
 * «42 medios elegibles»; si alguna franja tiene menos de los configurados
 * (pueden ser cero), «Al menos 40 medios elegibles»; si todas, «Menos de 5
 * medios elegibles por franja».
 */
export function textoElegibles(
  { conocidos, pocos }: ResumenElegibles,
  minimo: number
): string {
  if (pocos > 0 && conocidos === 0) {
    return `Menos de ${formatearNumero(minimo)} medios elegibles por franja`
  }
  const cifra =
    conocidos === 1
      ? "1 medio elegible"
      : `${formatearNumero(conocidos)} medios elegibles`
  return pocos > 0 ? `Al menos ${cifra}` : cifra
}

/** Medios de una franja o «Menos de 5» cuando la BD no lo dice. */
export function cifraMedios(valor: number | null, minimo: number): string {
  return valor === null
    ? `Menos de ${formatearNumero(minimo)}`
    : formatearNumero(valor)
}

export interface TotalesEstimacion {
  cupos: number
  /** Suma de las franjas con cifra; null si ninguna la tiene. */
  inversion: number | null
  /** Alguna franja con cupos no tiene cifra: el total es parcial. */
  parcial: boolean
}

export function totalesEstimacion(
  filas: readonly EstimacionFranja[],
  cupos: Readonly<Record<string, number>>
): TotalesEstimacion {
  let inversion: number | null = null
  let parcial = false
  let total = 0
  for (const [franjaId, cantidad] of Object.entries(cupos)) {
    if (cantidad <= 0) continue
    total += cantidad
    const valor = inversionFranja(
      filas.find((f) => f.franjaId === franjaId),
      cantidad
    )
    if (valor === null) {
      parcial = true
      continue
    }
    inversion = (inversion ?? 0) + valor
  }
  return { cupos: total, inversion, parcial }
}

export type TipoAviso = "presupuesto" | "tope" | "medios" | "minimo"

export interface AvisoEstimacion {
  tipo: TipoAviso
  mensaje: string
}

function textoCupos(cantidad: number): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? "cupo" : "cupos"}`
}

/**
 * Pocos medios para los cupos de una franja. Sin cifra la BD solo dice que
 * son menos del mínimo configurado (pueden ser cero).
 */
function avisoMedios(
  franja: string,
  pedidos: number,
  medios: number | null,
  minimo: number
): string | null {
  if (medios === null) {
    return pedidos >= minimo
      ? `Pides ${textoCupos(pedidos)} en la franja ${franja} y hoy la cumplen menos de ${formatearNumero(minimo)} medios: algunos cupos quedarían libres.`
      : `En la franja ${franja} hoy la cumplen menos de ${formatearNumero(minimo)} medios: ${pedidos === 1 ? "puede que tu cupo quede libre" : `puede que no se llenen tus ${textoCupos(pedidos)}`}.`
  }
  if (medios >= pedidos) return null
  return medios === 0
    ? `Ningún medio cumple hoy tu segmentación en la franja ${franja}: esos cupos quedarían libres.`
    : `Pides ${textoCupos(pedidos)} en la franja ${franja} y hoy la cumplen ${formatearNumero(medios)} ${medios === 1 ? "medio" : "medios"}.`
}

/**
 * Avisos que no bloquean (la BD decide al enviar): una inversión estimada
 * mayor que el presupuesto (no se llenarían todos los cupos), un precio
 * mediano por encima del tope por medio (la mayoría de esos medios no podría
 * aceptar: la BD rechaza el cupo que lo supera), franjas con menos medios
 * que cupos y menos cupos de los exigidos.
 */
export function avisosEstimacion({
  filas,
  cupos,
  franjas,
  presupuesto,
  topeMonto,
  minimoCupos,
  minimoEstimador,
}: {
  filas: readonly EstimacionFranja[]
  cupos: Readonly<Record<string, number>>
  franjas: readonly Pick<FranjaAsistente, "id" | "nombre">[]
  presupuesto: number | null
  /** Lo máximo que puede recibir un medio de la campaña (tope × presupuesto total). */
  topeMonto: number | null
  minimoCupos: number
  /** Medios por franja por debajo de los cuales la BD no da cifras. */
  minimoEstimador: number
}): AvisoEstimacion[] {
  const avisos: AvisoEstimacion[] = []
  const totales = totalesEstimacion(filas, cupos)
  if (
    presupuesto !== null &&
    totales.inversion !== null &&
    totales.inversion > presupuesto
  ) {
    avisos.push({
      tipo: "presupuesto",
      mensaje: `La inversión estimada (${formatearCOP(totales.inversion)}) supera tu presupuesto máximo (${formatearCOP(presupuesto)}): es probable que no se llenen todos los cupos. Sube el presupuesto o pide menos cupos.`,
    })
  }
  for (const franja of franjas) {
    const pedidos = cupos[franja.id] ?? 0
    const fila = filas.find((f) => f.franjaId === franja.id)
    if (pedidos <= 0 || !fila) continue
    if (
      topeMonto !== null &&
      fila.precioMediano !== null &&
      fila.precioMediano > topeMonto
    ) {
      avisos.push({
        tipo: "tope",
        mensaje: `En la franja ${franja.nombre} el precio mediano (${formatearCOP(fila.precioMediano)}) supera el tope por medio (${formatearCOP(topeMonto)}): la mayoría de esos medios no podría aceptar. Sube el tope por medio o el presupuesto de la campaña.`,
      })
    }
    const medios = avisoMedios(
      franja.nombre,
      pedidos,
      fila.mediosElegibles,
      minimoEstimador
    )
    if (medios) avisos.push({ tipo: "medios", mensaje: medios })
  }
  if (totales.cupos > 0 && totales.cupos < minimoCupos) {
    avisos.push({
      tipo: "minimo",
      mensaje: `Una oferta necesita al menos ${formatearNumero(minimoCupos)} cupos.`,
    })
  }
  return avisos
}

/** 1,25 → «25 %». */
export function porcentajeRecargo(recargo: number): string {
  const porcentaje = Math.round((recargo - 1) * 1000) / 10
  return `${formatearNumero(porcentaje, 1)} %`
}

/** Cifra del estimador o «Sin estimación». */
export function cifraEstimada(
  valor: number | null,
  formato: "cop" | "numero"
): string {
  if (valor === null) return SIN_ESTIMACION
  return formato === "cop" ? formatearCOP(valor) : formatearNumero(valor)
}
