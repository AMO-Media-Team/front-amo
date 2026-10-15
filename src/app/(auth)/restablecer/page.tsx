import { KeyRound } from "lucide-react"
import type { Metadata } from "next"

import { EncabezadoAuth } from "@/features/auth/components/encabezado-auth"
import { FormularioNuevaContrasena } from "@/features/auth/components/formulario-nueva-contrasena"
import { requerirSesionDeEnlace } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Nueva contraseña" }

/**
 * Llega aquí desde el enlace de recuperación (`/auth/confirm` o
 * `/auth/callback`) con una sesión de recuperación reciente. Sin ella, el DAL
 * lleva al ingreso; si la cuenta tiene TOTP, antes a verificarlo.
 */
export default async function PaginaRestablecer() {
  await requerirSesionDeEnlace()

  return (
    <div className="flex flex-col gap-8">
      <EncabezadoAuth
        icono={KeyRound}
        titulo="Crea una contraseña nueva"
        descripcion="Elige una contraseña segura que no uses en otros sitios."
      />
      <FormularioNuevaContrasena variante="restablecer" />
    </div>
  )
}
