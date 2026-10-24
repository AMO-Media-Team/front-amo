import type { Metadata } from "next"

import { TransicionPagina } from "@/components/motion/transicion-vista"
import { PanelPreferencias } from "@/features/cuenta/components/panel-preferencias"
import { preferenciasPropias } from "@/features/cuenta/queries"
import { requerirPermiso } from "@/lib/auth/dal"
import { envioCorreoHabilitado } from "@/lib/correo/estado"

export const metadata: Metadata = { title: "Preferencias" }

/** Preferencias de interfaz y de avisos por correo: se guardan en la cuenta. */
export default async function PaginaPreferencias() {
  const usuario = await requerirPermiso("cuenta.gestionar")
  const [preferencias, correoHabilitado] = await Promise.all([
    preferenciasPropias(usuario.id),
    envioCorreoHabilitado(),
  ])

  return (
    <TransicionPagina>
      <PanelPreferencias
        inicial={preferencias}
        correoHabilitado={correoHabilitado}
      />
    </TransicionPagina>
  )
}
