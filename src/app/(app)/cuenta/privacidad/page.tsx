import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { TransicionPagina } from "@/components/motion/transicion-vista"
import { EsqueletoSeccion } from "@/features/cuenta/components/esqueletos-cuenta"
import { DescargarMisDatos } from "@/features/privacidad/components/descargar-mis-datos"
import {
  SeccionAutorizaciones,
  SeccionSolicitudesPropias,
} from "@/features/privacidad/components/secciones-cuenta"
import { TusDatos } from "@/features/privacidad/components/tus-datos"
import { categoriasDatos } from "@/features/privacidad/presentacion"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Privacidad" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Cuenta → Privacidad (CTA-007, Ley 1581 de 2012): qué datos trata AMO y dónde
 * corregirlos, las autorizaciones aceptadas, la descarga de los datos, la
 * radicación de solicitudes (consulta, prueba de la autorización,
 * actualización, rectificación, supresión o revocatoria) y su seguimiento.
 * Móvil primero. `?solicitud=` (enlace de un aviso) resalta y enfoca una.
 */
export default async function PaginaPrivacidad({
  searchParams,
}: PageProps<"/cuenta/privacidad">) {
  const usuario = await requerirPermiso("cuenta.gestionar")
  const { solicitud } = await searchParams
  const valor = Array.isArray(solicitud) ? solicitud[0] : solicitud
  const resaltada = valor && UUID.test(valor) ? valor.toLowerCase() : null

  return (
    <TransicionPagina>
      <div className="flex flex-col gap-6">
        <TusDatos
          categorias={categoriasDatos(usuario.rol.tipo, usuario.permisos)}
        />

        <LimiteErrorTabla recurso="tus autorizaciones">
          <Suspense fallback={<EsqueletoSeccion filas={2} />}>
            <SeccionAutorizaciones usuarioId={usuario.id} />
          </Suspense>
        </LimiteErrorTabla>

        <DescargarMisDatos nombre={usuario.nombre} />

        <LimiteErrorTabla recurso="tus solicitudes">
          <Suspense
            fallback={
              <div className="flex flex-col gap-6">
                <EsqueletoSeccion filas={4} conPie />
                <EsqueletoSeccion filas={2} />
              </div>
            }
          >
            <SeccionSolicitudesPropias
              usuario={usuario}
              resaltada={resaltada}
            />
          </Suspense>
        </LimiteErrorTabla>
      </div>
    </TransicionPagina>
  )
}
