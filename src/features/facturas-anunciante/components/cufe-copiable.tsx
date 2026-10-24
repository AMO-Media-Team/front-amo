"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { abreviarCufe } from "../presentacion"

const DURACION_COPIADO_MS = 2000

/**
 * CUFE de una factura con un botón para copiarlo completo (lo piden el
 * software contable y la DIAN). Abreviado en listas; completo en la ficha,
 * partido donde haga falta para no desbordar el celular. «CUFE copiado» se
 * anuncia en una región viva; si el navegador no deja usar el portapapeles,
 * se muestra para copiarlo a mano.
 */
export function CufeCopiable({
  cufe,
  numero,
  completo = false,
  className,
}: {
  cufe: string
  /** Número de la factura: distingue el botón de cada fila para los lectores de pantalla. */
  numero: string
  completo?: boolean
  className?: string
}) {
  const [copiado, setCopiado] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(temporizador.current), [])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(cufe)
      setCopiado(true)
      clearTimeout(temporizador.current)
      temporizador.current = setTimeout(
        () => setCopiado(false),
        DURACION_COPIADO_MS
      )
    } catch {
      toast.info("Cópialo a mano", { description: cufe, duration: 15_000 })
    }
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 gap-1",
        completo ? "items-start gap-2" : "items-center",
        className
      )}
    >
      <code
        title={completo ? undefined : cufe}
        className={cn(
          "min-w-0 font-mono text-xs",
          completo
            ? "pt-1 break-all text-foreground/90"
            : "truncate text-muted-foreground"
        )}
      >
        {completo ? cufe : abreviarCufe(cufe)}
      </code>
      <Button
        type="button"
        variant={completo ? "outline" : "ghost"}
        size={completo ? "sm" : "icon-sm"}
        onClick={copiar}
        // Contiene lo que se ve («Copiar») y distingue cada fila.
        aria-label={`Copiar el CUFE de la factura ${numero}`}
        className="shrink-0"
      >
        {copiado ? (
          <Check aria-hidden className="text-success" />
        ) : (
          <Copy aria-hidden />
        )}
        {completo ? "Copiar" : null}
      </Button>
      <span role="status" className="sr-only">
        {copiado ? "CUFE copiado" : ""}
      </span>
    </span>
  )
}
