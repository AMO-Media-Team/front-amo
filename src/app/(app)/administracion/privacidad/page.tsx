import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import {
  EsqueletoResumenPlazos,
  EsqueletoTablaSolicitudes,
} from "@/features/privacidad/components/esqueletos"
import {
  SeccionResumenPlazos,
  SeccionTablaSolicitudes,
} from "@/features/privacidad/components/secciones-bandeja"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Datos personales" }

/**
 * Bandeja de solicitudes de titulares de datos (CTA-007, Ley 1581 de 2012):
 * el semáforo del plazo legal («Vencida», «Vence hoy», «Por vencer», «En
 * plazo») y la tabla con radicado, tipo, rol del titular, fechas y estado,
 * con los filtros `?estado=&tipo=&vence=` en la URL. Cada solicitud se
 * atiende en su ficha.
 */
export default async function PaginaPrivacidadAdmin({
  searchParams,
}: PageProps<"/administracion/privacidad">) {
  await requerirPermiso("privacidad.gestionar")

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        antetitulo="Administración"
        titulo="Datos personales"
        descripcion="Consultas y reclamos de los titulares (Ley 1581 de 2012). Respóndelos dentro del plazo legal: 10 días hábiles las consultas y 15 los reclamos."
      />
      <LimiteErrorTabla recurso="el resumen de plazos">
        <Suspense fallback={<EsqueletoResumenPlazos />}>
          <SeccionResumenPlazos />
        </Suspense>
      </LimiteErrorTabla>
      <LimiteErrorTabla recurso="las solicitudes">
        <Suspense fallback={<EsqueletoTablaSolicitudes />}>
          <SeccionTablaSolicitudes searchParams={searchParams} />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
