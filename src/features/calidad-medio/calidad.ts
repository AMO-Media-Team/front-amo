/**
 * Calidad de las cuentas del medio (PRC-003, PRC-004; módulo puro): el
 * multiplicador que rige hoy para cada cuenta, el cambio anunciado y por qué,
 * en voz del medio. Sigue las reglas de la base de datos:
 *
 * - `private.calcular_precio` cobra con 1,00 mientras la cuenta tenga menos de
 *   `calidad.minimo_publicaciones` verificadas y acota el resto entre el piso
 *   y el techo.
 * - `private.recalcular_multiplicadores` (semanal) compara el índice de la
 *   cuenta (alcance mediano ÷ seguidores) con la mediana de su franja y
 *   plataforma, y si el resultado cambia lo programa con
 *   `calidad.dias_aviso_cambio` días de antelación.
 */
import { enFrase } from "@/features/cuentas-medio/franjas"
import {
  type Corte,
  CORTES,
  ORDEN_PLATAFORMAS,
  PLATAFORMAS,
  type Tono,
} from "@/features/operacion/estados"
import { ZONA } from "@/lib/fechas"
import { formatearNumero, formatearPorcentaje, LOCALE } from "@/lib/format"

import type { CuentaCalidad, ParametrosCalidad } from "./tipos"

/** Ancla de «Calidad de tus cuentas» (el resumen de «Tu reputación» lleva a ella). */
export const ID_CALIDAD_CUENTAS = "calidad-de-tus-cuentas"

/** Los que siembra la migración (docs/modelo-datos.md §7). */
export const PARAMETROS_CALIDAD_POR_DEFECTO: ParametrosCalidad = {
  minimoPublicaciones: 5,
  ventanaPublicaciones: 20,
  piso: 0.7,
  techo: 1.4,
  corteReferencia: "D7",
  diasAvisoCambio: 7,
}

/** Clave de `configuracion` de cada parámetro. */
export const CLAVES_CALIDAD: Readonly<Record<keyof ParametrosCalidad, string>> =
  {
    minimoPublicaciones: "calidad.minimo_publicaciones",
    ventanaPublicaciones: "calidad.ventana_publicaciones",
    piso: "calidad.multiplicador_piso",
    techo: "calidad.multiplicador_techo",
    corteReferencia: "calidad.corte_referencia",
    diasAvisoCambio: "calidad.dias_aviso_cambio",
  }

function numeroDe(valor: unknown): number | null {
  const numero =
    typeof valor === "number"
      ? valor
      : typeof valor === "string" && valor.trim() !== ""
        ? Number(valor)
        : Number.NaN
  return Number.isFinite(numero) ? numero : null
}

function enteroPositivo(valor: unknown, respaldo: number): number {
  const numero = numeroDe(valor)
  return numero !== null && Number.isInteger(numero) && numero > 0
    ? numero
    : respaldo
}

function esCorteFijo(valor: unknown): valor is Exclude<Corte, "PERSONALIZADO"> {
  return valor === "H24" || valor === "H72" || valor === "D7"
}

/**
 * Parámetros a partir de las filas de `configuracion` (`clave`, `valor`
 * jsonb). Lo ilegible o incoherente (un piso por encima del techo, un factor
 * fuera de (0, 10)) cae al valor sembrado: la explicación nunca debe
 * contradecir el precio.
 */
export function parametrosDesdeConfiguracion(
  filas: readonly { clave: string; valor: unknown }[]
): ParametrosCalidad {
  const valores = new Map(filas.map((fila) => [fila.clave, fila.valor]))
  const base = PARAMETROS_CALIDAD_POR_DEFECTO
  const factor = (clave: string, respaldo: number) => {
    const numero = numeroDe(valores.get(clave))
    return numero !== null && numero > 0 && numero < 10 ? numero : respaldo
  }
  let piso = factor(CLAVES_CALIDAD.piso, base.piso)
  let techo = factor(CLAVES_CALIDAD.techo, base.techo)
  if (piso > 1 || techo < 1 || piso > techo) {
    piso = base.piso
    techo = base.techo
  }
  const corte = valores.get(CLAVES_CALIDAD.corteReferencia)
  return {
    minimoPublicaciones: enteroPositivo(
      valores.get(CLAVES_CALIDAD.minimoPublicaciones),
      base.minimoPublicaciones
    ),
    ventanaPublicaciones: enteroPositivo(
      valores.get(CLAVES_CALIDAD.ventanaPublicaciones),
      base.ventanaPublicaciones
    ),
    piso,
    techo,
    corteReferencia: esCorteFijo(corte) ? corte : base.corteReferencia,
    diasAvisoCambio: enteroPositivo(
      valores.get(CLAVES_CALIDAD.diasAvisoCambio),
      base.diasAvisoCambio
    ),
  }
}

/** El multiplicador se guarda con tres decimales (`numeric(4,3)`). */
function redondear(valor: number): number {
  return Math.round(valor * 1000) / 1000
}

function acotar(valor: number, piso: number, techo: number): number {
  return Math.min(techo, Math.max(piso, valor))
}

// ── Multiplicador vigente y cambio programado ───────────────────────────────

/**
 * El que se aplica hoy al precio de la cuenta: 1 sin historial suficiente; si
 * no, el guardado, dentro de piso y techo (como `private.calcular_precio`).
 */
export function multiplicadorVigente(
  cuenta: Pick<CuentaCalidad, "multiplicador" | "publicacionesVerificadas">,
  parametros: ParametrosCalidad
): number {
  if (cuenta.publicacionesVerificadas < parametros.minimoPublicaciones) return 1
  return redondear(
    acotar(cuenta.multiplicador, parametros.piso, parametros.techo)
  )
}

export type Direccion = "sube" | "baja"

export interface CambioProgramado {
  proximo: number
  /** Instante desde el que rige (00:00 de Bogotá del día anunciado). */
  desde: string
  direccion: Direccion
}

/**
 * El cambio anunciado, si lo hay y de verdad cambia lo que rige hoy (un
 * próximo igual al vigente no se anuncia).
 */
export function cambioProgramado(
  cuenta: Pick<CuentaCalidad, "proximo" | "proximoDesde">,
  vigente: number
): CambioProgramado | null {
  if (cuenta.proximo === null || !cuenta.proximoDesde) return null
  const proximo = redondear(cuenta.proximo)
  if (proximo === vigente) return null
  return {
    proximo,
    desde: cuenta.proximoDesde,
    direccion: proximo > vigente ? "sube" : "baja",
  }
}

// ── Situación frente a la franja ────────────────────────────────────────────

export type Posicion = "encima" | "mediana" | "debajo"

export type SituacionCalidad =
  /** Menos publicaciones verificadas que el mínimo: el multiplicador es 1. */
  | { tipo: "sin-historial"; llevas: number; minimo: number }
  /** Sin índice propio o sin mediana de la franja con qué comparar. */
  | { tipo: "sin-referencia" }
  | {
      tipo: "comparada"
      indice: number
      indiceFranja: number
      /** Índice ÷ mediana − 1 (0,12 = un 12 % por encima). */
      diferencia: number
      posicion: Posicion
      /** El multiplicador quedó en el techo o en el piso. */
      limite: "piso" | "techo" | null
      /** Multiplicador que resulta del cálculo, ya acotado. */
      resultado: number
    }

export function situacionCalidad(
  cuenta: Pick<
    CuentaCalidad,
    "publicacionesVerificadas" | "indice" | "indiceFranja"
  >,
  parametros: ParametrosCalidad
): SituacionCalidad {
  const { minimoPublicaciones: minimo, piso, techo } = parametros
  if (cuenta.publicacionesVerificadas < minimo) {
    return {
      tipo: "sin-historial",
      llevas: Math.max(0, cuenta.publicacionesVerificadas),
      minimo,
    }
  }
  const { indice, indiceFranja } = cuenta
  if (indice === null || indiceFranja === null || !(indiceFranja > 0)) {
    return { tipo: "sin-referencia" }
  }
  const relacion = indice / indiceFranja
  const diferencia = relacion - 1
  // En la mediana si la diferencia se lee como «0 %».
  const posicion: Posicion =
    Math.round(Math.abs(diferencia) * 100) === 0
      ? "mediana"
      : diferencia > 0
        ? "encima"
        : "debajo"
  return {
    tipo: "comparada",
    indice,
    indiceFranja,
    diferencia,
    posicion,
    limite: relacion > techo ? "techo" : relacion < piso ? "piso" : null,
    resultado: redondear(acotar(relacion, piso, techo)),
  }
}

// ── Calidad por cuenta ──────────────────────────────────────────────────────

export interface CalidadCuenta {
  cuenta: CuentaCalidad
  vigente: number
  cambio: CambioProgramado | null
  situacion: SituacionCalidad
}

export function calidadDeCuenta(
  cuenta: CuentaCalidad,
  parametros: ParametrosCalidad
): CalidadCuenta {
  const vigente = multiplicadorVigente(cuenta, parametros)
  return {
    cuenta,
    vigente,
    cambio: cambioProgramado(cuenta, vigente),
    situacion: situacionCalidad(cuenta, parametros),
  }
}

const comparador = new Intl.Collator(LOCALE, { sensitivity: "base" })

/** Cuentas en el orden de las plataformas (Instagram, Facebook, TikTok) y por handle. */
export function calidadDeCuentas(
  cuentas: readonly CuentaCalidad[],
  parametros: ParametrosCalidad
): CalidadCuenta[] {
  return [...cuentas]
    .sort(
      (a, b) =>
        ORDEN_PLATAFORMAS.indexOf(a.plataforma) -
          ORDEN_PLATAFORMAS.indexOf(b.plataforma) ||
        comparador.compare(a.handle, b.handle)
    )
    .map((cuenta) => calidadDeCuenta(cuenta, parametros))
}

// ── Textos ──────────────────────────────────────────────────────────────────

const formatoFactor = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
})

/** «1,00», «1,12», «0,784»: dos decimales como en los avisos, tres si los tiene. */
export function formatearFactor(valor: number): string {
  return formatoFactor.format(valor)
}

const diaYMes = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA,
  day: "numeric",
  month: "long",
})
const diaMesYAnio = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA,
  day: "numeric",
  month: "long",
  year: "numeric",
})
const anioBogota = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA,
  year: "numeric",
})

/** «7 de octubre» (Bogotá); con el año si no es el de `ahora`. */
export function diaEnFrase(instante: string, ahora: Date): string {
  const fecha = new Date(instante)
  if (Number.isNaN(fecha.getTime())) return instante
  return anioBogota.format(fecha) === anioBogota.format(ahora)
    ? diaYMes.format(fecha)
    : diaMesYAnio.format(fecha)
}

/** «tus últimas 20 publicaciones», «tus 12 publicaciones», «tu publicación». */
export function textoPublicaciones(
  cantidad: number,
  ventana: number,
  calificativo = ""
): string {
  const sufijo = calificativo ? ` ${calificativo}` : ""
  if (cantidad === 1) return `tu publicación${sufijo}`
  const numero = formatearNumero(cantidad)
  return cantidad >= ventana
    ? `tus últimas ${numero} publicaciones${sufijo}`
    : `tus ${numero} publicaciones${sufijo}`
}

function razonDelCambio(
  calidad: CalidadCuenta,
  cambio: CambioProgramado,
  parametros: ParametrosCalidad
): string {
  const { situacion, cuenta } = calidad
  if (situacion.tipo === "sin-historial") {
    return `porque aún no tienes ${formatearNumero(situacion.minimo)} publicaciones verificadas`
  }
  if (situacion.tipo === "sin-referencia") {
    return "porque tu franja aún no tiene cuentas suficientes para comparar"
  }
  const publicaciones = textoPublicaciones(
    cuenta.publicacionesVerificadas,
    parametros.ventanaPublicaciones
  )
  if (cambio.direccion === "sube") {
    return cambio.proximo > 1
      ? `por el buen alcance de ${publicaciones}`
      : `porque mejoró el alcance de ${publicaciones}`
  }
  return cambio.proximo < 1
    ? `porque el alcance de ${publicaciones} quedó por debajo de la mediana de tu franja`
    : `porque el alcance de ${publicaciones} se acercó a la mediana de tu franja`
}

/**
 * El aviso de PRC-004 en la pantalla: «Desde el 7 de octubre pasará de 1,00 a
 * 1,12 por el buen alcance de tus últimas 20 publicaciones.»
 */
export function textoCambio(
  calidad: CalidadCuenta,
  parametros: ParametrosCalidad,
  ahora: Date
): string | null {
  const { cambio } = calidad
  if (!cambio) return null
  return `Desde el ${diaEnFrase(cambio.desde, ahora)} pasará de ${formatearFactor(calidad.vigente)} a ${formatearFactor(cambio.proximo)} ${razonDelCambio(calidad, cambio, parametros)}.`
}

/** «de tu franja (más de 120.000 seguidores)» o «de tu franja». */
function deTuFranja(cuenta: CuentaCalidad): string {
  return cuenta.franja
    ? `de tu franja (${enFrase(cuenta.franja.nombre)} seguidores)`
    : "de tu franja"
}

/** Por qué la cuenta tiene el multiplicador que tiene, en voz del medio. */
export function explicacionCalidad(
  calidad: CalidadCuenta,
  parametros: ParametrosCalidad
): string {
  const { situacion, cuenta } = calidad
  const plataforma = PLATAFORMAS[cuenta.plataforma]
  switch (situacion.tipo) {
    case "sin-historial":
      return `Con menos de ${formatearNumero(situacion.minimo)} publicaciones verificadas el multiplicador es ${formatearFactor(1)}: no sube ni baja lo que te pagan. Llevas ${formatearNumero(situacion.llevas)} de ${formatearNumero(situacion.minimo)}.`
    case "sin-referencia":
      return `Aún no hay suficientes cuentas de ${plataforma} ${deTuFranja(cuenta)} para comparar tu alcance: mientras tanto, el multiplicador es ${formatearFactor(1)}.`
    case "comparada": {
      const comparacion = `Tu alcance mediano es el ${formatearPorcentaje(situacion.indice, 1)} de tus seguidores; en las cuentas de ${plataforma} ${deTuFranja(cuenta)} la mediana es el ${formatearPorcentaje(situacion.indiceFranja, 1)}.`
      const diferencia = formatearPorcentaje(Math.abs(situacion.diferencia), 0)
      if (situacion.posicion === "mediana") {
        return `${comparacion} Estás en la mediana.`
      }
      if (situacion.posicion === "encima") {
        return `${comparacion} Estás un ${diferencia} por encima${situacion.limite === "techo" ? `: el multiplicador llega hasta ${formatearFactor(parametros.techo)}` : ""}.`
      }
      return `${comparacion} Estás un ${diferencia} por debajo${situacion.limite === "piso" ? `: el multiplicador no baja de ${formatearFactor(parametros.piso)}` : ""}.`
    }
  }
}

/**
 * «Calculado el 19 de octubre con tus últimas 20 publicaciones verificadas
 * (métricas de 7 días).»
 */
export function textoBaseCalculo(
  cuenta: CuentaCalidad,
  parametros: ParametrosCalidad,
  ahora: Date
): string {
  const corte = CORTES[parametros.corteReferencia].etiqueta
  if (!cuenta.calculadoAt) {
    return `Aún no se ha calculado: se calcula cada semana con las métricas de ${corte} de tus publicaciones verificadas.`
  }
  const fecha = diaEnFrase(cuenta.calculadoAt, ahora)
  if (cuenta.publicacionesVerificadas === 0) {
    return `Calculado el ${fecha}, aún sin publicaciones verificadas.`
  }
  return `Calculado el ${fecha} con ${textoPublicaciones(cuenta.publicacionesVerificadas, parametros.ventanaPublicaciones, "verificadas")} (métricas de ${corte}).`
}

export interface PresentacionSituacion {
  tono: Tono
  etiqueta: string
}

/** Distintivo de la cuenta junto a su multiplicador. */
export function presentarSituacion(
  situacion: SituacionCalidad
): PresentacionSituacion {
  switch (situacion.tipo) {
    case "sin-historial":
      return { tono: "neutro", etiqueta: "Sin historial suficiente" }
    case "sin-referencia":
      return { tono: "neutro", etiqueta: "Sin referencia en tu franja" }
    case "comparada":
      return situacion.posicion === "encima"
        ? { tono: "exito", etiqueta: "Por encima de tu franja" }
        : situacion.posicion === "debajo"
          ? { tono: "aviso", etiqueta: "Por debajo de tu franja" }
          : { tono: "info", etiqueta: "En la mediana de tu franja" }
  }
}

/** Cómo se calcula, paso a paso, con los parámetros vigentes. */
export function pasosDelCalculo(parametros: ParametrosCalidad): string[] {
  const {
    ventanaPublicaciones,
    corteReferencia,
    piso,
    techo,
    minimoPublicaciones,
    diasAvisoCambio,
  } = parametros
  return [
    `Tomamos el alcance mediano de tus últimas ${formatearNumero(ventanaPublicaciones)} publicaciones verificadas (métricas de ${CORTES[corteReferencia].etiqueta}) y lo dividimos entre tus seguidores verificados: ese es tu índice de alcance.`,
    `Lo comparamos con la mediana de las cuentas de la misma plataforma y franja: en la mediana, tu multiplicador es ${formatearFactor(1)}; por encima sube en la misma proporción, hasta ${formatearFactor(techo)}, y por debajo baja, hasta ${formatearFactor(piso)}.`,
    `Con menos de ${formatearNumero(minimoPublicaciones)} publicaciones verificadas, el multiplicador es ${formatearFactor(1)}.`,
    `Se recalcula cada semana. Si cambia, te avisamos con ${formatearNumero(diasAvisoCambio)} ${diasAvisoCambio === 1 ? "día" : "días"} de anticipación, y lo que ya aceptaste conserva su precio.`,
  ]
}

// ── Resumen para «Tu reputación» ────────────────────────────────────────────

export interface ResumenMultiplicador {
  /** El vigente más bajo entre las cuentas (como `kpis_medio`). */
  valor: number
  nota: string
}

export function resumenMultiplicador(
  calidades: readonly CalidadCuenta[],
  ahora: Date
): ResumenMultiplicador | null {
  const [primera, ...resto] = calidades
  if (!primera) return null
  const menor = resto.reduce(
    (actual, calidad) => (calidad.vigente < actual.vigente ? calidad : actual),
    primera
  )
  const cambio = menor.cambio
    ? `pasará a ${formatearFactor(menor.cambio.proximo)} el ${diaEnFrase(menor.cambio.desde, ahora)}`
    : null
  if (resto.length === 0) {
    return {
      valor: menor.vigente,
      nota: cambio
        ? cambio.charAt(0).toUpperCase() + cambio.slice(1)
        : "Ajusta tu pago según el alcance de tu cuenta",
    }
  }
  const base = `El más bajo de tus ${formatearNumero(calidades.length)} cuentas`
  return { valor: menor.vigente, nota: cambio ? `${base}; ${cambio}` : base }
}
