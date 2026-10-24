import type { Tono } from "@/features/operacion/estados"
import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import { cn } from "@/lib/utils"

import { ESTADOS_FACTURA_ANUNCIANTE } from "../presentacion"
import type { EstadoFactura, PlazoFactura } from "../tipos"

/** Estado de la factura en voz de la empresa («Por pagar», «Vencida»…). */
export function InsigniaFactura({
  estado,
  className,
}: {
  estado: EstadoFactura
  className?: string
}) {
  return (
    <InsigniaEstado
      catalogo={ESTADOS_FACTURA_ANUNCIANTE}
      estado={estado}
      className={className}
    />
  )
}

const TEXTO_TONO: Readonly<Record<Tono, string>> = {
  exito: "text-success",
  info: "text-info",
  aviso: "text-warning",
  peligro: "text-destructive",
  neutro: "text-muted-foreground",
}

/** «Vence en 5 días» / «Venció hace 12 días», con el tono de su urgencia. */
export function TextoPlazo({
  plazo,
  className,
}: {
  plazo: PlazoFactura
  className?: string
}) {
  return (
    <span
      className={cn(
        "text-[0.6875rem] font-medium",
        TEXTO_TONO[plazo.tono],
        className
      )}
    >
      {plazo.texto}
    </span>
  )
}
