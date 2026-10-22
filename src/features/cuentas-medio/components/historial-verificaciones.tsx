"use client"

import { ChevronDown, Eye, History } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { InsigniaTono } from "@/features/operacion/components/distintivos"
import { formatearFechaHora, formatearNumero } from "@/lib/format"

import {
  estadoIntento,
  METODOS_VERIFICACION,
  seguidoresIntento,
} from "../presentacion"
import type { VerificacionCuentaMedio } from "../tipos"

function Intento({
  verificacion,
  ahora,
  onVerCaptura,
}: {
  verificacion: VerificacionCuentaMedio
  ahora: Date
  onVerCaptura: (verificacion: VerificacionCuentaMedio) => void
}) {
  const estado = estadoIntento(verificacion, ahora)
  const observaciones = verificacion.observaciones?.trim()
  return (
    <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <time
          dateTime={verificacion.creadaAt}
          className="text-sm font-medium cifras"
        >
          {formatearFechaHora(verificacion.creadaAt)}
        </time>
        <InsigniaTono tono={estado.tono} etiqueta={estado.etiqueta} />
      </div>
      <p className="text-sm text-muted-foreground">
        {METODOS_VERIFICACION[verificacion.metodo].etiqueta} ·{" "}
        <span className="cifras">{seguidoresIntento(verificacion)}</span>
      </p>
      {observaciones ? (
        <p className="text-sm text-pretty">
          <span className="font-medium">Observaciones de AMO: </span>
          {observaciones}
        </p>
      ) : null}
      {verificacion.tieneCaptura ? (
        <Button
          type="button"
          variant="link"
          className="h-auto w-fit px-0"
          onClick={() => onVerCaptura(verificacion)}
        >
          <Eye data-icon="inline-start" aria-hidden />
          Ver la captura enviada
        </Button>
      ) : null}
    </li>
  )
}

/**
 * Intentos de verificación de la cuenta, del más reciente al más antiguo,
 * con su resultado, los seguidores y lo que observó el equipo de AMO.
 */
export function HistorialVerificaciones({
  verificaciones,
  ahora,
  onVerCaptura,
}: {
  verificaciones: readonly VerificacionCuentaMedio[]
  ahora: Date
  onVerCaptura: (verificacion: VerificacionCuentaMedio) => void
}) {
  if (verificaciones.length === 0) return null
  return (
    <Collapsible className="border-t pt-3">
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="group/historial -mx-2 h-9 w-[calc(100%+1rem)] justify-between px-2 text-muted-foreground"
          />
        }
      >
        <span className="flex items-center gap-2">
          <History aria-hidden />
          Historial de verificaciones
          <span className="cifras">
            ({formatearNumero(verificaciones.length)})
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className="transition-transform duration-200 group-aria-expanded/historial:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="flex flex-col divide-y pt-2">
          {verificaciones.map((verificacion) => (
            <Intento
              key={verificacion.id}
              verificacion={verificacion}
              ahora={ahora}
              onVerCaptura={onVerCaptura}
            />
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}
