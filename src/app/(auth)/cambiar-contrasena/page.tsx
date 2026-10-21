import { ShieldCheck } from "lucide-react"
import type { Metadata } from "next"

import { BotonCerrarSesion } from "@/components/layout/boton-cerrar-sesion"
import { EncabezadoAuth } from "@/features/auth/components/encabezado-auth"
import { FormularioNuevaContrasena } from "@/features/auth/components/formulario-nueva-contrasena"
import { requerirPaso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Cambiar contraseña" }

/** Paso obligatorio del primer ingreso (o tras una contraseña temporal): compuerta 4 del DAL. */
export default async function PaginaCambiarContrasena() {
  await requerirPaso("cambiar-contrasena")

  return (
    <div className="flex flex-col gap-8">
      <EncabezadoAuth
        icono={ShieldCheck}
        titulo="Crea tu contraseña"
        descripcion="Por seguridad, reemplaza la contraseña temporal por una propia antes de continuar."
      />
      <FormularioNuevaContrasena variante="obligatoria" />
      <BotonCerrarSesion
        variant="ghost"
        className="self-center text-muted-foreground"
      />
    </div>
  )
}
