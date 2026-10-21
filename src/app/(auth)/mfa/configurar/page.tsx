import { Smartphone } from "lucide-react"
import type { Metadata } from "next"

import { BotonCerrarSesion } from "@/components/layout/boton-cerrar-sesion"
import { ConfiguracionMfa } from "@/features/auth/components/configuracion-mfa"
import { EncabezadoAuth } from "@/features/auth/components/encabezado-auth"
import { requerirPaso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Verificación en dos pasos" }

/** Compuerta 5 del DAL: el rol exige MFA y la cuenta aún no tiene factor. */
export default async function PaginaConfigurarMfa() {
  await requerirPaso("mfa-configurar")

  return (
    <div className="flex flex-col gap-8">
      <EncabezadoAuth
        icono={Smartphone}
        titulo="Activa la verificación en dos pasos"
        descripcion="Tu rol maneja información sensible: además de la contraseña, pediremos un código de tu celular al ingresar."
      />
      <ConfiguracionMfa />
      <BotonCerrarSesion
        variant="ghost"
        className="self-center text-muted-foreground"
      />
    </div>
  )
}
