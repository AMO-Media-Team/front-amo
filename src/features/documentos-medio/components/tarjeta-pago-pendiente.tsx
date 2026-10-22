import type { Route } from "next"
import { ArrowRight, Wallet } from "lucide-react"
import { useId } from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { InsigniaTono } from "@/features/operacion/components/distintivos"

/** Datos de pago del medio (paquete MM). */
const RUTA_PAGO = "/mi-medio/pago" as Route

/**
 * El certificado del medio de pago depende de cómo quiere recibir los pagos
 * (cuenta bancaria o billetera): hasta registrarlo no se sabe cuál pedir.
 */
export function TarjetaPagoPendiente() {
  const id = useId()
  return (
    <li>
      <article
        aria-labelledby={id}
        className="flex flex-col gap-3 rounded-xl border border-dashed bg-card/60 p-4"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"
          >
            <Wallet className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 id={id} className="text-sm font-semibold">
                Certificado de tu medio de pago
              </h3>
              <InsigniaTono
                tono="neutro"
                etiqueta="Primero, tus datos de pago"
                className="h-5 px-2 text-[0.6875rem]"
              />
            </div>
            <p className="text-xs text-pretty text-muted-foreground">
              Registra si recibirás tus pagos en una cuenta bancaria o en una
              billetera digital. Luego te pediremos el certificado que
              corresponda.
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <EnlaceBoton href={RUTA_PAGO} variant="outline" size="lg">
            Registrar datos de pago
            <ArrowRight data-icon="inline-end" aria-hidden />
          </EnlaceBoton>
        </div>
      </article>
    </li>
  )
}
