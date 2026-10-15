/**
 * Interpretación, normalización y presentación de los valores de
 * `public.configuracion` (módulo puro). La BD guarda `jsonb`; aquí se lee
 * según el tipo del parámetro, se formatea en es-CO y se describe la
 * diferencia entre dos valores para la confirmación de un cambio.
 */
import {
  formatearCOP,
  formatearNumero,
  formatearPorcentaje,
  LOCALE,
} from "@/lib/format"
import type { Json } from "@/types/database.types"

import { etiquetaOpcion } from "./parametros"
import type { ReglasParametro, TipoParametro, ValorParametro } from "./tipos"

type Objeto = Record<string, unknown>

function esObjeto(valor: unknown): valor is Objeto {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

function esNumero(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor)
}

/** JSON de la BD → valor tipado; `null` si no corresponde al tipo declarado. */
export function leerValor(
  tipo: TipoParametro,
  json: Json | unknown
): ValorParametro | null {
  switch (tipo) {
    case "ENTERO":
    case "DECIMAL":
    case "PORCENTAJE":
      return esNumero(json) ? json : null
    case "BOOLEANO":
      return typeof json === "boolean" ? json : null
    case "TEXTO":
      return typeof json === "string" ? json : null
    case "LISTA_TEXTO":
      return Array.isArray(json) && json.every((x) => typeof x === "string")
        ? [...json]
        : null
    case "MAPA_DECIMAL": {
      if (!esObjeto(json)) return null
      const entradas = Object.entries(json)
      return entradas.every(([, v]) => esNumero(v))
        ? (Object.fromEntries(entradas) as Record<string, number>)
        : null
    }
  }
}

/** Redondeo que evita artefactos de coma flotante (0.1 + 0.2). */
export function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales
  return Math.round((valor + Number.EPSILON) * factor) / factor
}

/** Fracción guardada → número que se escribe en el campo (0,155 → 15,5). */
export function fraccionAPorcentaje(fraccion: number): number {
  return redondear(fraccion * 100, 2)
}

/** Número escrito en el campo → fracción guardada (15,5 → 0,155). */
export function porcentajeAFraccion(porcentaje: number): number {
  return redondear(porcentaje / 100, 4)
}

function ordenSegun(opciones: readonly string[] | null) {
  return (a: string, b: string) => {
    if (opciones) {
      const ia = opciones.indexOf(a)
      const ib = opciones.indexOf(b)
      if (ia !== -1 || ib !== -1) {
        return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib)
      }
    }
    return a.localeCompare(b, LOCALE)
  }
}

/**
 * Forma canónica antes de comparar o guardar: listas sin repetidos y en el
 * orden de las opciones, mapas con sus claves en ese orden, decimales sin
 * ruido de coma flotante.
 */
export function normalizarValor(
  reglas: Pick<ReglasParametro, "tipo" | "opciones">,
  valor: ValorParametro
): ValorParametro {
  switch (reglas.tipo) {
    case "PORCENTAJE":
    case "DECIMAL":
      return esNumero(valor) ? redondear(valor, 4) : valor
    case "LISTA_TEXTO":
      return Array.isArray(valor)
        ? [...new Set(valor)].sort(ordenSegun(reglas.opciones))
        : valor
    case "MAPA_DECIMAL":
      return esObjeto(valor)
        ? Object.fromEntries(
            Object.keys(valor)
              .sort(ordenSegun(reglas.opciones))
              .map((clave) => [
                clave,
                redondear((valor as Record<string, number>)[clave], 4),
              ])
          )
        : valor
    default:
      return valor
  }
}

export function sonIguales(
  a: ValorParametro | null,
  b: ValorParametro | null
): boolean {
  if (a === null || b === null) return a === b
  if (esNumero(a) && esNumero(b)) return Math.abs(a - b) < 1e-9
  if (Array.isArray(a) && Array.isArray(b)) {
    const conjunto = new Set(a)
    return a.length === b.length && b.every((x) => conjunto.has(x))
  }
  if (esObjeto(a) && esObjeto(b)) {
    const claves = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...claves].every((clave) => {
      const x = (a as Record<string, number>)[clave]
      const y = (b as Record<string, number>)[clave]
      return esNumero(x) && esNumero(y) && Math.abs(x - y) < 1e-9
    })
  }
  return a === b
}

// ── Presentación ────────────────────────────────────────────────────────────

/** Unidades de conteo: singular cuando el valor es 1. */
const SINGULARES: Readonly<Record<string, string>> = {
  días: "día",
  medios: "medio",
  publicaciones: "publicación",
  intentos: "intento",
  casos: "caso",
  asignaciones: "asignación",
  seguidores: "seguidor",
}

const UNIDADES_TIEMPO = ["s", "min", "h", "días"] as const
type UnidadTiempo = (typeof UNIDADES_TIEMPO)[number]

function esUnidadTiempo(unidad: string | null): unidad is UnidadTiempo {
  return (UNIDADES_TIEMPO as readonly (string | null)[]).includes(unidad)
}

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${formatearNumero(n)} ${n === 1 ? singular : pluralTexto}`
}

const EQUIVALENCIAS: Readonly<
  Record<UnidadTiempo, readonly (readonly [number, string, string])[]>
> = {
  s: [
    [3600, "hora", "horas"],
    [60, "minuto", "minutos"],
  ],
  min: [
    [1440, "día", "días"],
    [60, "hora", "horas"],
  ],
  h: [[24, "día", "días"]],
  días: [
    [365, "año", "años"],
    [7, "semana", "semanas"],
  ],
}

/** "720 min" → "12 horas"; `null` si no hay una equivalencia exacta más legible. */
export function equivalenciaTiempo(
  valor: number,
  unidad: UnidadTiempo
): string | null {
  for (const [factor, singular, pluralTexto] of EQUIVALENCIAS[unidad]) {
    if (valor >= factor && valor % factor === 0) {
      return plural(valor / factor, singular, pluralTexto)
    }
  }
  return null
}

/** Decimales justos para un porcentaje: 0,2 → 0; 0,155 → 1; 0,1234 → 2. */
export function decimalesPorcentaje(fraccion: number): number {
  const centesimas = redondear(fraccion * 100, 2)
  if (Number.isInteger(centesimas)) return 0
  return Number.isInteger(redondear(centesimas * 10, 4)) ? 1 : 2
}

function formatearNumeroConUnidad(
  valor: number,
  unidad: string | null
): string {
  if (unidad === "COP") return formatearCOP(valor)
  if (unidad === "×") return `${formatearNumero(valor, 2)}×`
  if (!unidad) return formatearNumero(valor, 2)
  const texto = valor === 1 ? (SINGULARES[unidad] ?? unidad) : unidad
  return `${formatearNumero(valor, 2)} ${texto}`
}

const listaY = new Intl.ListFormat(LOCALE, { type: "conjunction" })

export interface ValorPresentado {
  texto: string
  /** Equivalencia más legible ("12 horas" para 720 min), si la hay. */
  equivalencia: string | null
}

export interface ContextoPresentacion {
  /** Nombres de valores que viven en otras tablas (ISO2 → país, DIVIPOLA → municipio). */
  etiquetas?: Readonly<Record<string, string>>
  /** Textos para un booleano: [verdadero, falso]. */
  booleano?: readonly [string, string]
}

/** Con opciones, las claves van en el orden de las opciones; sin ellas, como vienen. */
function enOrdenDeOpciones(
  reglas: { opciones?: readonly string[] | null },
  claves: string[]
): string[] {
  return reglas.opciones
    ? [...claves].sort(ordenSegun(reglas.opciones))
    : claves
}

/** Lo que hace falta para presentar un valor: su tipo, su unidad y, si las hay, sus opciones. */
export type ReglasPresentacion = Pick<ReglasParametro, "tipo"> & {
  unidad: string | null
  /**
   * Con opciones, listas y mapas se muestran en ESE orden: el `jsonb` de la BD
   * reordena las claves y el valor vigente no coincidiría con el predeterminado.
   */
  opciones?: readonly string[] | null
}

export function presentarValor(
  reglas: ReglasPresentacion,
  valor: ValorParametro | null,
  contexto: ContextoPresentacion = {}
): ValorPresentado {
  const enOrden = (claves: string[]) => enOrdenDeOpciones(reglas, claves)
  const sin = { texto: "Valor no válido", equivalencia: null }
  if (valor === null) return sin
  switch (reglas.tipo) {
    case "PORCENTAJE":
      return esNumero(valor)
        ? {
            texto: formatearPorcentaje(valor, decimalesPorcentaje(valor)),
            equivalencia: null,
          }
        : sin
    case "ENTERO":
    case "DECIMAL":
      if (!esNumero(valor)) return sin
      return {
        texto: formatearNumeroConUnidad(valor, reglas.unidad),
        equivalencia: esUnidadTiempo(reglas.unidad)
          ? equivalenciaTiempo(valor, reglas.unidad)
          : null,
      }
    case "BOOLEANO": {
      const [si, no] = contexto.booleano ?? ["Sí", "No"]
      return typeof valor === "boolean"
        ? { texto: valor ? si : no, equivalencia: null }
        : sin
    }
    case "TEXTO":
      return typeof valor === "string"
        ? {
            texto: etiquetaOpcion(valor, contexto.etiquetas),
            equivalencia: null,
          }
        : sin
    case "LISTA_TEXTO":
      if (!Array.isArray(valor)) return sin
      return {
        texto:
          valor.length === 0
            ? "Ninguno"
            : listaY.format(
                enOrden(valor).map((opcion) =>
                  etiquetaOpcion(opcion, contexto.etiquetas)
                )
              ),
        equivalencia: null,
      }
    case "MAPA_DECIMAL":
      if (!esObjeto(valor)) return sin
      return {
        texto: enOrden(Object.keys(valor))
          .map(
            (clave) =>
              `${etiquetaOpcion(clave, contexto.etiquetas)} ${formatearNumeroConUnidad((valor as Record<string, number>)[clave], reglas.unidad)}`
          )
          .join(" · "),
        equivalencia: null,
      }
  }
}

// ── Diferencias ─────────────────────────────────────────────────────────────

export type Direccion = "sube" | "baja"

export type Diferencia =
  | {
      tipo: "numero"
      direccion: Direccion
      delta: string
      relativa: string | null
    }
  | { tipo: "lista"; agregados: string[]; quitados: string[] }
  | {
      tipo: "mapa"
      cambios: { etiqueta: string; antes: string; despues: string }[]
    }
  | { tipo: "simple" }

function signo(valor: number): string {
  return valor > 0 ? "+" : "−"
}

function deltaNumerico(
  reglas: ReglasPresentacion,
  antes: number,
  despues: number
): Diferencia {
  const cambio = despues - antes
  const direccion: Direccion = cambio > 0 ? "sube" : "baja"
  if (reglas.tipo === "PORCENTAJE") {
    const puntos = Math.abs(redondear(cambio * 100, 2))
    return {
      tipo: "numero",
      direccion,
      delta: `${signo(cambio)}${formatearNumero(puntos, 2)} p. p.`,
      relativa: null,
    }
  }
  const absoluto = formatearNumeroConUnidad(
    Math.abs(redondear(cambio, 4)),
    reglas.unidad
  )
  const relativa =
    antes !== 0
      ? `${signo(cambio)}${formatearPorcentaje(Math.abs(cambio / antes), 1)}`
      : null
  return {
    tipo: "numero",
    direccion,
    delta: `${signo(cambio)}${absoluto}`,
    relativa,
  }
}

/** Qué cambia entre dos valores (para el diálogo de confirmación y el historial). */
export function describirDiferencia(
  reglas: ReglasPresentacion,
  antes: ValorParametro | null,
  despues: ValorParametro | null,
  contexto: ContextoPresentacion = {}
): Diferencia {
  if (esNumero(antes) && esNumero(despues) && antes !== despues) {
    return deltaNumerico(reglas, antes, despues)
  }
  if (Array.isArray(antes) && Array.isArray(despues)) {
    const previos = new Set(antes)
    const nuevos = new Set(despues)
    const etiqueta = (x: string) => etiquetaOpcion(x, contexto.etiquetas)
    return {
      tipo: "lista",
      agregados: despues.filter((x) => !previos.has(x)).map(etiqueta),
      quitados: antes.filter((x) => !nuevos.has(x)).map(etiqueta),
    }
  }
  if (esObjeto(antes) && esObjeto(despues)) {
    const claves = enOrdenDeOpciones(reglas, [
      ...new Set([...Object.keys(antes), ...Object.keys(despues)]),
    ])
    const texto = (v: unknown) =>
      esNumero(v) ? formatearNumeroConUnidad(v, reglas.unidad) : "—"
    return {
      tipo: "mapa",
      cambios: claves
        .filter(
          (clave) =>
            !sonIguales(
              (antes as Record<string, number>)[clave] ?? null,
              (despues as Record<string, number>)[clave] ?? null
            )
        )
        .map((clave) => ({
          etiqueta: etiquetaOpcion(clave, contexto.etiquetas),
          antes: texto(antes[clave]),
          despues: texto(despues[clave]),
        })),
    }
  }
  return { tipo: "simple" }
}
