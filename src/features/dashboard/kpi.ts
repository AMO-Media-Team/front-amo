/**
 * Filas `kpi_fila` de las RPC de analítica normalizadas para la interfaz y
 * el motor de insights. PostgREST entrega `numeric` como número o como
 * texto: todo pasa por `numero`. Módulo puro.
 */
import type { FilaKpi } from "@/components/kpi/tipos"
import { numero } from "@/features/dashboard/insights/adaptadores"
import type { Database } from "@/types/database.types"

export type FilaKpiRpc = Database["public"]["CompositeTypes"]["kpi_fila"]

type Numerico = number | string | null | undefined

function entero(valor: Numerico): number | null {
  const convertido = numero(valor)
  return convertido === null ? null : Math.round(convertido)
}

export function filaKpi(fila: FilaKpiRpc): FilaKpi {
  return {
    kpi: fila.kpi ?? "",
    valor: numero(fila.valor),
    valor_anterior: numero(fila.valor_anterior),
    variacion: numero(fila.variacion),
    n: entero(fila.n),
    n_anterior: entero(fila.n_anterior),
    unidad: fila.unidad ?? "conteo",
    serie: fila.serie ? fila.serie.map((punto) => numero(punto)) : null,
  }
}

export function filasKpi(filas: readonly FilaKpiRpc[] | null): FilaKpi[] {
  return (filas ?? []).map(filaKpi).filter((fila) => fila.kpi !== "")
}

/** Índice por clave: las tarjetas piden cada KPI por su nombre. */
export function indicePorKpi(
  filas: readonly FilaKpi[]
): ReadonlyMap<string, FilaKpi> {
  return new Map(filas.map((fila) => [fila.kpi, fila]))
}

/** Valor actual de un KPI (o `null` si no llegó o no tiene muestra). */
export function valorKpi(
  indice: ReadonlyMap<string, FilaKpi>,
  clave: string
): number | null {
  return indice.get(clave)?.valor ?? null
}

/** ¿Hubo algún hecho en el periodo? (para distinguir "vacío" de "cero"). */
export function hayActividad(
  filas: readonly FilaKpi[],
  claves: readonly string[]
): boolean {
  return filas.some(
    (fila) =>
      claves.includes(fila.kpi) &&
      ((fila.valor ?? 0) !== 0 || (fila.n ?? 0) > 0)
  )
}
