import { AURORA, AURORA_PROFUNDA } from "./colores"
import { variablesTono, type TonoMarca } from "./tono"

interface GradienteAuroraProps {
  id: string
  /** [x1, y1, x2, y2] en unidades del viewBox (userSpaceOnUse). */
  coordenadas: readonly number[]
  tono: TonoMarca
}

/**
 * Gradiente Aurora del isotipo: la Aurora luminosa sobre fondos oscuros y la
 * profunda sobre claros. En `auto` cada parada lleva ambos colores y la
 * variante `dark:` elige (ver `variablesTono`).
 */
export function GradienteAurora({
  id,
  coordenadas: [x1, y1, x2, y2],
  tono,
}: GradienteAuroraProps) {
  return (
    <linearGradient
      id={id}
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      gradientUnits="userSpaceOnUse"
    >
      {AURORA.map((parada, i) => {
        const profunda = AURORA_PROFUNDA[i].color
        if (tono !== "auto") {
          const color = tono === "oscuro" ? parada.color : profunda
          return (
            <stop
              key={parada.offset}
              offset={parada.offset}
              stopColor={color}
            />
          )
        }
        return (
          <stop
            key={parada.offset}
            offset={parada.offset}
            style={variablesTono(profunda, parada.color)}
            className="[stop-color:var(--marca-claro)] dark:[stop-color:var(--marca-oscuro)]"
          />
        )
      })}
    </linearGradient>
  )
}
