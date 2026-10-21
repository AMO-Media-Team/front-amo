/**
 * Utilidades de redacción de los insights: listas naturales, plurales,
 * nombres de plataforma y país. Textos sin jerga ("frente al periodo anterior").
 */
import { enumerar } from "@/components/charts/accesibilidad"
import { formatearNumero } from "@/lib/format"

import type { Plataforma } from "./tipos"

const comparador = new Intl.Collator("es", { sensitivity: "base" })

export { enumerar }

/** Hasta `maximo` nombres; el resto como "y 3 más". */
export function enumerarLimitado(
  partes: readonly string[],
  maximo = 3
): string {
  if (partes.length <= maximo) return enumerar(partes)
  const resto = partes.length - maximo
  return `${partes.slice(0, maximo).join(", ")} y ${formatearNumero(resto)} más`
}

/** "1 medio" / "12 medios". */
export function plural(
  cantidad: number,
  singular: string,
  pluralTexto: string
): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? singular : pluralTexto}`
}

export const NOMBRES_PLATAFORMA: Readonly<Record<Plataforma, string>> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
}

const nombresRegion = new Intl.DisplayNames("es", { type: "region" })

/** Nombre del país en español a partir del ISO-2 ("RU" → "Rusia"). */
export function nombrePais(iso2: string, nombre?: string | null): string {
  if (nombre?.trim()) return nombre.trim()
  try {
    return nombresRegion.of(iso2.toUpperCase()) ?? iso2.toUpperCase()
  } catch {
    return iso2.toUpperCase()
  }
}

/** Orden estable: por cantidad descendente y, en empate, alfabético. */
export function porCantidadDesc<T extends { nombre: string }>(
  cantidad: (elemento: T) => number
) {
  return (a: T, b: T) =>
    cantidad(b) - cantidad(a) || comparador.compare(a.nombre, b.nombre)
}

/** Primera letra en mayúscula (títulos que empiezan con un nombre de KPI). */
export function capitalizar(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1)
}
