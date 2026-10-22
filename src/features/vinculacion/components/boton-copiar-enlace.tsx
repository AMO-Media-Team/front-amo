"use client"

import { Check, Link2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

const DURACION_COPIADO_MS = 2000

/**
 * Copia el enlace público del formulario `/vincular` para compartirlo con un
 * medio. Si el navegador no deja usar el portapapeles, muestra el enlace para
 * copiarlo a mano.
 */
export function BotonCopiarEnlace({
  url,
  variante = "outline",
}: {
  url: string
  variante?: "outline" | "default"
}) {
  const [copiado, setCopiado] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(temporizador.current), [])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      clearTimeout(temporizador.current)
      temporizador.current = setTimeout(
        () => setCopiado(false),
        DURACION_COPIADO_MS
      )
    } catch {
      toast.info("Copia el enlace del formulario", {
        description: url,
        duration: 15_000,
      })
    }
  }

  return (
    <Button
      type="button"
      variant={variante}
      size="lg"
      onClick={copiar}
      className="w-full sm:w-auto"
    >
      {copiado ? (
        <Check data-icon="inline-start" aria-hidden />
      ) : (
        <Link2 data-icon="inline-start" aria-hidden />
      )}
      <span aria-live="polite">
        {copiado ? "Enlace copiado" : "Copiar enlace del formulario"}
      </span>
    </Button>
  )
}
