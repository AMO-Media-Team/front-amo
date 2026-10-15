/**
 * Convierte una fila de `kpi_fila` en las props de `TarjetaKpi`, completando
 * nombre, unidad, sentido y definición desde el diccionario.
 */
import { definicionKpi } from "./definiciones-kpi"
import type { TarjetaKpiProps } from "./tarjeta-kpi"
import type { FilaKpi, UnidadKpi } from "./tipos"

const UNIDADES: readonly UnidadKpi[] = [
  "COP",
  "%",
  "h",
  "conteo",
  "personas",
  "factor",
]

function comoUnidad(unidad: string, respaldo: UnidadKpi): UnidadKpi {
  return (UNIDADES as readonly string[]).includes(unidad)
    ? (unidad as UnidadKpi)
    : respaldo
}

type PropsDesdeFila = Pick<
  TarjetaKpiProps,
  | "titulo"
  | "valor"
  | "unidad"
  | "valorAnterior"
  | "variacion"
  | "sentido"
  | "serie"
  | "n"
  | "nMinimo"
  | "definicion"
>

export function propsDesdeFila(
  fila: FilaKpi,
  nMinimoTasas: number
): PropsDesdeFila {
  const definicion = definicionKpi(fila.kpi)
  return {
    titulo: definicion?.nombre ?? fila.kpi,
    valor: fila.valor,
    unidad: comoUnidad(fila.unidad, definicion?.unidad ?? "conteo"),
    valorAnterior: fila.valor_anterior,
    variacion: fila.variacion,
    sentido: definicion?.sentido ?? "neutro",
    serie: fila.serie,
    n: fila.n,
    nMinimo: definicion?.exigeMuestra ? nMinimoTasas : undefined,
    definicion,
  }
}
