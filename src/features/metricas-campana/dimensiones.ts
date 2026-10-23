/**
 * Cortes del consolidado de una campaña (ANU-012, §7.2.6): plataforma, medio,
 * municipio y fecha. El elegido va en la URL (`?corte=`) para enlazarlo y
 * conservarlo al recargar; el primero es el de por defecto y no ocupa la URL.
 * Módulo puro: el parser sirve en el cliente y en el servidor.
 */
import { parseAsStringLiteral } from "nuqs/server"

export const DIMENSIONES = [
  "plataforma",
  "medio",
  "municipio",
  "fecha",
] as const

export type Dimension = (typeof DIMENSIONES)[number]

export const PARAMETRO_CORTE = "corte"

export const parseAsDimension =
  parseAsStringLiteral(DIMENSIONES).withDefault("plataforma")

export function esDimension(valor: unknown): valor is Dimension {
  return (DIMENSIONES as readonly unknown[]).includes(valor)
}

export interface PresentacionDimension {
  /** Nombre del corte en el selector y en los documentos. */
  titulo: string
  /** Encabezado de la primera columna de la tabla. */
  columna: string
  /** Qué agrupa, en lenguaje llano. */
  descripcion: string
}

export const DIMENSION: Readonly<Record<Dimension, PresentacionDimension>> = {
  plataforma: {
    titulo: "Plataforma",
    columna: "Plataforma",
    descripcion: "Instagram, Facebook y TikTok por separado.",
  },
  medio: {
    titulo: "Medio",
    columna: "Medio",
    descripcion: "Cada medio que cumplió con tu pauta.",
  },
  municipio: {
    titulo: "Municipio",
    columna: "Municipio",
    descripcion: "El municipio de cada medio.",
  },
  fecha: {
    titulo: "Fecha",
    columna: "Fecha de verificación",
    descripcion:
      "El día (o la semana) en que el equipo AMO verificó cada negocio.",
  },
}
