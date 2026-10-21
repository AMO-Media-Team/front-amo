import { FileText, Handshake, LayoutDashboard, UsersRound } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { CuentasSociales } from "@/features/operacion/components/cuentas-sociales"
import { EsqueletoIndicadores } from "@/features/operacion/components/esqueletos"
import { Diferida, UUID } from "@/features/operacion/components/ficha"
import {
  CabeceraMedio,
  SeccionDocumentosMedio,
  SeccionIndicadoresMedio,
  SeccionResumenMedio,
} from "@/features/operacion/components/ficha-medio"
import {
  type PestanaFicha,
  PestanasFicha,
} from "@/features/operacion/components/pestanas-ficha"
import { SeccionActividad } from "@/features/operacion/components/seccion-actividad"
import {
  cuentasDelMedio,
  obtenerMedio,
} from "@/features/operacion/queries/medios"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/operacion/medios/[id]">): Promise<Metadata> {
  await requerirPermiso("medios.ver")
  const { id } = await params
  const medio = UUID.test(id) ? await obtenerMedio(id) : null
  return { title: medio?.nombre ?? "Medio" }
}

/**
 * Ficha de un medio (consulta): cabecera e indicadores, y pestañas Resumen,
 * Cuentas sociales, Asignaciones y Documentos. Cada sección consulta por su
 * cuenta y llega en streaming; lo que el rol no puede ver no se consulta.
 */
export default async function PaginaMedio({
  params,
}: PageProps<"/operacion/medios/[id]">) {
  const usuario = await requerirPermiso("medios.ver")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const verAsignaciones = tieneAlgunPermiso(usuario, ["asignaciones.ver"])
  const verSensibles = tieneAlgunPermiso(usuario, ["datos_sensibles.ver"])
  const verVerificaciones = tieneAlgunPermiso(usuario, ["medios.verificar"])
  // La RLS de documentos exige ambos permisos.
  const verDocumentos = verVerificaciones && verSensibles

  const [medio, cuentas] = await Promise.all([
    obtenerMedio(id),
    cuentasDelMedio(id, { verVerificaciones }),
  ])
  if (!medio) notFound()

  const pestanas: PestanaFicha[] = [
    {
      clave: "resumen",
      titulo: "Resumen",
      icono: <LayoutDashboard aria-hidden />,
      contenido: (
        <Diferida recurso="el perfil del medio">
          <SeccionResumenMedio medio={medio} verSensibles={verSensibles} />
        </Diferida>
      ),
    },
    {
      clave: "cuentas",
      titulo: "Cuentas sociales",
      icono: <UsersRound aria-hidden />,
      contador: cuentas.length,
      contenido: <CuentasSociales cuentas={cuentas} />,
    },
  ]
  if (verAsignaciones) {
    pestanas.push({
      clave: "asignaciones",
      titulo: "Asignaciones",
      icono: <Handshake aria-hidden />,
      contenido: (
        <Diferida recurso="las asignaciones del medio">
          <SeccionActividad dueno="medio" id={medio.id} />
        </Diferida>
      ),
    })
  }
  if (verDocumentos || verSensibles) {
    pestanas.push({
      clave: "documentos",
      titulo: verDocumentos ? "Documentos y pagos" : "Datos de pago",
      icono: <FileText aria-hidden />,
      contenido: (
        <Diferida recurso="los documentos del medio">
          <SeccionDocumentosMedio
            medio={medio}
            verDocumentos={verDocumentos}
            verSensibles={verSensibles}
          />
        </Diferida>
      ),
    })
  }

  return (
    <ContenedorPagina>
      <CabeceraMedio medio={medio} />
      <Diferida
        recurso="los indicadores del medio"
        respaldo={<EsqueletoIndicadores cantidad={5} />}
      >
        <SeccionIndicadoresMedio
          medio={medio}
          cuentas={cuentas}
          verAsignaciones={verAsignaciones}
        />
      </Diferida>
      <PestanasFicha pestanas={pestanas} />
    </ContenedorPagina>
  )
}
