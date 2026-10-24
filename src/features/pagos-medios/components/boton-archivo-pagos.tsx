"use client"

import { FileSpreadsheet } from "lucide-react"
import { useId } from "react"

import { Button } from "@/components/ui/button"

import { MENSAJES_PAGOS } from "../errores"

/**
 * Botón que abre «Generar archivo de pagos». Sin el permiso «Ver datos
 * sensibles» queda deshabilitado pero enfocable y explica por qué antes de
 * llamar al servidor (el archivo revela los datos bancarios).
 */
export function BotonArchivoPagos({
  puedeVerDatosSensibles,
  onClick,
  children = "Generar archivo de pagos",
  size = "sm",
  explicacionVisible = false,
}: {
  puedeVerDatosSensibles: boolean
  onClick: () => void
  children?: string
  size?: "sm" | "default"
  /** Muestra la explicación bajo el botón (fuera de la barra de selección). */
  explicacionVisible?: boolean
}) {
  const idExplicacion = useId()
  const bloqueado = !puedeVerDatosSensibles
  return (
    <>
      <Button
        type="button"
        size={size}
        disabled={bloqueado}
        focusableWhenDisabled
        aria-describedby={bloqueado ? idExplicacion : undefined}
        title={bloqueado ? MENSAJES_PAGOS.sinDatosSensibles : undefined}
        // Enfocable aunque esté deshabilitado: no hay `:disabled` que lo atenúe.
        className="data-disabled:cursor-not-allowed data-disabled:opacity-50"
        onClick={onClick}
      >
        <FileSpreadsheet data-icon="inline-start" aria-hidden />
        {children}
      </Button>
      {bloqueado ? (
        <span
          id={idExplicacion}
          className={
            explicacionVisible
              ? "text-xs text-pretty text-muted-foreground"
              : "sr-only"
          }
        >
          {MENSAJES_PAGOS.sinDatosSensibles}
        </span>
      ) : null}
    </>
  )
}
