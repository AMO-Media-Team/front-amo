/** Tipos del mapa coroplético compartidos con módulos puros (sin cargar Mapbox). */
import type { Bbox, Posicion } from "@/lib/geo/tipos"

export type Encuadre =
  | {
      readonly tipo: "centro"
      readonly centro: Posicion
      readonly zoom: number
    }
  | { readonly tipo: "limites"; readonly bbox: Bbox }

export interface MargenMapa {
  readonly top: number
  readonly bottom: number
  readonly left: number
  readonly right: number
}

export interface CirculoMapa {
  readonly codigo: string
  readonly centro: Posicion
}

/** Punto con peso para el mapa de calor: [longitud, latitud, peso]. */
export type PuntoPeso = readonly [number, number, number]

export interface ApiMapa {
  /** Vuelve al encuadre del nivel (animado). */
  recentrar(): void
  acercar(): void
  alejar(): void
  /** Copia del lienzo tal como se ve (captura en el evento `render`). */
  capturar(): Promise<HTMLCanvasElement | null>
}
