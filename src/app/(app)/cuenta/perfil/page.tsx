import type { Metadata } from "next"

import { TransicionPagina } from "@/components/motion/transicion-vista"
import { CabeceraPerfil } from "@/features/cuenta/components/cabecera-perfil"
import { FormularioPerfil } from "@/features/cuenta/components/formulario-perfil"
import { avataresDisponibles, perfilPropio } from "@/features/cuenta/queries"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Mi perfil" }

/** Perfil propio: identidad con foto y datos personales editables. */
export default async function PaginaPerfil() {
  const usuario = await requerirPermiso("cuenta.gestionar")
  const [perfil, disponibles] = await Promise.all([
    perfilPropio(usuario),
    avataresDisponibles(),
  ])

  return (
    <TransicionPagina>
      <div className="flex flex-col gap-6">
        <CabeceraPerfil perfil={perfil} avataresDisponibles={disponibles} />
        <FormularioPerfil perfil={perfil} />
      </div>
    </TransicionPagina>
  )
}
