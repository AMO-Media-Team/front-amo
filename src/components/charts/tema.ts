/**
 * Tema de los gráficos: colores HEX leídos de los tokens CSS del tema activo
 * (`--chart-*`, `--card`, `--foreground`…) con respaldo en las constantes de
 * `paleta.ts` si un token falta o deja de ser HEX. Módulo puro: la lectura del
 * DOM la hace `useTemaGraficos`.
 */
import type { EstiloLienzo } from "@/lib/export/imagen"

import {
  ATENUADO,
  CATEGORICA,
  esHex,
  mezclar,
  type ModoTema,
  ORDINAL,
  SECUENCIAL,
} from "./paleta"

export interface TemaGraficos {
  modo: ModoTema
  categorica: readonly string[]
  ordinal: readonly string[]
  secuencial: readonly string[]
  /** Celda o segmento sin datos (distinto de la primera clase secuencial). */
  vacio: string
  /** Periodo anterior, "Otros" y contexto. */
  atenuado: string
  /** Superficie de la tarjeta: separaciones de 2 px y anillos de marcadores. */
  superficie: string
  texto: string
  textoSecundario: string
  /** Líneas de rejilla: finas, un paso sobre la superficie. */
  rejilla: string
  /** Línea base / eje. */
  eje: string
  primario: string
  exito: string
  aviso: string
  peligro: string
  fuente: string
  reducirMovimiento: boolean
  /** `devicePixelRatio` del lienzo; sin valor, el de la pantalla. */
  densidad?: number
  /**
   * Dibujo para una imagen (captura para documentos): lo que en pantalla es
   * HTML superpuesto, como el total de la dona, se pinta en el lienzo.
   */
  captura?: boolean
}

/** Colores y fuente para componer la imagen exportada de un gráfico. */
export function estiloLienzo(tema: TemaGraficos): EstiloLienzo {
  return {
    superficie: tema.superficie,
    texto: tema.texto,
    textoSecundario: tema.textoSecundario,
    fuente: tema.fuente,
  }
}

/** Lee un token CSS (`--nombre`) del tema activo. */
export type LectorToken = (variable: `--${string}`) => string

const RESPALDO: Readonly<
  Record<
    ModoTema,
    {
      superficie: string
      texto: string
      textoSecundario: string
      borde: string
      muted: string
      primario: string
      exito: string
      aviso: string
      peligro: string
    }
  >
> = {
  claro: {
    superficie: "#ffffff",
    texto: "#1b1528",
    textoSecundario: "#615a75",
    borde: "#e7e3f0",
    muted: "#f2f0f7",
    primario: "#7549de",
    exito: "#0b7a55",
    aviso: "#a35400",
    peligro: "#aa1c3a",
  },
  oscuro: {
    superficie: "#15111f",
    texto: "#f2effa",
    textoSecundario: "#a59eb8",
    borde: "#2a2338",
    muted: "#241d35",
    primario: "#a788f6",
    exito: "#34d399",
    aviso: "#fbbf24",
    peligro: "#ff9aa6",
  },
}

export const FUENTE_RESPALDO =
  "Geist, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"

function hexONulo(valor: string | undefined): string | null {
  const limpio = valor?.trim().toLowerCase() ?? ""
  return esHex(limpio) ? limpio : null
}

interface EntradaTema {
  modo: ModoTema
  leer?: LectorToken
  fuente?: string
  reducirMovimiento?: boolean
}

/**
 * Construye el tema desde los tokens. Sin lector (servidor, pruebas) usa las
 * constantes, que reflejan los mismos valores de globals.css.
 */
export function construirTemaGraficos({
  modo,
  leer,
  fuente,
  reducirMovimiento = false,
}: EntradaTema): TemaGraficos {
  const respaldo = RESPALDO[modo]
  const token = (variable: `--${string}`, porDefecto: string) =>
    hexONulo(leer?.(variable)) ?? porDefecto

  const superficie = token("--card", respaldo.superficie)
  const borde = token("--border", respaldo.borde)
  const categorica = CATEGORICA[modo].map((color, i) =>
    token(`--chart-${i + 1}`, color)
  )

  return {
    modo,
    categorica,
    ordinal: ORDINAL[modo],
    secuencial: SECUENCIAL[modo],
    vacio: token("--muted", respaldo.muted),
    atenuado: ATENUADO[modo],
    superficie,
    texto: token("--foreground", respaldo.texto),
    textoSecundario: token("--muted-foreground", respaldo.textoSecundario),
    // La rejilla queda a medio camino entre el borde y la superficie: recesiva.
    rejilla: mezclar(borde, superficie, 0.35),
    eje: borde,
    primario: token("--primary", respaldo.primario),
    exito: token("--success", respaldo.exito),
    aviso: token("--warning", respaldo.aviso),
    peligro: token("--destructive", respaldo.peligro),
    fuente: fuente?.trim() || FUENTE_RESPALDO,
    reducirMovimiento,
  }
}
