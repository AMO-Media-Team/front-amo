"use client"

import { CheckCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { useConteoNoLeidas } from "../fuente"
import type { ConteoNoLeidas } from "../tipos"
import { useBandeja } from "./marco-bandeja"

/** «Marcar todas como leídas» del encabezado de la bandeja. */
export function BotonMarcarTodas({ inicial }: { inicial: ConteoNoLeidas }) {
  const { marcarTodas, marcandoTodas } = useBandeja()
  const conteo = useConteoNoLeidas(inicial)
  const { disponible, total } = conteo.data ?? inicial

  if (!disponible) return null
  return (
    <Button
      variant="outline"
      disabled={total === 0 || marcandoTodas}
      onClick={marcarTodas}
    >
      {marcandoTodas ? (
        <Spinner data-icon="inline-start" aria-hidden />
      ) : (
        <CheckCheck data-icon="inline-start" aria-hidden />
      )}
      Marcar todas como leídas
    </Button>
  )
}
