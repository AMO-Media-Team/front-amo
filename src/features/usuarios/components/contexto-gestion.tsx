"use client"

import { createContext, type ReactNode, use, useMemo } from "react"

import type { ActorUsuarios, Organizaciones, RolAsignable } from "../tipos"

export interface DatosGestionUsuarios {
  actor: ActorUsuarios
  /** `roles_asignables` del actor (anti-escalada calculada en la BD). */
  rolesAsignables: readonly RolAsignable[]
  organizaciones: Organizaciones
  /** `AMO_SMTP_CONFIGURADO`: la invitación la envía Supabase por correo. */
  smtpConfigurado: boolean
}

interface GestionUsuarios extends DatosGestionUsuarios {
  rolesGestionables: ReadonlySet<string>
}

const ContextoGestion = createContext<GestionUsuarios | null>(null)

/**
 * Datos que las acciones de Usuarios necesitan en el cliente (quién actúa,
 * qué roles puede asignar, organizaciones). Los carga el servidor una vez por
 * página y evita pasarlos por cada celda de la tabla.
 */
export function ProveedorGestionUsuarios({
  datos,
  children,
}: {
  datos: DatosGestionUsuarios
  children: ReactNode
}) {
  const valor = useMemo(
    () => ({
      ...datos,
      rolesGestionables: new Set(datos.rolesAsignables.map((rol) => rol.id)),
    }),
    [datos]
  )
  return <ContextoGestion value={valor}>{children}</ContextoGestion>
}

export function useGestionUsuarios(): GestionUsuarios {
  const valor = use(ContextoGestion)
  if (!valor) {
    throw new Error("useGestionUsuarios requiere <ProveedorGestionUsuarios>.")
  }
  return valor
}
