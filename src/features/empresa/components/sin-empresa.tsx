import { BriefcaseBusiness } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"

/** La cuenta no tiene empresa visible (sin vínculo o dada de baja). */
export function SinEmpresa() {
  return (
    <EstadoVacio
      icono={BriefcaseBusiness}
      titulo="Tu cuenta aún no está vinculada a una empresa"
      descripcion="Cuando el equipo de AMO la asocie a tu empresa, aquí verás sus datos, sus documentos y tu equipo."
      className="flex-none py-16"
    />
  )
}
