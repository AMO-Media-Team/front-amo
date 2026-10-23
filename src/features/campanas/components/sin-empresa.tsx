import { Building2 } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"

/** Cuenta de anunciante aún sin empresa asociada: no hay campañas que mostrar. */
export function SinEmpresa() {
  return (
    <EstadoVacio
      icono={Building2}
      titulo="Tu cuenta aún no está vinculada a una empresa"
      descripcion="Cuando el equipo de AMO la asocie a tu empresa podrás crear y gestionar sus campañas."
      className="flex-none py-16"
    />
  )
}
