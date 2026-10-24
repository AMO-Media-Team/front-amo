import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { LimiteErrorMiMedio } from "@/features/mi-medio/components/limite-error-mi-medio"
import { AccionesAsignacion } from "@/features/mis-campanas/components/acciones-asignacion"
import { EsqueletoCuerpoAsignacion } from "@/features/mis-campanas/components/esqueletos"
import {
  CabeceraAsignacionMedio,
  CondicionesAsignacion,
  HistoriaAsignacion,
  PagoAsignacionMedio,
  ResumenContenido,
} from "@/features/mis-campanas/components/ficha-asignacion-medio"
import { LoQueSigue } from "@/features/mis-campanas/components/lo-que-sigue"
import { PublicacionesAsignacion } from "@/features/mis-campanas/components/publicaciones-asignacion"
import {
  progresoMedio,
  puedeDesistir,
} from "@/features/mis-campanas/presentacion"
import {
  accionesDeAsignaciones,
  condicionesDeOferta,
  ejecucionDeAsignacion,
  miAsignacion,
  plazoCargaHoras,
} from "@/features/mis-campanas/queries"
import { siguientePaso } from "@/features/mis-campanas/siguiente-accion"
import type { AsignacionMedio } from "@/features/mis-campanas/tipos"
import { UUID } from "@/features/operacion/components/ficha"
import { ProgresoAsignacion } from "@/features/operacion/components/linea-tiempo-asignacion"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/mis-campanas/[id]">): Promise<Metadata> {
  await requerirPermiso("asignaciones.ver_propias")
  const { id } = await params
  const asignacion = UUID.test(id)
    ? await miAsignacion(id).catch(() => null)
    : null
  return { title: asignacion?.ofertaTitulo ?? "Campaña" }
}

async function CuerpoAsignacion({
  asignacion,
  ahoraServidor,
  puedeEjecutar,
  puedeDisputar,
  puedeAceptar,
}: {
  asignacion: AsignacionMedio
  ahoraServidor: number
  puedeEjecutar: boolean
  /** Reclamar una vencida (`disputas.abrir`). */
  puedeDisputar: boolean
  /** Desistir pide el mismo permiso que aceptar. */
  puedeAceptar: boolean
}) {
  const [acciones, ejecucion, plazo, condiciones] = await Promise.all([
    accionesDeAsignaciones([asignacion]),
    ejecucionDeAsignacion(asignacion.id),
    plazoCargaHoras(),
    condicionesDeOferta(asignacion.ofertaId),
  ])
  const ahora = new Date(ahoraServidor)
  const paso = siguientePaso(asignacion, acciones)
  const accion = paso.tipo === "accion" && puedeEjecutar ? paso.accion : null
  const desistirHasta =
    puedeAceptar && puedeDesistir(asignacion, ahora)
      ? asignacion.fechaLimiteAceptacion
      : null

  return (
    <>
      <LoQueSigue
        paso={paso}
        ahoraServidor={ahoraServidor}
        puedeEjecutar={puedeEjecutar}
        puedeDisputar={puedeDisputar}
        conBotonEnPie={accion !== null}
        desistirHasta={desistirHasta}
      />
      <ProgresoAsignacion progreso={progresoMedio(asignacion)} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <PublicacionesAsignacion
            asignacion={asignacion}
            ejecucion={ejecucion}
            plazoCargaHoras={plazo}
            ahoraServidor={ahoraServidor}
            puedeEjecutar={puedeEjecutar}
          />
          <HistoriaAsignacion asignacion={asignacion} ejecucion={ejecucion} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <PagoAsignacionMedio asignacion={asignacion} />
          <ResumenContenido
            asignacion={asignacion}
            ejecucion={ejecucion}
            ahora={ahora}
          />
          <CondicionesAsignacion
            asignacion={asignacion}
            condiciones={condiciones}
          />
        </div>
      </div>
      <AccionesAsignacion
        key={asignacion.id}
        asignacionId={asignacion.id}
        ofertaTitulo={asignacion.ofertaTitulo}
        accion={accion}
        desistirHasta={desistirHasta}
        ahoraServidor={ahoraServidor}
      />
    </>
  )
}

/**
 * Ficha de una campaña del medio (MED-011, MED-010 desistir): lo que sigue
 * como acción principal (en el pie, al alcance del pulgar), el avance, cada
 * publicación con sus cortes, lo que recibe (precio congelado y multiplicador
 * de calidad), el contenido, lo que aceptó y la historia.
 */
export default async function PaginaAsignacionMedio({
  params,
}: PageProps<"/mis-campanas/[id]">) {
  const usuario = await requerirPermiso("asignaciones.ver_propias")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const asignacion = await miAsignacion(id)
  if (!asignacion) notFound()
  const ahora = new Date()
  const ahoraServidor = ahora.getTime()

  return (
    <ContenedorPagina>
      <CabeceraAsignacionMedio asignacion={asignacion} />
      <LimiteErrorMiMedio recurso="el detalle de la campaña">
        <Suspense fallback={<EsqueletoCuerpoAsignacion />}>
          <CuerpoAsignacion
            asignacion={asignacion}
            ahoraServidor={ahoraServidor}
            puedeEjecutar={tieneAlgunPermiso(usuario, [
              "asignaciones.ejecutar",
            ])}
            puedeDisputar={tieneAlgunPermiso(usuario, ["disputas.abrir"])}
            puedeAceptar={tieneAlgunPermiso(usuario, ["ofertas.aceptar"])}
          />
        </Suspense>
      </LimiteErrorMiMedio>
    </ContenedorPagina>
  )
}
