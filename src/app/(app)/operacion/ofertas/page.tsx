import type { Route } from "next"
import { redirect } from "next/navigation"

import { RUTA_MODERACION } from "@/features/moderacion/cola"
import { RUTAS_OPERACION } from "@/features/operacion/rutas"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

/**
 * `/operacion/ofertas` no tiene listado propio: existe para que las migas de
 * la ficha `/operacion/ofertas/[id]` enlacen a algo útil. Quien modera va a
 * la cola; quien solo consulta, a las campañas (donde están sus ofertas).
 */
export default async function PaginaOfertas() {
  const usuario = await requerirPermiso("ofertas.ver")
  const destino: Route = tieneAlgunPermiso(usuario, ["ofertas.moderar"])
    ? RUTA_MODERACION
    : tieneAlgunPermiso(usuario, ["campanas.ver"])
      ? RUTAS_OPERACION.campanas
      : "/inicio"
  redirect(destino)
}
