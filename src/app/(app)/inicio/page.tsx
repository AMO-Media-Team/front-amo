import type { Metadata } from "next"

import { PanelInicio } from "@/features/dashboard/components/panel-inicio"
import { cargarValoresPeriodo } from "@/features/dashboard/periodo"
import { requerirUsuario } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Inicio" }

/**
 * Inicio: el panel que corresponde al tipo de rol (interno, anunciante o
 * medio), con el periodo en la URL (`?periodo=` o `desde`/`hasta`).
 *
 * Es el destino tras ingresar y el de «Ir al inicio» del 403, así que entra
 * toda cuenta con sesión vigente: exigir aquí un permiso `inicio.*` dejaría a
 * un rol personalizado sin él en un 403 sin salida. El permiso decide qué
 * panel se pinta (`panelPara`; sin él, un estado vacío) y cada RPC lo vuelve a
 * exigir en la base de datos.
 */
export default async function PaginaInicio({
  searchParams,
}: PageProps<"/inicio">) {
  const usuario = await requerirUsuario()
  const valores = await cargarValoresPeriodo(searchParams)
  return <PanelInicio usuario={usuario} valores={valores} />
}
