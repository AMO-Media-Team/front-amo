"use client"

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useMemo,
  useState,
} from "react"

import { historialCambios } from "../actions"
import type { PermisosConfiguracion } from "../tipos"
import {
  HojaHistorial,
  type ObjetivoHistorial,
  type PedidoHistorial,
} from "./hoja-historial"

interface ContextoConfiguracion {
  permisos: PermisosConfiguracion
  /** Abre el historial de cambios de un registro; `null` si no hay permiso. */
  abrirHistorial: ((objetivo: ObjetivoHistorial) => void) | null
}

const Contexto = createContext<ContextoConfiguracion | null>(null)

function useContextoConfiguracion(): ContextoConfiguracion {
  const valor = use(Contexto)
  if (!valor) {
    throw new Error("Falta <ProveedorConfiguracion> en la página.")
  }
  return valor
}

/** Qué puede cambiar quien mira (la BD vuelve a exigirlo todo). */
export function usePermisosConfiguracion(): PermisosConfiguracion {
  return useContextoConfiguracion().permisos
}

/** Abre el historial (bitácora) de un registro; `null` sin `auditoria.ver`. */
export function useHistorial(): ContextoConfiguracion["abrirHistorial"] {
  return useContextoConfiguracion().abrirHistorial
}

/**
 * Contexto de cliente de la página: permisos de quien mira y una única hoja
 * de historial compartida por todas las filas (cada fila solo pide abrirla).
 * La consulta empieza en el clic, no al pintar la hoja.
 */
export function ProveedorConfiguracion({
  permisos,
  children,
}: {
  permisos: PermisosConfiguracion
  children: ReactNode
}) {
  const [pedido, setPedido] = useState<PedidoHistorial | null>(null)
  const [abierta, setAbierta] = useState(false)

  const abrir = useCallback((objetivo: ObjetivoHistorial) => {
    setPedido({
      objetivo,
      promesa: historialCambios({
        entidad: objetivo.entidad,
        entidadId: objetivo.entidadId,
      }),
    })
    setAbierta(true)
  }, [])

  const valor = useMemo<ContextoConfiguracion>(
    () => ({
      permisos,
      abrirHistorial: permisos.verAuditoria ? abrir : null,
    }),
    [permisos, abrir]
  )

  return (
    <Contexto value={valor}>
      {children}
      {permisos.verAuditoria ? (
        <HojaHistorial
          pedido={pedido}
          abierta={abierta}
          onAbiertaChange={setAbierta}
        />
      ) : null}
    </Contexto>
  )
}
