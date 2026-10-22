import type { Metadata } from "next"
import { Suspense } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { AltaMedio } from "@/features/mi-medio/components/alta-medio"
import { EsqueletoAltaMedio } from "@/features/mi-medio/components/esqueletos"
import { LimiteErrorMiMedio } from "@/features/mi-medio/components/limite-error-mi-medio"
import { SinMedio } from "@/features/mi-medio/components/sin-medio"
import { medioPropio, resumenMiMedio } from "@/features/mi-medio/queries"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Mi medio" }

async function SeccionResumen({ medioId }: { medioId: string }) {
  const resumen = await resumenMiMedio(medioId)
  return resumen ? <AltaMedio resumen={resumen} /> : <SinMedio />
}

/**
 * «Mi medio» (MED-002): estado de la verificación, lista de alta con su
 * avance y el envío a verificación. Cada sección (perfil, documentos, pago,
 * cuentas, nivel) tiene su página; esta es el punto de partida en el celular.
 */
export default async function PaginaMiMedio() {
  const usuario = await requerirPermiso("medios.editar_propio")
  const { medioId } = usuario
  // Si la lectura falla, el encabezado queda genérico y la sección (que repite
  // la misma consulta, memorizada por solicitud) muestra el error con
  // «Reintentar»: no se cae la página entera ni se confunde con «sin medio».
  const medio = medioId
    ? await medioPropio(medioId).catch(() => undefined)
    : null

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        antetitulo="Mi medio"
        titulo={medio?.nombre ?? "Mi medio"}
        descripcion="Tu perfil, tus documentos, tus datos de pago y tus cuentas, en un solo lugar."
      />
      {medioId && medio !== null ? (
        <LimiteErrorMiMedio recurso="tu medio">
          <Suspense fallback={<EsqueletoAltaMedio />}>
            <SeccionResumen medioId={medioId} />
          </Suspense>
        </LimiteErrorMiMedio>
      ) : (
        <SinMedio />
      )}
    </ContenedorPagina>
  )
}
