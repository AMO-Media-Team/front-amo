import { ScrollText } from "lucide-react"
import type { Metadata } from "next"

import { EncabezadoAuth } from "@/features/auth/components/encabezado-auth"
import { primerValor } from "@/features/auth/components/parametros"
import { VistaMarkdown } from "@/features/configuracion/components/vista-markdown"
import { BotonSalirSinAceptar } from "@/features/terminos/components/boton-salir-sin-aceptar"
import { FormularioTerminos } from "@/features/terminos/components/formulario-terminos"
import {
  documentosPorAceptar,
  encabezadoTerminos,
} from "@/features/terminos/presentacion"
import { tiposAceptadosAntes } from "@/features/terminos/queries"
import { requerirPaso } from "@/lib/auth/dal"
import { rutaInternaSegura } from "@/lib/auth/navegacion"

export const metadata: Metadata = { title: "Términos y condiciones" }

/**
 * Compuerta 6 del DAL (AUT-012): un usuario externo con versiones vigentes de
 * términos sin aceptar. Los documentos son los que evaluó la compuerta en esta
 * misma solicitud; su texto se pinta aquí (Markdown mínimo, sin HTML crudo).
 */
export default async function PaginaAceptarTerminos({
  searchParams,
}: PageProps<"/aceptar-terminos">) {
  const { next } = await searchParams
  const siguiente = rutaInternaSegura(primerValor(next)) ?? undefined
  const acceso = await requerirPaso("aceptar-terminos", { siguiente })

  const textos = new Map(
    acceso.terminosPorAceptar.map(({ id, contenidoMd }) => [id, contenidoMd])
  )
  const documentos = documentosPorAceptar(
    acceso.terminosPorAceptar,
    await tiposAceptadosAntes(acceso.usuario.id)
  )
  const { titulo, descripcion } = encabezadoTerminos(documentos)

  return (
    <div className="flex flex-col gap-8">
      <EncabezadoAuth
        icono={ScrollText}
        titulo={titulo}
        descripcion={descripcion}
      />
      <FormularioTerminos
        siguiente={siguiente}
        documentos={documentos.map((documento) => ({
          ...documento,
          texto: (
            <VistaMarkdown
              texto={textos.get(documento.id) ?? ""}
              className="text-[0.9375rem] sm:text-sm"
            />
          ),
        }))}
      />
      <div className="flex flex-col items-center gap-2 border-t pt-6 text-center">
        <p className="text-sm text-pretty text-muted-foreground">
          Si no estás de acuerdo, puedes salir sin aceptar. Tu cuenta sigue
          disponible: podrás usar AMO cuando aceptes.
        </p>
        <BotonSalirSinAceptar />
      </div>
    </div>
  )
}
