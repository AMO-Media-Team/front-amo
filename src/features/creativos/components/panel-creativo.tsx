"use client"

import type { EstadoCreativo, FormatoOferta } from "../tipos"

export interface PropsPanelCreativo {
  ofertaId: string
  formato: FormatoOferta
  editable: boolean
  alCambiar?: (estado: EstadoCreativo) => void
}

/** STUB DEL LÍDER (fase 2): el paquete CR lo implementa. */
export function PanelCreativo(_props: PropsPanelCreativo) {
  return null
}
