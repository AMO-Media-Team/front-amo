"use client"

import { LogOut } from "lucide-react"
import { type ComponentProps, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ACCIONES_AUTH } from "@/features/auth/components/acciones"

/** Tras cerrar sesión: recarga completa para descartar todo estado del cliente. */
const DESTINO_TRAS_CERRAR = "/ingresar?motivo=sesion-cerrada"

export function useCerrarSesion() {
  const [cerrando, iniciar] = useTransition()

  const cerrar = () =>
    iniciar(async () => {
      const resultado = await ACCIONES_AUTH.cerrarSesion()
      if (resultado.ok) {
        // Recarga completa a propósito (no router.push): descarta cachés del
        // router, formularios y estado cliente de la sesión que se cerró.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = DESTINO_TRAS_CERRAR
        return
      }
      toast.error("No pudimos cerrar la sesión", {
        description: resultado.error,
      })
    })

  return { cerrar, cerrando }
}

type BotonCerrarSesionProps = Omit<
  ComponentProps<typeof Button>,
  "onClick" | "children"
>

export function BotonCerrarSesion({
  variant = "ghost",
  disabled,
  ...props
}: BotonCerrarSesionProps) {
  const { cerrar, cerrando } = useCerrarSesion()

  return (
    <Button
      variant={variant}
      disabled={disabled || cerrando}
      onClick={cerrar}
      {...props}
    >
      {cerrando ? (
        <Spinner aria-hidden data-icon="inline-start" />
      ) : (
        <LogOut aria-hidden data-icon="inline-start" />
      )}
      {cerrando ? "Cerrando sesión…" : "Cerrar sesión"}
    </Button>
  )
}
