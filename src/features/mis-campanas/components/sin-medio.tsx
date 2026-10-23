import { RadioTower } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"

/** La cuenta no tiene medio visible (sin vínculo o dado de baja). */
export function SinMedioCampanas() {
  return (
    <EstadoVacio
      icono={RadioTower}
      titulo="Tu cuenta aún no está vinculada a un medio"
      descripcion="Cuando el equipo AMO la asocie a tu medio, aquí verás las campañas que aceptes, qué publicar y para cuándo."
      className="flex-none py-16"
    />
  )
}
