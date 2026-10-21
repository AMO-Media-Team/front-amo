import { BellRing } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"

import type { FiltrosBandeja } from "../esquemas"
import { listarNotificaciones } from "../queries"
import { BandejaNotificaciones } from "./bandeja-notificaciones"

/**
 * Primera página de la bandeja (Server Component, dentro de `<Suspense>`).
 * La lista del cliente se vuelve a montar con cada combinación de filtros.
 */
export async function SeccionBandeja({ filtros }: { filtros: FiltrosBandeja }) {
  const pagina = await listarNotificaciones(filtros)

  if (!pagina.disponible) {
    return (
      <EstadoVacio
        icono={BellRing}
        className="flex-none rounded-2xl py-16"
        titulo="Tu bandeja estará lista muy pronto"
        descripcion="Aquí recibirás avisos de ofertas, asignaciones, pagos y de la seguridad de tu cuenta. Mientras tanto, no te perderás nada importante."
      />
    )
  }
  return (
    <BandejaNotificaciones
      key={`${filtros.estado}:${filtros.categoria ?? "todas"}`}
      filtros={filtros}
      inicial={pagina}
    />
  )
}
