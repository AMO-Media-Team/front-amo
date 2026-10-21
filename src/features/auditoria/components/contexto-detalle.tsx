"use client"

import { useQueryState } from "nuqs"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import { parseAsEvento } from "../estado-bitacora"
import type { EventoBitacora } from "../tipos"
import { PanelDetalleEvento } from "./panel-detalle-evento"

interface ContextoDetalle {
  abrir: (evento: EventoBitacora) => void
  seleccionadoId: number | null
}

const Contexto = createContext<ContextoDetalle | null>(null)

export function useDetalleEvento(): ContextoDetalle {
  const valor = useContext(Contexto)
  if (!valor) {
    throw new Error(
      "useDetalleEvento debe usarse dentro de ProveedorDetalleEvento."
    )
  }
  return valor
}

/**
 * Panel de detalle de la bitácora. El evento abierto va en la URL
 * (`?evento=123`, sin viaje al servidor) para compartirlo y cerrarlo con
 * "atrás"; al cargar la página con ese parámetro, el servidor lo precarga
 * (`eventoInicial`). El panel es modal: solo hay un evento abierto a la vez.
 */
export function ProveedorDetalleEvento({
  eventoInicial,
  children,
}: {
  eventoInicial: EventoBitacora | null
  children: ReactNode
}) {
  const [eventoId, setEventoId] = useQueryState(
    "evento",
    parseAsEvento.withOptions({ history: "push", scroll: false })
  )
  const [ultimo, setUltimo] = useState<EventoBitacora | null>(eventoInicial)

  const abrir = useCallback(
    (evento: EventoBitacora) => {
      setUltimo(evento)
      void setEventoId(evento.id)
    },
    [setEventoId]
  )

  const abierto = eventoId !== null && ultimo?.id === eventoId
  const valor = useMemo(
    () => ({ abrir, seleccionadoId: abierto ? eventoId : null }),
    [abrir, abierto, eventoId]
  )

  return (
    <Contexto.Provider value={valor}>
      {children}
      <PanelDetalleEvento
        // Conserva el último evento mientras se anima el cierre.
        evento={ultimo}
        abierto={abierto}
        onAbiertoChange={(siguiente) => {
          if (!siguiente) void setEventoId(null)
        }}
      />
    </Contexto.Provider>
  )
}
