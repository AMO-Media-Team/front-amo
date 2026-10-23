import {
  alineaComoNumero,
  formatearCelda,
  type ValorColumna,
} from "@/features/reportes/columnas"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { columnasCorte } from "../contenido"
import { DIMENSION, type Dimension } from "../dimensiones"
import type { FilaDesempeno, TotalesCampana } from "../tipos"

/** Lo que la fila de totales dice en cada columna (las razones, ya como cociente de sumas). */
function valorTotal(id: string, totales: TotalesCampana): ValorColumna {
  switch (id) {
    case "nombre":
      return "Toda la campaña"
    case "n":
      return totales.verificadas
    case "inversion":
      return totales.inversion
    case "alcance":
      return totales.alcance
    case "impresiones":
      return totales.impresiones
    case "interacciones":
      return totales.interacciones
    case "reproducciones":
      return totales.reproducciones
    case "clics":
      return totales.clics
    case "cpm":
      return totales.cpm
    case "costoInteraccion":
      return totales.costoInteraccion
    case "engagement":
      return totales.engagement
    case "costoAlcance":
      return totales.costoAlcance
    default:
      return null
  }
}

const PRIMERA =
  "sticky left-0 z-10 bg-card px-3 py-2.5 text-left after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border sm:pl-4"

/**
 * Indicadores del corte elegido, una fila por plataforma, medio, municipio o
 * fecha, con su tamaño de muestra (n) y la fila de toda la campaña. La
 * primera columna queda fija y la tabla se desplaza dentro de su región en
 * pantallas angostas (la página nunca se desborda).
 */
export function TablaCorte({
  dimension,
  filas,
  totales,
  nMinimo,
}: {
  dimension: Dimension
  filas: readonly FilaDesempeno[]
  totales: TotalesCampana
  nMinimo: number
}) {
  const columnas = columnasCorte(dimension)
  const titulo = `Resultados por ${DIMENSION[dimension].columna.toLocaleLowerCase("es-CO")}`
  return (
    <div
      role="region"
      tabIndex={0}
      aria-label={`${titulo} (tabla desplazable)`}
      className="overflow-x-auto rounded-xl border bg-card focus-visible:anillo-foco"
    >
      <table className="w-full min-w-[64rem] text-sm">
        <caption className="sr-only">
          {titulo}. La columna «Negocios (n)» es el tamaño de muestra de cada
          fila.
        </caption>
        <thead>
          <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
            {columnas.map((columna, indice) => (
              <th
                key={columna.id}
                scope="col"
                className={cn(
                  "px-3 py-2 font-medium",
                  indice === 0
                    ? cn(PRIMERA, "bg-muted")
                    : alineaComoNumero(columna)
                      ? "text-right"
                      : "text-left"
                )}
              >
                {columna.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {filas.map((fila) => {
            const pequena = fila.n < nMinimo
            return (
              <tr key={fila.clave}>
                {columnas.map((columna, indice) => {
                  const texto = formatearCelda(
                    columna.valor(fila),
                    columna.tipo
                  )
                  if (indice === 0) {
                    return (
                      <th
                        key={columna.id}
                        scope="row"
                        className={cn(PRIMERA, "max-w-56 font-medium")}
                      >
                        <span className="line-clamp-2" title={texto}>
                          {texto}
                        </span>
                      </th>
                    )
                  }
                  return (
                    <td
                      key={columna.id}
                      className={cn(
                        "px-3 py-2.5 whitespace-nowrap",
                        alineaComoNumero(columna) && "text-right cifras",
                        columna.id === "n" && pequena && "text-muted-foreground"
                      )}
                    >
                      {texto}
                      {columna.id === "n" && pequena ? (
                        <span className="sr-only"> (muestra pequeña)</span>
                      ) : null}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 bg-muted/30 font-semibold">
            {columnas.map((columna, indice) => {
              const texto = formatearCelda(
                valorTotal(columna.id, totales),
                columna.tipo
              )
              return indice === 0 ? (
                <th
                  key={columna.id}
                  scope="row"
                  className={cn(PRIMERA, "bg-muted")}
                >
                  {texto}
                </th>
              ) : (
                <td
                  key={columna.id}
                  className={cn(
                    "px-3 py-2.5 whitespace-nowrap",
                    alineaComoNumero(columna) && "text-right cifras"
                  )}
                >
                  {texto}
                </td>
              )
            })}
          </tr>
        </tfoot>
      </table>
      {filas.some((fila) => fila.n < nMinimo) ? (
        <p className="sticky left-0 border-t px-3 py-2 text-xs text-pretty text-muted-foreground sm:px-4">
          Las filas con menos de {formatearNumero(nMinimo)} negocios son cifras
          exactas, pero una sola publicación puede mover mucho sus razones.
        </p>
      ) : null}
    </div>
  )
}
