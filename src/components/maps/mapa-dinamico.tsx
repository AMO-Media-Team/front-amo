"use client"

import dynamic from "next/dynamic"

import type { MapaCoropleticoProps } from "./mapa-coropletico"

/**
 * Mapbox solo en el cliente y en su propio fragmento: el resto de la app no
 * paga su peso (≈ 1 MB). El explorador muestra su carga hasta `onListo`.
 */
export const MapaDinamico = dynamic<MapaCoropleticoProps>(
  () => import("./mapa-coropletico"),
  { ssr: false }
)
