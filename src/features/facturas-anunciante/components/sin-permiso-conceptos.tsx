import { ListChecks } from "lucide-react"

import { TarjetaFicha } from "@/features/operacion/components/ficha"

/** Rol de la empresa sin `asignaciones.ver_propias`: los conceptos no se pueden leer. */
export function SinPermisoConceptos() {
  return (
    <TarjetaFicha titulo="Conceptos" icono={ListChecks}>
      <p className="text-sm text-pretty text-muted-foreground">
        Tu rol no permite ver el detalle de las publicaciones de las campañas.
        Pídele a quien administra la cuenta de tu empresa que te dé acceso al
        seguimiento si necesitas revisarlas; el PDF de la factura trae sus
        conceptos.
      </p>
    </TarjetaFicha>
  )
}
