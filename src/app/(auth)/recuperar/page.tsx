import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { EncabezadoAuth } from "@/features/auth/components/encabezado-auth"
import { FormularioRecuperacion } from "@/features/auth/components/formulario-recuperacion"

export const metadata: Metadata = { title: "Recuperar contraseña" }

export default function PaginaRecuperar() {
  return (
    <div className="flex flex-col gap-8">
      <EncabezadoAuth
        titulo="Recupera tu contraseña"
        descripcion="Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva."
      />
      <FormularioRecuperacion />
      <Link
        href="/ingresar"
        className="inline-flex items-center gap-1.5 self-center rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:anillo-foco"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver a ingresar
      </Link>
    </div>
  )
}
