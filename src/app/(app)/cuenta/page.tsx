import { redirect } from "next/navigation"

import { requerirPermiso } from "@/lib/auth/dal"
import { RUTA_PERFIL } from "@/lib/auth/navegacion"

/** `/cuenta` no tiene contenido propio: lleva a Perfil. */
export default async function PaginaCuenta() {
  await requerirPermiso("cuenta.gestionar")
  redirect(RUTA_PERFIL)
}
