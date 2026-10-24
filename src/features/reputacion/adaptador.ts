/**
 * De la fila de `mi_reputacion()` a `Reputacion` (módulo puro). Las funciones
 * que devuelven tablas generan tipos sin nulos y PostgREST entrega `numeric`
 * como número o como texto: todo pasa por `numero`. Un caso que no tiene la
 * forma esperada se descarta (no tumba la página) y el resto se muestra.
 */
import { z } from "zod"

import { numero } from "@/features/dashboard/insights/adaptadores"
import { Constants, type Database } from "@/types/database.types"

import { N_MINIMO_CUMPLIMIENTO_POR_DEFECTO } from "./datos"
import type { CasoReputacion, Reputacion } from "./tipos"

export type FilaReputacion =
  Database["public"]["Functions"]["mi_reputacion"]["Returns"][number]

const esquemaCaso = z.object({
  asignacion_id: z.string().min(1),
  oferta: z.string().nullish(),
  limite: z.string().min(1),
  estado: z.enum(Constants.public.Enums.asignacion_estado),
  cumplida: z.boolean(),
})

function entero(valor: unknown): number {
  const cifra = numero(
    typeof valor === "number" || typeof valor === "string" ? valor : null
  )
  return cifra === null ? 0 : Math.max(0, Math.trunc(cifra))
}

function casosDesdeJson(casos: unknown): CasoReputacion[] {
  if (!Array.isArray(casos)) return []
  return casos.flatMap((caso): CasoReputacion[] => {
    const lectura = esquemaCaso.safeParse(caso)
    if (!lectura.success) return []
    const { asignacion_id, oferta, limite, estado, cumplida } = lectura.data
    return [
      {
        asignacionId: asignacion_id,
        oferta: oferta?.trim() || null,
        limite,
        estado,
        cumplida,
      },
    ]
  })
}

/** `null` si la RPC no devolvió fila (la cuenta no tiene medio visible). */
export function reputacionDesdeRpc(
  fila: FilaReputacion | undefined
): Reputacion | null {
  if (!fila) return null
  const tasa = numero(fila.tasa as number | string | null)
  const minimo = entero(fila.n_minimo)
  return {
    tasa: tasa === null ? null : Math.min(1, Math.max(0, tasa)),
    n: entero(fila.n),
    cumplidas: entero(fila.cumplidas),
    nMinimo: minimo > 0 ? minimo : N_MINIMO_CUMPLIMIENTO_POR_DEFECTO,
    publicacionesTotal: entero(fila.publicaciones_total),
    publicaciones180d: entero(fila.publicaciones_180d),
    calculadaAt: fila.calculada_at,
    casos: casosDesdeJson(fila.casos),
  }
}
