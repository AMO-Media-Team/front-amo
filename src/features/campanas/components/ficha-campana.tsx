import "server-only"

import {
  Activity,
  ChartColumn,
  FileText,
  Megaphone,
  Receipt,
} from "lucide-react"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { rutaFacturasDeCampana } from "@/features/facturas-anunciante/rutas"
import { campanaMetricas } from "@/features/metricas-campana/calculos"
import { EsqueletoMetricas } from "@/features/metricas-campana/components/esqueleto-metricas"
import { SeccionMetricas } from "@/features/metricas-campana/components/seccion-metricas"
import { Diferida } from "@/features/operacion/components/ficha"
import {
  type PestanaFicha,
  PestanasFicha,
} from "@/features/operacion/components/pestanas-ficha"
import { EsqueletoSeguimiento } from "@/features/seguimiento/components/esqueleto-seguimiento"
import { SeccionSeguimiento } from "@/features/seguimiento/components/seccion-seguimiento"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { serializarFecha } from "@/lib/fechas"

import {
  obtenerMiCampana,
  ofertasDeMiCampana,
  situacionEmpresa,
} from "../queries"
import {
  accionesCampana,
  puedeCrearOfertas,
  puedeEditarCampana,
} from "../reglas"
import { AccionesCampana } from "./acciones-campana"
import { AvisoEmpresa } from "./aviso-empresa"
import { CabeceraCampana } from "./cabecera-campana"
import { DatosCampana } from "./datos-campana"
import { IndicadoresCampana } from "./indicadores-campana"
import { OfertasCampana } from "./ofertas-campana"

/**
 * Ficha de una campaña propia (ANU-003, ANU-014): cabecera con su estado y
 * las acciones que permite la máquina de estados, resumen de presupuesto y
 * vigencia, y las pestañas «Ofertas» (por defecto; `?pestana=ofertas` también
 * la abre), «Seguimiento» (ANU-011, con `asignaciones.ver_propias`),
 * «Métricas» (ANU-012, con `reportes.ver`) y «Datos». Las dos del paquete SG
 * solo existen fuera del borrador (antes no hay medios ni resultados) y
 * llegan en streaming, cada una con su esqueleto. La página ya autorizó con
 * el DAL; la RLS decide qué se ve (una campaña de otra empresa no existe para
 * esta sesión).
 */
export async function FichaMiCampana({
  usuario,
  anuncianteId,
  campanaId,
}: {
  usuario: UsuarioSesion
  anuncianteId: string
  campanaId: string
}) {
  const [campana, empresa, ofertas] = await Promise.all([
    obtenerMiCampana(anuncianteId, campanaId),
    situacionEmpresa(anuncianteId),
    ofertasDeMiCampana(campanaId),
  ])
  if (!campana) notFound()

  const ahora = new Date()
  const hoy = serializarFecha(ahora)
  const estadoEmpresa = empresa?.estado ?? "PENDIENTE"
  const acciones = accionesCampana({
    estado: campana.estado,
    tipoActor: usuario.rol.tipo,
    permisos: usuario.permisos,
    estadoEmpresa,
  })
  const puedeEditar = puedeEditarCampana(campana.estado, usuario.permisos)
  const puedeCrear = puedeCrearOfertas(campana.estado, usuario.permisos)
  const conEjecucion = campana.estado !== "BORRADOR"
  const verSeguimiento =
    conEjecucion && tieneAlgunPermiso(usuario, ["asignaciones.ver_propias"])
  const verMetricas =
    conEjecucion && tieneAlgunPermiso(usuario, ["reportes.ver"])

  const pestanas: PestanaFicha[] = [
    {
      clave: "ofertas",
      titulo: "Ofertas",
      icono: <Megaphone aria-hidden />,
      contador: ofertas.length,
      contenido: (
        <OfertasCampana
          campana={campana}
          ofertas={ofertas}
          puedeCrear={puedeCrear}
          ahora={ahora}
        />
      ),
    },
    ...(verSeguimiento
      ? [
          {
            clave: "seguimiento",
            titulo: "Seguimiento",
            icono: <Activity aria-hidden />,
            contenido: (
              <Diferida
                recurso="el seguimiento"
                respaldo={<EsqueletoSeguimiento />}
              >
                <SeccionSeguimiento
                  campanaId={campana.id}
                  estadoCampana={campana.estado}
                />
              </Diferida>
            ),
          },
        ]
      : []),
    ...(verMetricas
      ? [
          {
            clave: "metricas",
            titulo: "Métricas",
            icono: <ChartColumn aria-hidden />,
            contenido: (
              <Diferida recurso="las métricas" respaldo={<EsqueletoMetricas />}>
                <SeccionMetricas
                  campana={campanaMetricas(campana)}
                  puedeExportar={tieneAlgunPermiso(usuario, [
                    "reportes.exportar",
                  ])}
                />
              </Diferida>
            ),
          },
        ]
      : []),
    {
      clave: "datos",
      titulo: "Datos",
      icono: <FileText aria-hidden />,
      contenido: <DatosCampana campana={campana} puedeEditar={puedeEditar} />,
    },
  ]

  return (
    <ContenedorPagina>
      <CabeceraCampana
        campana={campana}
        hoy={hoy}
        acciones={
          <>
            {/* ANU-013: las facturas que incluyen esta campaña (también las consolidadas). */}
            {campana.estado !== "BORRADOR" &&
            tieneAlgunPermiso(usuario, ["facturas.ver_propias"]) ? (
              <EnlaceBoton
                href={rutaFacturasDeCampana(campana.id)}
                variant="outline"
              >
                <Receipt data-icon="inline-start" aria-hidden />
                Facturas
              </EnlaceBoton>
            ) : null}
            <AccionesCampana
              campana={{
                id: campana.id,
                nombre: campana.nombre,
                estado: campana.estado,
              }}
              acciones={acciones}
              puedeEditar={puedeEditar}
            />
          </>
        }
        aviso={
          empresa && campana.estado !== "FINALIZADA" ? (
            <AvisoEmpresa situacion={empresa} />
          ) : null
        }
      />
      <IndicadoresCampana campana={campana} hoy={hoy} />
      <PestanasFicha pestanas={pestanas} />
    </ContenedorPagina>
  )
}
