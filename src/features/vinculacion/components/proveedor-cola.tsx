"use client"

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  type CredencialParaMostrar,
  DialogoCredencial,
} from "@/features/usuarios/components/dialogo-credencial"

import type { CapacidadesCola, RolMedioAsignable } from "../tipos"

/** Lo que las acciones de cada tarjeta necesitan (se carga una vez por cola). */
export interface DatosAccionesCola {
  capacidades: CapacidadesCola
  roles: readonly RolMedioAsignable[]
  /** `AMO_SMTP_CONFIGURADO`: la invitación la envía Supabase por correo. */
  smtpConfigurado: boolean
}

interface ContextoCola extends DatosAccionesCola {
  /** Muestra UNA vez la credencial de la persona invitada. */
  mostrarCredencial: (datos: CredencialParaMostrar) => void
  /**
   * Lleva el foco al resumen de la cola cuando llegue la lista nueva: la
   * tarjeta atendida, con el botón que tenía el foco, desaparece.
   */
  enfocarResumenTrasRepintar: () => void
}

const Contexto = createContext<ContextoCola | null>(null)

export function useColaSolicitudes(): ContextoCola {
  const valor = use(Contexto)
  if (!valor) {
    throw new Error("useColaSolicitudes requiere <ProveedorColaSolicitudes>.")
  }
  return valor
}

function enfocar(id: string): void {
  // Dos cuadros: primero se desmonta el diálogo y el navegador suelta el foco.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.getElementById(id)?.focus())
  )
}

/**
 * Estado de la cola que debe sobrevivir a la tarjeta de una solicitud: al
 * invitar, la solicitud sale de la lista (la acción repinta la cola), pero el
 * enlace o la contraseña aún deben mostrarse. Vive por encima de la lista y no
 * se desmonta con el repintado.
 */
export function ProveedorColaSolicitudes({
  datos,
  idResumen,
  children,
}: {
  datos: DatosAccionesCola
  /** Id del resumen de la cola (con `tabIndex={-1}`) que recibe el foco. */
  idResumen: string
  children: ReactNode
}) {
  const [credencial, setCredencial] = useState<CredencialParaMostrar | null>(
    null
  )
  const focoPendiente = useRef(false)

  const enfocarResumenTrasRepintar = useCallback(() => {
    focoPendiente.current = true
  }, [])

  // La lista nueva llega con el repintado de la acción (nuevos `children`).
  useEffect(() => {
    if (!focoPendiente.current) return
    focoPendiente.current = false
    enfocar(idResumen)
  }, [children, idResumen])

  const valor = useMemo<ContextoCola>(
    () => ({
      ...datos,
      mostrarCredencial: setCredencial,
      enfocarResumenTrasRepintar,
    }),
    [datos, enfocarResumenTrasRepintar]
  )

  return (
    <Contexto value={valor}>
      {children}
      <DialogoCredencial
        datos={credencial}
        onCerrar={() => {
          setCredencial(null)
          enfocar(idResumen)
        }}
      />
    </Contexto>
  )
}
