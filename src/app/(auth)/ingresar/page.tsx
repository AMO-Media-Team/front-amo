import type { Metadata } from "next"

import { EncabezadoAuth } from "@/features/auth/components/encabezado-auth"
import { FormularioIngreso } from "@/features/auth/components/formulario-ingreso"
import { mensajeDeMotivo } from "@/features/auth/components/motivos"
import { primerValor } from "@/features/auth/components/parametros"
import { rutaInternaSegura } from "@/lib/auth/navegacion"

export const metadata: Metadata = { title: "Ingresar" }

export default async function PaginaIngresar({
  searchParams,
}: PageProps<"/ingresar">) {
  const { next, motivo } = await searchParams
  const siguiente = rutaInternaSegura(primerValor(next)) ?? undefined

  return (
    <div className="flex flex-col gap-8">
      <EncabezadoAuth
        titulo="Te damos la bienvenida"
        descripcion="Ingresa con tu correo y contraseña para gestionar tu pauta en medios locales."
      />
      <FormularioIngreso
        siguiente={siguiente}
        aviso={mensajeDeMotivo(motivo)}
      />
    </div>
  )
}
