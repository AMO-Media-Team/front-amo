import type { Metadata } from "next"
import { Suspense } from "react"

import { TransicionPagina } from "@/components/motion/transicion-vista"
import { PanelDocumentosAnunciante } from "@/features/documentos-anunciante/components/panel-documentos"
import { datosDocumentosAnunciante } from "@/features/documentos-anunciante/queries"
import { TITULO_PAGINA } from "@/features/documentos-anunciante/textos"
import { EsqueletoDocumentos } from "@/features/documentos-medio/components/esqueleto-documentos"
import { LimiteErrorEmpresa } from "@/features/empresa/components/limite-error-empresa"
import { SiguientePasoDocumentos } from "@/features/empresa/components/siguiente-paso-documentos"
import { SinEmpresa } from "@/features/empresa/components/sin-empresa"
import { contactoEmpresa } from "@/features/empresa/queries"
import {
  contactoCompleto,
  resumenDocumentosDe,
} from "@/features/empresa/verificacion"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: TITULO_PAGINA }

async function SeccionDocumentos({ anuncianteId }: { anuncianteId: string }) {
  const [datos, contacto] = await Promise.all([
    datosDocumentosAnunciante(anuncianteId),
    contactoEmpresa(anuncianteId),
  ])
  if (!datos) return <SinEmpresa />
  return (
    <PanelDocumentosAnunciante
      datos={datos}
      siguiente={
        <SiguientePasoDocumentos
          empresa={datos.empresa}
          resumen={resumenDocumentosDe(datos)}
          conContacto={contactoCompleto(contacto)}
        />
      }
    />
  )
}

/**
 * «Mi empresa › Documentos» (ANU-001): lo que exige la verificación (en
 * Colombia, RUT y Cámara de Comercio; en el exterior, su equivalente), su
 * estado, observaciones y vigencia, y la carga directa a Storage desde el
 * celular. La empresa sale de la sesión, nunca de la URL.
 */
export default async function PaginaDocumentosEmpresa() {
  const usuario = await requerirPermiso("anunciantes.editar_propio")
  return (
    <TransicionPagina>
      {usuario.anuncianteId ? (
        <LimiteErrorEmpresa recurso="los documentos de tu empresa">
          <Suspense fallback={<EsqueletoDocumentos />}>
            <SeccionDocumentos anuncianteId={usuario.anuncianteId} />
          </Suspense>
        </LimiteErrorEmpresa>
      ) : (
        <SinEmpresa />
      )}
    </TransicionPagina>
  )
}
