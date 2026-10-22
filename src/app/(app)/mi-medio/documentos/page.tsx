import type { Metadata } from "next"
import { Suspense } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EsqueletoDocumentos } from "@/features/documentos-medio/components/esqueleto-documentos"
import { PanelDocumentos } from "@/features/documentos-medio/components/panel-documentos"
import { datosDocumentosMedio } from "@/features/documentos-medio/queries"
import {
  DESCRIPCION_PAGINA,
  TITULO_PAGINA,
} from "@/features/documentos-medio/textos"
import { EncabezadoSeccionMiMedio } from "@/features/mi-medio/components/encabezado-seccion"
import { LimiteErrorMiMedio } from "@/features/mi-medio/components/limite-error-mi-medio"
import { SinMedio } from "@/features/mi-medio/components/sin-medio"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: TITULO_PAGINA }

async function SeccionDocumentos({ medioId }: { medioId: string }) {
  const datos = await datosDocumentosMedio(medioId)
  return datos ? <PanelDocumentos datos={datos} /> : <SinMedio />
}

/**
 * «Mis documentos» (MED-003): los documentos que pide el nivel de
 * verificación, su estado, observaciones y vigencia, y la carga directa a
 * Storage desde el celular. El medio sale de la sesión, nunca de la URL.
 */
export default async function PaginaDocumentosMedio() {
  const usuario = await requerirPermiso("medios.editar_propio")

  return (
    <ContenedorPagina>
      <EncabezadoSeccionMiMedio
        titulo={TITULO_PAGINA}
        descripcion={DESCRIPCION_PAGINA}
      />
      {usuario.medioId ? (
        <LimiteErrorMiMedio recurso="tus documentos">
          <Suspense fallback={<EsqueletoDocumentos />}>
            <SeccionDocumentos medioId={usuario.medioId} />
          </Suspense>
        </LimiteErrorMiMedio>
      ) : (
        <SinMedio />
      )}
    </ContenedorPagina>
  )
}
