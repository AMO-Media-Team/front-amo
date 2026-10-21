/**
 * Preferencias de interfaz guardadas en `perfiles.preferencias` (jsonb, < 8 KB).
 * Viajan con la cuenta (otro navegador, otro equipo) y se aplican en caliente.
 * El JSON puede traer claves de otros módulos o de versiones anteriores: se
 * conservan al escribir y lo que no se reconoce se ignora al leer.
 * Módulo puro: lo usan el servidor, el proveedor de cliente y los tests.
 */
import { z } from "zod"

import type { Json } from "@/types/database.types"

export const TEMAS = ["dark", "light", "system"] as const
/** Las mismas densidades que ofrece la tabla de datos (`components/data-table`). */
export const DENSIDADES = ["compacta", "normal", "comoda"] as const
/** `sistema` sigue `prefers-reduced-motion`; `reducido` lo impone en la app. */
export const MOVIMIENTOS = ["sistema", "reducido"] as const
/** Separadores de miles y decimales: `1.234.567,89` o `1,234,567.89`. */
export const FORMATOS_NUMERO = ["colombia", "internacional"] as const

export type TemaPreferido = (typeof TEMAS)[number]
export type DensidadPreferida = (typeof DENSIDADES)[number]
export type MovimientoPreferido = (typeof MOVIMIENTOS)[number]
export type FormatoNumeros = (typeof FORMATOS_NUMERO)[number]

export interface PreferenciasInterfaz {
  tema: TemaPreferido
  densidad: DensidadPreferida
  movimiento: MovimientoPreferido
  formatoNumeros: FormatoNumeros
}

export const PREFERENCIAS_POR_DEFECTO: PreferenciasInterfaz = {
  tema: "dark",
  densidad: "normal",
  movimiento: "sistema",
  formatoNumeros: "colombia",
}

/** Cambios que envía la interfaz: al menos una preferencia válida. */
export const esquemaCambiosPreferencias = z
  .object({
    tema: z.enum(TEMAS),
    densidad: z.enum(DENSIDADES),
    movimiento: z.enum(MOVIMIENTOS),
    formatoNumeros: z.enum(FORMATOS_NUMERO),
  })
  .partial()
  .strict()
  .refine((cambios) => Object.keys(cambios).length > 0, {
    message: "No hay cambios que guardar.",
  })

export type CambiosPreferencias = z.infer<typeof esquemaCambiosPreferencias>

function esObjeto(valor: unknown): valor is Record<string, Json | undefined> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
}

function valorDe<T extends string>(
  lista: readonly T[],
  valor: unknown,
  porDefecto: T
): T {
  return (lista as readonly unknown[]).includes(valor)
    ? (valor as T)
    : porDefecto
}

/** Preferencias efectivas a partir del JSON guardado (tolera basura y claves ajenas). */
export function leerPreferencias(guardado: unknown): PreferenciasInterfaz {
  if (!esObjeto(guardado)) return PREFERENCIAS_POR_DEFECTO
  const base = PREFERENCIAS_POR_DEFECTO
  return {
    tema: valorDe(TEMAS, guardado.tema, base.tema),
    densidad: valorDe(DENSIDADES, guardado.densidad, base.densidad),
    movimiento: valorDe(MOVIMIENTOS, guardado.movimiento, base.movimiento),
    formatoNumeros: valorDe(
      FORMATOS_NUMERO,
      guardado.formatoNumeros,
      base.formatoNumeros
    ),
  }
}

/** JSON a guardar: lo anterior (incluidas claves de otros módulos) + los cambios. */
export function fusionarPreferencias(
  guardado: unknown,
  cambios: CambiosPreferencias
): Record<string, Json | undefined> {
  const previo = esObjeto(guardado) ? guardado : {}
  return { ...previo, ...cambios }
}
