import { ShieldCheck } from "lucide-react"
import type { Metadata } from "next"

import { BotonCerrarSesion } from "@/components/layout/boton-cerrar-sesion"
import { EncabezadoAuth } from "@/features/auth/components/encabezado-auth"
import { FormularioVerificacionMfa } from "@/features/auth/components/formulario-verificacion-mfa"
import { primerValor } from "@/features/auth/components/parametros"
import { requerirPaso } from "@/lib/auth/dal"
import { rutaInternaSegura } from "@/lib/auth/navegacion"

export const metadata: Metadata = { title: "Verificar identidad" }

/** Compuerta 3 del DAL: la cuenta tiene un factor verificado y la sesión sigue en aal1. */
export default async function PaginaVerificarMfa({
  searchParams,
}: PageProps<"/mfa/verificar">) {
  const { next } = await searchParams
  const siguiente = rutaInternaSegura(primerValor(next)) ?? undefined
  await requerirPaso("mfa-verificar", { siguiente })

  return (
    <div className="flex flex-col gap-8">
      <EncabezadoAuth
        icono={ShieldCheck}
        titulo="Confirma que eres tú"
        descripcion="Abre tu app autenticadora y escribe el código de 6 dígitos de AMO."
      />
      <FormularioVerificacionMfa siguiente={siguiente} />
      <div className="flex flex-col items-center gap-3 border-t pt-6 text-center">
        <p className="text-sm text-muted-foreground">
          ¿Perdiste acceso a tu app? Pide a un administrador de AMO que
          restablezca tu verificación en dos pasos.
        </p>
        <BotonCerrarSesion variant="ghost" className="text-muted-foreground" />
      </div>
    </div>
  )
}
