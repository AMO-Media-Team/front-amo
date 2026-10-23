import type { Metadata } from "next"
import { redirect } from "next/navigation"

import {
  destinoDe,
  ENTIDADES_CON_RELACIONADOS,
  esEntidadEnlace,
} from "@/features/enlaces/destinos"
import { relacionadosDe } from "@/features/enlaces/queries"
import { requerirUsuario } from "@/lib/auth/dal"
import { RUTA_NOTIFICACIONES } from "@/lib/auth/navegacion"

export const metadata: Metadata = { title: "Abriendo…" }

/** uuid de las filas de negocio, o el id numérico de un acceso. */
const ID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{1,19})$/i

/**
 * Resolvedor de los enlaces de notificación: lleva a la pantalla de la entidad
 * que corresponde al rol de quien la abre. Si la fila ya no existe o no es
 * visible para la persona, vuelve a la bandeja de notificaciones.
 */
export default async function PaginaIr({
  params,
}: PageProps<"/ir/[entidad]/[id]">) {
  const usuario = await requerirUsuario()
  const { entidad, id: crudo } = await params
  const id = decodeURIComponent(crudo)
  if (!esEntidadEnlace(entidad) || !ID.test(id)) redirect(RUTA_NOTIFICACIONES)

  const leidos = ENTIDADES_CON_RELACIONADOS.includes(entidad)
    ? await relacionadosDe(entidad, id)
    : {}
  // Interno: si no ve la fila, no hay destino. Externo: la RLS puede ocultarle
  // la fila (al medio, la oferta) y su destino no la necesita.
  const relacionados = leidos ?? (usuario.rol.tipo === "ADMIN" ? null : {})
  const destino = relacionados
    ? destinoDe(
        entidad,
        id,
        { tipoRol: usuario.rol.tipo, permisos: usuario.permisos },
        relacionados
      )
    : null
  redirect(destino ?? RUTA_NOTIFICACIONES)
}
