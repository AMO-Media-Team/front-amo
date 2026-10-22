import type { Metadata } from "next"
import { Suspense } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoSeccionMiMedio } from "@/features/mi-medio/components/encabezado-seccion"
import { EsqueletoNivel } from "@/features/mi-medio/components/esqueletos"
import { LimiteErrorMiMedio } from "@/features/mi-medio/components/limite-error-mi-medio"
import { SinMedio } from "@/features/mi-medio/components/sin-medio"
import { VistaNivel } from "@/features/mi-medio/components/vista-nivel"
import { consumoTope, resumenMiMedio } from "@/features/mi-medio/queries"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Nivel de verificación" }

async function SeccionNivel({ medioId }: { medioId: string }) {
  const [resumen, consumo] = await Promise.all([
    resumenMiMedio(medioId),
    consumoTope(),
  ])
  return resumen ? (
    <VistaNivel resumen={resumen} consumo={consumo} />
  ) : (
    <SinMedio />
  )
}

/**
 * Nivel de verificación (MED-007): tope anual y consumo, documentos exigidos
 * con su estado y la guía para subir de nivel.
 */
export default async function PaginaNivelMedio() {
  const usuario = await requerirPermiso("medios.editar_propio")
  return (
    <ContenedorPagina>
      <EncabezadoSeccionMiMedio
        titulo="Nivel de verificación"
        descripcion="Tu nivel fija cuánto puedes recibir al año en ofertas aceptadas. Con más documentos, subes de nivel y amplías tu tope."
      />
      {usuario.medioId ? (
        <LimiteErrorMiMedio recurso="tu nivel">
          <Suspense fallback={<EsqueletoNivel />}>
            <SeccionNivel medioId={usuario.medioId} />
          </Suspense>
        </LimiteErrorMiMedio>
      ) : (
        <SinMedio />
      )}
    </ContenedorPagina>
  )
}
