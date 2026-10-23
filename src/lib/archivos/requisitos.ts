/**
 * Reglas de validación a partir de requisitos guardados en la BD (p. ej.
 * `formatos.requisitos` de los creativos, docs/modelo-datos.md §3.10): texto de
 * la proporción («9:16», «1.91:1»), peso en MB y duración en segundos. Módulo
 * puro: lo usan el navegador (antes de subir) y el servidor (al revalidar).
 */
import { MIB } from "./formato"
import type { ReglaAspecto, ReglasArchivo } from "./validar"

/** Lo que exigen unos requisitos, ya leídos del JSON. */
export interface RequisitosArchivo {
  mimes: readonly string[]
  /** Peso máximo propio; `null` = solo el tope global. */
  pesoMaxMb: number | null
  duracionMaxSeg: number | null
  /** Textos como `"9:16"` o `"1.91:1"`; vacío = cualquier proporción. */
  relacionesAspecto: readonly string[]
}

export interface OpcionesReglas {
  /** Tope global en bytes (bucket o configuración); el requisito no lo supera. */
  topeBytes: number
  /** Desviación relativa admitida en la proporción (0.02 = ±2 %). */
  tolerancia: number
  /** Ver `ReglasArchivo.pieza`. */
  pieza?: string
  /** Ver `ReglasArchivo.medidasObligatorias`. */
  medidasObligatorias?: boolean
}

const RELACION = /^\s*(\d+(?:[.,]\d+)?)\s*:\s*(\d+(?:[.,]\d+)?)\s*$/

function numero(texto: string): number {
  return Number(texto.replace(",", "."))
}

/**
 * Ancho / alto de un texto `ancho:alto` («9:16» → 0,5625; «1.91:1» → 1,91;
 * también «1,91:1»). `null` si no es una proporción válida. Es la misma
 * lectura que `private.relacion_aspecto` de la BD.
 */
export function relacionDeTexto(texto: string): number | null {
  const partes = RELACION.exec(texto)
  if (!partes) return null
  const ancho = numero(partes[1])
  const alto = numero(partes[2])
  return ancho > 0 && alto > 0 ? ancho / alto : null
}

/** Las proporciones legibles como reglas, sin repetir; las inválidas se omiten. */
export function reglasAspectoDeTextos(
  textos: readonly string[],
  tolerancia: number
): ReglaAspecto[] {
  const relaciones = textos.flatMap((texto) => {
    const relacion = relacionDeTexto(texto)
    return relacion === null ? [] : [relacion]
  })
  return [...new Set(relaciones)].map((relacion) => ({
    relacion,
    tolerancia,
  }))
}

/**
 * `ReglasArchivo` de unos requisitos: el peso es el menor entre el propio y el
 * tope global, y la proporción admite cualquiera de las listadas.
 */
export function reglasDesdeRequisitos(
  requisitos: RequisitosArchivo,
  opciones: OpcionesReglas
): ReglasArchivo {
  const propio =
    requisitos.pesoMaxMb !== null && requisitos.pesoMaxMb > 0
      ? Math.floor(requisitos.pesoMaxMb * MIB)
      : Number.POSITIVE_INFINITY
  const aspectos = reglasAspectoDeTextos(
    requisitos.relacionesAspecto,
    opciones.tolerancia
  )
  return {
    mimes: requisitos.mimes,
    maxBytes: Math.min(propio, opciones.topeBytes),
    ...(aspectos.length > 0 ? { aspecto: aspectos } : {}),
    ...(requisitos.duracionMaxSeg !== null && requisitos.duracionMaxSeg > 0
      ? { duracionMaxSeg: requisitos.duracionMaxSeg }
      : {}),
    ...(opciones.pieza ? { pieza: opciones.pieza } : {}),
    ...(opciones.medidasObligatorias ? { medidasObligatorias: true } : {}),
  }
}
