import type { Metadata } from "next"
import { Suspense } from "react"

import { TransicionPagina } from "@/components/motion/transicion-vista"
import { EsqueletoEmpresa } from "@/features/empresa/components/esqueletos"
import { LimiteErrorEmpresa } from "@/features/empresa/components/limite-error-empresa"
import { PanelEmpresa } from "@/features/empresa/components/panel-empresa"
import { SinEmpresa } from "@/features/empresa/components/sin-empresa"
import { datosMiEmpresa } from "@/features/empresa/queries"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Mi empresa" }

async function SeccionEmpresa({ anuncianteId }: { anuncianteId: string }) {
  const datos = await datosMiEmpresa(anuncianteId)
  return datos ? <PanelEmpresa datos={datos} /> : <SinEmpresa />
}

/**
 * «Mi empresa» (ANU-001, ADM-003): estado de la verificación con lo que falta
 * y el envío, datos de la empresa (la identificación, de solo lectura una vez
 * verificada), persona de contacto y logo. La empresa sale de la sesión,
 * nunca de la URL.
 */
export default async function PaginaEmpresa() {
  const usuario = await requerirPermiso("anunciantes.editar_propio")
  return (
    <TransicionPagina>
      {usuario.anuncianteId ? (
        <LimiteErrorEmpresa recurso="los datos de tu empresa">
          <Suspense fallback={<EsqueletoEmpresa />}>
            <SeccionEmpresa anuncianteId={usuario.anuncianteId} />
          </Suspense>
        </LimiteErrorEmpresa>
      ) : (
        <SinEmpresa />
      )}
    </TransicionPagina>
  )
}
