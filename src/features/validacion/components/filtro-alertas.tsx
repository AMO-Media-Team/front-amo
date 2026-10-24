"use client"

import { useQueryStates } from "nuqs"
import { useId, useTransition } from "react"

import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { formatearNumero } from "@/lib/format"

import { parsersValidacion } from "../colas"

/**
 * «Solo con alertas» de la cola de métricas (ADM-008). Va en la URL
 * (`?alertas=true`, se comparte y sobrevive al recargar) y vuelve a la
 * primera página al cambiar.
 */
export function FiltroAlertas({ conAlerta }: { conAlerta: number | null }) {
  const id = useId()
  const idAyuda = useId()
  const [cargando, iniciar] = useTransition()
  const [{ alertas }, fijar] = useQueryStates(parsersValidacion, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="flex h-10 items-center gap-2.5">
        <Switch
          id={id}
          checked={alertas}
          aria-describedby={idAyuda}
          onCheckedChange={(marcado) =>
            void fijar({ alertas: marcado || null, pagina: null })
          }
        />
        <Label htmlFor={id} className="text-sm font-normal">
          Solo con alertas
        </Label>
        {cargando ? <Spinner aria-label="Actualizando la cola" /> : null}
      </div>
      <p id={idAyuda} className="text-xs text-muted-foreground">
        {conAlerta === null
          ? "Desviación frente al histórico de la cuenta o alcance excesivo frente a sus seguidores."
          : conAlerta === 0
            ? "Ninguna métrica pendiente tiene alerta."
            : `${conAlerta === 1 ? "1 métrica pendiente tiene" : `${formatearNumero(conAlerta)} métricas pendientes tienen`} alerta.`}
      </p>
    </div>
  )
}
