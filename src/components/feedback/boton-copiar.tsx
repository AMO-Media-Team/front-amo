"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const DURACION_COPIADO_MS = 2000

/**
 * Copia un texto con un toque (copy, hashtags, menciones, enlaces). El estado
 * «copiado» se anuncia en una región viva; si el navegador no deja usar el
 * portapapeles, muestra el texto para copiarlo a mano.
 */
export function BotonCopiar({
  texto,
  etiqueta,
  etiquetaCopiado = "Copiado",
  variante = "outline",
  tamano = "sm",
  className,
}: {
  texto: string
  /** Lo que se copia, dicho como acción: «Copiar los hashtags». */
  etiqueta: string
  etiquetaCopiado?: string
  variante?: "outline" | "default" | "secondary" | "ghost"
  tamano?: "sm" | "default" | "lg"
  className?: string
}) {
  const [copiado, setCopiado] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(temporizador.current), [])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      clearTimeout(temporizador.current)
      temporizador.current = setTimeout(
        () => setCopiado(false),
        DURACION_COPIADO_MS
      )
    } catch {
      toast.info("Cópialo a mano", { description: texto, duration: 15_000 })
    }
  }

  return (
    <Button
      type="button"
      variant={variante}
      size={tamano}
      onClick={copiar}
      disabled={texto.length === 0}
      className={cn(className)}
    >
      {copiado ? (
        <Check data-icon="inline-start" aria-hidden />
      ) : (
        <Copy data-icon="inline-start" aria-hidden />
      )}
      <span aria-live="polite">{copiado ? etiquetaCopiado : etiqueta}</span>
    </Button>
  )
}
