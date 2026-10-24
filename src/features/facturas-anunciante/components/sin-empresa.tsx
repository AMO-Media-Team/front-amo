import { Building2 } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"

/** Cuenta de anunciante aún sin empresa asociada: no hay facturas que mostrar. */
export function SinEmpresaFacturas() {
  return (
    <EstadoVacio
      icono={Building2}
      titulo="Tu cuenta aún no está vinculada a una empresa"
      descripcion="Cuando el equipo de AMO la asocie a tu empresa verás aquí sus facturas, sus pagos y lo que queda por pagar."
      className="flex-none py-16"
    />
  )
}
