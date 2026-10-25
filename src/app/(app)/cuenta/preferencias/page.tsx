import type { Metadata } from "next"

import { TransicionPagina } from "@/components/motion/transicion-vista"
import { PanelPreferencias } from "@/features/cuenta/components/panel-preferencias"
import { categoriasConCorreo } from "@/features/cuenta/preferencias"
import { preferenciasPropias } from "@/features/cuenta/queries"
import { requerirPermiso } from "@/lib/auth/dal"
import { clavesCorreoActivas, envioCorreoHabilitado } from "@/lib/correo/estado"

export const metadata: Metadata = { title: "Preferencias" }

/**
 * Preferencias de interfaz y de avisos por correo: se guardan en la cuenta. El
 * panel muestra el estado real del correo: si el envío está encendido y qué
 * categorías tienen alguna plantilla de correo activa.
 */
export default async function PaginaPreferencias() {
  const usuario = await requerirPermiso("cuenta.gestionar")
  const [preferencias, correoHabilitado, clavesActivas] = await Promise.all([
    preferenciasPropias(usuario.id),
    envioCorreoHabilitado(),
    clavesCorreoActivas(),
  ])

  return (
    <TransicionPagina>
      <PanelPreferencias
        inicial={preferencias}
        correoHabilitado={correoHabilitado}
        categoriasConCorreo={categoriasConCorreo(clavesActivas)}
      />
    </TransicionPagina>
  )
}
