import type { CSSProperties } from "react"

/**
 * Tono del fondo sobre el que se pinta la marca.
 * - `auto`: sigue el tema activo (clase `.dark` de next-themes).
 * - `oscuro`: fondos oscuros (Aurora luminosa, tintas claras).
 * - `claro`: fondos claros (Aurora profunda, tintas lila 950/700).
 */
export type TonoMarca = "auto" | "claro" | "oscuro"

type EstiloConVariables = CSSProperties & Record<`--${string}`, string>

/**
 * Lleva el valor de cada fondo en una variable CSS; la clase del elemento
 * elige con la variante `dark:`. Así `auto` no necesita JS y el HTML del
 * servidor y el del cliente coinciden (sin desajustes de hidratación).
 */
export function variablesTono(
  claro: string,
  oscuro: string
): EstiloConVariables {
  return { "--marca-claro": claro, "--marca-oscuro": oscuro }
}

/** Props de relleno de un trazado según el tono. */
export function rellenoSegunTono(
  tono: TonoMarca,
  claro: string,
  oscuro: string
) {
  if (tono === "auto") {
    return {
      style: variablesTono(claro, oscuro),
      className: "fill-(--marca-claro) dark:fill-(--marca-oscuro)",
    }
  }
  return { fill: tono === "oscuro" ? oscuro : claro }
}
