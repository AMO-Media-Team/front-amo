import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { LimiteErrorMiMedio } from "@/features/mi-medio/components/limite-error-mi-medio"
import { situacionContenido } from "@/features/mis-campanas/contenido"
import { EsqueletoContenido } from "@/features/mis-campanas/components/esqueletos"
import { InstruccionesContenido } from "@/features/mis-campanas/components/instrucciones-contenido"
import { PanelContenido } from "@/features/mis-campanas/components/panel-contenido"
import {
  accionesDeAsignaciones,
  contenidoDeAsignacion,
  miAsignacion,
} from "@/features/mis-campanas/queries"
import { rutaAsignacionMedio } from "@/features/mis-campanas/rutas"
import { siguientePaso } from "@/features/mis-campanas/siguiente-accion"
import type { AsignacionMedio } from "@/features/mis-campanas/tipos"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/mis-campanas/[id]/contenido">): Promise<Metadata> {
  await requerirPermiso("asignaciones.ver_propias")
  const { id } = await params
  const asignacion = UUID.test(id)
    ? await miAsignacion(id).catch(() => null)
    : null
  return {
    title: asignacion ? `Contenido · ${asignacion.ofertaTitulo}` : "Contenido",
  }
}

async function SeccionContenido({
  asignacion,
  ahoraServidor,
  puedeEjecutar,
}: {
  asignacion: AsignacionMedio
  ahoraServidor: number
  puedeEjecutar: boolean
}) {
  const [contenido, acciones] = await Promise.all([
    contenidoDeAsignacion(
      asignacion.id,
      asignacion.ofertaId,
      asignacion.creativoDescargadoId
    ),
    accionesDeAsignaciones([asignacion]),
  ])
  const paso = siguientePaso(asignacion, acciones)
  // Tras descargar, lo que sigue es publicar (o corregir la evidencia).
  const siguiente =
    paso.tipo === "accion" &&
    (paso.accion.tipo === "PUBLICAR" ||
      paso.accion.tipo === "CORREGIR_EVIDENCIA")
      ? paso.accion
      : null

  return (
    <>
      <InstruccionesContenido
        asignacion={asignacion}
        condiciones={contenido.condiciones}
      />
      <PanelContenido
        asignacionId={asignacion.id}
        situacion={situacionContenido(
          asignacion,
          contenido,
          new Date(ahoraServidor)
        )}
        descargas={contenido.descargas}
        puedeEjecutar={puedeEjecutar}
        siguiente={siguiente}
        fechaLimitePublicacion={asignacion.fechaLimitePublicacion}
        ahoraServidor={ahoraServidor}
      />
    </>
  )
}

/**
 * «Contenido» de una campaña del medio (MED-012): primero las instrucciones y
 * restricciones del anunciante y las condiciones; luego «Descargar el
 * contenido», que registra la descarga con su versión y deja ver y guardar
 * los archivos originales (enlaces firmados de 5 minutos) y copiar el texto
 * con un toque. Si hay una versión nueva, la destaca.
 */
export default async function PaginaContenidoAsignacion({
  params,
}: PageProps<"/mis-campanas/[id]/contenido">) {
  const usuario = await requerirPermiso("asignaciones.ver_propias")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const asignacion = await miAsignacion(id)
  if (!asignacion) notFound()
  const ahora = new Date()
  const ahoraServidor = ahora.getTime()

  return (
    <ContenedorPagina>
      <div className="flex flex-col gap-4">
        <EnlaceBoton
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit text-muted-foreground"
          href={rutaAsignacionMedio(asignacion.id)}
        >
          <ArrowLeft data-icon="inline-start" aria-hidden />
          Volver a la campaña
        </EnlaceBoton>
        <EncabezadoPagina
          antetitulo={
            asignacion.marca ?? asignacion.anuncianteNombre ?? "Campaña"
          }
          titulo="Contenido para publicar"
          descripcion={
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-foreground">
                {asignacion.ofertaTitulo}
              </span>
              <span aria-hidden>·</span>
              <MarcaPlataforma plataforma={asignacion.plataforma} conNombre />
              <span aria-hidden>·</span>
              <span>{asignacion.formatoNombre}</span>
            </span>
          }
        />
      </div>
      <LimiteErrorMiMedio recurso="el contenido">
        <Suspense fallback={<EsqueletoContenido />}>
          <SeccionContenido
            asignacion={asignacion}
            ahoraServidor={ahoraServidor}
            puedeEjecutar={tieneAlgunPermiso(usuario, [
              "asignaciones.ejecutar",
            ])}
          />
        </Suspense>
      </LimiteErrorMiMedio>
    </ContenedorPagina>
  )
}
