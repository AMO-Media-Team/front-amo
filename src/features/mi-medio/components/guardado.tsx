"use client"

import { CircleCheck, Undo2 } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { type ReactNode, useState } from "react"

import { useGuardiaSalida } from "@/components/asistente/use-guardia-salida"
import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/**
 * Barra pegajosa al pie del formulario mientras haya cambios: al alcance del
 * pulgar en el celular (sobre la barra inferior, con `--reserva-inferior`) y
 * a la vista en pantallas grandes sin bajar hasta el final. Va DENTRO del
 * `<form>`: «Guardar» es su botón de envío. Ningún ancestro debe tener
 * `overflow: hidden` (anula el `sticky`).
 */
export function BarraGuardar({
  visible,
  pendiente,
  onDescartar,
  textoGuardar = "Guardar cambios",
  nota = "Tienes cambios sin guardar.",
}: {
  visible: boolean
  pendiente: boolean
  onDescartar: () => void
  textoGuardar?: string
  nota?: ReactNode
}) {
  if (!visible) return null
  return (
    <div className="pointer-events-none sticky bottom-[calc(var(--reserva-inferior,env(safe-area-inset-bottom))+0.75rem)] z-20 flex animate-aparecer-arriba justify-center">
      <div
        role="region"
        aria-label="Cambios sin guardar"
        className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border bg-popover/95 p-2 pl-4 shadow-2xl ring-1 ring-foreground/5 backdrop-blur-xl"
      >
        <span aria-hidden className="relative flex size-2.5 shrink-0">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/60 motion-reduce:animate-none" />
          <span className="relative size-2.5 rounded-full bg-primary" />
        </span>
        <p className="min-w-0 flex-1 text-sm">{nota}</p>
        <div className="flex items-center gap-1.5 max-sm:w-full max-sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={pendiente}
            onClick={onDescartar}
          >
            <Undo2 data-icon="inline-start" aria-hidden />
            Descartar
          </Button>
          <Button type="submit" disabled={pendiente} className="max-sm:flex-1">
            {pendiente ? (
              <Spinner data-icon="inline-start" aria-hidden />
            ) : (
              <CircleCheck data-icon="inline-start" aria-hidden />
            )}
            {pendiente ? "Guardando…" : textoGuardar}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Pide confirmación antes de salir con cambios sin guardar (enlaces internos,
 * recarga o cierre de la pestaña). Devuelve el diálogo que hay que pintar.
 */
export function useSalidaSinGuardar(sucio: boolean): ReactNode {
  const router = useRouter()
  const [destino, setDestino] = useState<string | null>(null)
  useGuardiaSalida(sucio, setDestino)
  return (
    <DialogoConfirmacion
      abierto={destino !== null}
      onAbiertoChange={(abierto) => {
        if (!abierto) setDestino(null)
      }}
      titulo="¿Salir sin guardar?"
      descripcion="Tienes cambios que aún no guardas. Si sales ahora, se pierden."
      textoConfirmar="Salir sin guardar"
      textoCancelar="Seguir editando"
      destructivo
      onConfirmar={() => {
        if (destino) router.push(destino as Route)
      }}
    />
  )
}
