import { CircleAlert, CircleCheck } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Un requisito para pagar («Documento listo», «Datos de pago incompletos»):
 * icono y texto que se parte en dos líneas si hace falta (cabe en tablas a
 * 834 px). El icono es decorativo: el texto dice si se cumple.
 */
export function Requisito({
  cumplido,
  children,
  detalle,
}: {
  cumplido: boolean
  children: ReactNode
  /** Línea secundaria («Factura del medio», «Cuenta bancaria»). */
  detalle?: ReactNode
}) {
  const Icono = cumplido ? CircleCheck : CircleAlert
  return (
    <span className="flex min-w-0 items-start gap-1.5">
      <Icono
        aria-hidden
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          cumplido ? "text-success" : "text-warning"
        )}
      />
      <span className="flex min-w-0 flex-col leading-snug">
        <span
          className={cn(
            "text-pretty",
            cumplido ? "text-foreground" : "font-medium text-warning"
          )}
        >
          {children}
        </span>
        {detalle ? (
          <span className="text-xs text-muted-foreground">{detalle}</span>
        ) : null}
      </span>
    </span>
  )
}
