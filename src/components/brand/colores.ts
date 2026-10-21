/**
 * Colores de marca en HEX (fuente única para SVG, iconos de app, imagen OG y
 * scripts). La UI usa los tokens CSS de globals.css; esto es para lo que se
 * pinta fuera de CSS (satori, SVG estáticos, Chart.js no entiende oklch).
 */
export const LILA = {
  50: "#F6F3FF",
  100: "#EDE7FE",
  200: "#DCD0FD",
  300: "#C3AEFB",
  400: "#A788F6",
  500: "#8C66EE",
  600: "#7549DE",
  700: "#6238BF",
  800: "#4F2F98",
  900: "#3F2A76",
  950: "#261848",
} as const

export const NEUTRO = {
  fondoOscuro: "#0E0B16",
  superficieOscura: "#15111F",
  elevadaOscura: "#1C1729",
  bordeOscuro: "#2A2338",
  fondoClaro: "#FAF9FD",
  superficieClara: "#FFFFFF",
  bordeClaro: "#E7E3F0",
} as const

export interface ParadaGradiente {
  readonly offset: number
  readonly color: string
}

/**
 * Aurora: índigo (abajo-izquierda, el lugar) → lila → orquídea (arriba-derecha,
 * la señal que se emite). Se aplica en diagonal ascendente sobre el isotipo.
 */
export const AURORA: readonly ParadaGradiente[] = [
  { offset: 0, color: "#5B6CF0" },
  { offset: 0.5, color: LILA[500] },
  { offset: 1, color: "#C77DFF" },
]

/** Aurora profunda: misma dirección, tonos más densos para fondos claros (contraste ≥ 3:1). */
export const AURORA_PROFUNDA: readonly ParadaGradiente[] = [
  { offset: 0, color: "#4453D6" },
  { offset: 0.5, color: LILA[600] },
  { offset: 1, color: "#9B4FE0" },
]

/**
 * Aurora de fondo para iconos con el isotipo en blanco: el extremo orquídea se
 * templa (#B06CF0) para que el blanco conserve ≥ 3:1 en todo el recorrido.
 */
export const AURORA_ICONO: readonly ParadaGradiente[] = [
  { offset: 0, color: "#5B6CF0" },
  { offset: 0.5, color: LILA[500] },
  { offset: 1, color: "#B06CF0" },
]

/** Colores de la palabra "amo" y del descriptor según el fondo. */
export const TINTA = {
  sobreOscuro: { palabra: LILA[50], descriptor: LILA[300] },
  sobreClaro: { palabra: LILA[950], descriptor: LILA[700] },
} as const

export function gradienteCss(
  paradas: readonly ParadaGradiente[],
  angulo = 45
): string {
  const tramos = paradas
    .map((p) => `${p.color} ${Math.round(p.offset * 100)}%`)
    .join(", ")
  return `linear-gradient(${angulo}deg, ${tramos})`
}
