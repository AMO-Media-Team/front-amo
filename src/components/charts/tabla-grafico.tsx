import { cn } from "@/lib/utils"

import type { TablaGrafico as DatosTabla } from "./tipos"

interface TablaGraficoProps {
  tabla: DatosTabla
  /** Título de la tabla (se lee como `<caption>`). */
  titulo: string
  /** Solo para lectores de pantalla (el gráfico está a la vista). */
  oculta?: boolean
  className?: string
}

/**
 * Equivalente tabular de un gráfico (WCAG): los mismos valores que el trazo,
 * ya formateados. Visible con "Ver datos" o, oculta, junto a cada lienzo.
 */
export function TablaGrafico({
  tabla,
  titulo,
  oculta = false,
  className,
}: TablaGraficoProps) {
  return (
    <div
      className={cn(
        oculta ? "sr-only" : "max-h-full overflow-auto rounded-lg border",
        className
      )}
    >
      <table className="w-full caption-top border-collapse text-sm">
        <caption className={cn(oculta ? undefined : "sr-only")}>
          {titulo}
        </caption>
        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
          <tr>
            {tabla.columnas.map((columna) => (
              <th
                key={columna.titulo}
                scope="col"
                className={cn(
                  "px-3 py-2 text-xs font-medium whitespace-nowrap text-muted-foreground",
                  columna.numerica ? "text-right" : "text-left"
                )}
              >
                {columna.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((fila, indiceFila) => (
            <tr
              key={indiceFila}
              className="border-t transition-colors hover:bg-muted/40"
            >
              {fila.map((celda, indice) => {
                const numerica = tabla.columnas[indice]?.numerica
                return indice === 0 ? (
                  <th
                    key={indice}
                    scope="row"
                    className="px-3 py-2 text-left font-medium"
                  >
                    {celda}
                  </th>
                ) : (
                  <td
                    key={indice}
                    className={cn(
                      "px-3 py-2 whitespace-nowrap",
                      numerica && "text-right cifras"
                    )}
                  >
                    {celda}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
