import type { Metadata } from "next"

import { TransicionPagina } from "@/components/motion/transicion-vista"
import { PanelPreferencias } from "@/features/cuenta/components/panel-preferencias"
import { preferenciasPropias } from "@/features/cuenta/queries"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Preferencias" }

/** Preferencias de interfaz: se aplican en caliente y se guardan en la cuenta. */
export default async function PaginaPreferencias() {
  const usuario = await requerirPermiso("cuenta.gestionar")
  const preferencias = await preferenciasPropias(usuario.id)

  return (
    <TransicionPagina>
      <PanelPreferencias inicial={preferencias} />
    </TransicionPagina>
  )
}
