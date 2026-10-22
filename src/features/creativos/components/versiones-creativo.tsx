"use client"

import type { VersionCreativo } from "../tipos"

export interface PropsVersionesCreativo {
  ofertaId: string
  versiones: readonly VersionCreativo[]
  /** Oferta publicada del propio anunciante (o modo asistido): puede preparar y activar una versión nueva. */
  puedeVersionar: boolean
}

/** STUB DEL LÍDER (fase 2): el paquete CR lo implementa. */
export function VersionesCreativo(_props: PropsVersionesCreativo) {
  return null
}
