import { RadioTower } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"

/** La cuenta no tiene medio visible (sin vínculo o dado de baja). */
export function SinMedio() {
  return (
    <EstadoVacio
      icono={RadioTower}
      titulo="Tu cuenta aún no está vinculada a un medio"
      descripcion="Cuando el equipo de AMO la asocie a tu medio, aquí completarás tu perfil, tus documentos y tus datos de pago."
      className="flex-none py-16"
    />
  )
}
