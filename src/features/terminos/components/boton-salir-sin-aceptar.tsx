"use client"

import { LogOut } from "lucide-react"

import { useCerrarSesion } from "@/components/layout/boton-cerrar-sesion"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** Cierra la sesión sin registrar nada: aceptar es siempre un acto explícito. */
export function BotonSalirSinAceptar() {
  const { cerrar, cerrando } = useCerrarSesion()

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={cerrar}
      disabled={cerrando}
      className="h-10 text-muted-foreground"
    >
      {cerrando ? (
        <Spinner aria-hidden data-icon="inline-start" />
      ) : (
        <LogOut aria-hidden data-icon="inline-start" />
      )}
      {cerrando ? "Cerrando sesión…" : "Salir sin aceptar"}
    </Button>
  )
}
