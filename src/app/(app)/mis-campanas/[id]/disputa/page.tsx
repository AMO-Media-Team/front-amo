import { ArrowLeft, ChartColumn, Upload } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { TituloMiga } from "@/components/layout/titulo-miga"
import { PLAZO_RECARGA_POR_DEFECTO } from "@/features/disputas/presentacion"
import {
  disputasDeAsignacion,
  mensajesDeDisputa,
  plazoRecargaHoras,
} from "@/features/disputas/queries"
import type { MensajeDisputa } from "@/features/disputas/tipos"
import { CabeceraDisputa } from "@/features/mis-campanas/components/disputa/cabecera-disputa"
import { ContenidoDisputa } from "@/features/mis-campanas/components/disputa/contenido-disputa"
import { PanelDisputa } from "@/features/mis-campanas/components/disputa/panel-disputa"
import { SinMedioCampanas } from "@/features/mis-campanas/components/sin-medio"
import {
  type AperturaDisputa,
  autorAperturaParte,
  contextoEstadoDisputa,
  siguienteTrasDisputa,
  tituloDisputa,
  vistaDisputa,
} from "@/features/mis-campanas/disputa"
import { miAsignacion } from "@/features/mis-campanas/queries"
import {
  rutaAsignacionMedio,
  rutaEvidencia,
} from "@/features/mis-campanas/rutas"
import type { AsignacionMedio } from "@/features/mis-campanas/tipos"
import { UUID } from "@/features/operacion/components/ficha"
import { formatearHandle } from "@/features/operacion/formato"
import { requerirPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/mis-campanas/[id]/disputa">): Promise<Metadata> {
  await requerirPermiso("disputas.abrir")
  const { id } = await params
  const asignacion = UUID.test(id)
    ? await miAsignacion(id).catch(() => null)
    : null
  if (!asignacion) return { title: "Disputa" }
  const reclamo =
    asignacion.estado === "VENCIDA_SIN_PUBLICAR" ||
    asignacion.estadoPrevioDisputa === "VENCIDA_SIN_PUBLICAR"
  return {
    title: `${reclamo ? "Reclamo" : "Disputa"} · ${asignacion.ofertaTitulo}`,
  }
}

/** El paso del medio junto al estado de la disputa (evidencia o cortes). */
function AccionDisputa({
  asignacion,
  siguiente,
}: {
  asignacion: AsignacionMedio
  siguiente: ReturnType<typeof siguienteTrasDisputa>
}) {
  if (!siguiente) return null
  return siguiente.destino === "evidencia" ? (
    <EnlaceBoton href={rutaEvidencia(asignacion.id)} size="sm">
      <Upload data-icon="inline-start" aria-hidden />
      {siguiente.texto}
    </EnlaceBoton>
  ) : (
    <EnlaceBoton
      href={rutaAsignacionMedio(asignacion.id)}
      variant="outline"
      size="sm"
    >
      <ChartColumn data-icon="inline-start" aria-hidden />
      {siguiente.texto}
    </EnlaceBoton>
  )
}

/**
 * Disputa o reclamo de una campaña del medio (ADM-011, MED-011 c2). Una
 * vencida dentro de su plazo se reclama («Reclamar: sí publiqué», con la
 * descripción precargada, el enlace y la captura opcionales y la cuenta
 * regresiva); en los estados disputables se reporta un problema (Métricas,
 * Contenido, Pago u Otro). Con una abierta, su estado y la conversación con
 * el anunciante y el equipo AMO; cerrada, el resultado en la voz del medio.
 * La BD vuelve a comprobarlo todo al abrir y al escribir.
 */
export default async function PaginaDisputaMedio({
  params,
}: PageProps<"/mis-campanas/[id]/disputa">) {
  const usuario = await requerirPermiso("disputas.abrir")
  const { id } = await params
  if (!UUID.test(id)) notFound()
  if (!usuario.medioId) {
    return (
      <ContenedorPagina ancho="estrecho">
        <SinMedioCampanas />
      </ContenedorPagina>
    )
  }

  const asignacion = await miAsignacion(id)
  if (!asignacion) notFound()
  const [disputas, plazo] = await Promise.all([
    disputasDeAsignacion(id),
    // Dato de apoyo: sin la configuración, el plazo sembrado.
    plazoRecargaHoras().catch(() => PLAZO_RECARGA_POR_DEFECTO),
  ])
  const ahora = new Date()
  const vista = vistaDisputa({
    perspectiva: "medio",
    estadoAsignacion: asignacion.estado,
    disputas,
    reclamoHasta: asignacion.reclamoHasta,
    ahora,
  })
  const vigente =
    vista.tipo === "abierta" || vista.tipo === "cerrada" ? vista.disputa : null
  const mensajes: MensajeDisputa[] = vigente
    ? await mensajesDeDisputa(vigente.id)
    : []
  const apertura: AperturaDisputa | null =
    vista.tipo === "abrir"
      ? {
          perspectiva: "medio",
          asignacionId: asignacion.id,
          modo: vista.modo,
          motivos: vista.motivos,
          estadoAsignacion: asignacion.estado,
          reclamoHasta: asignacion.reclamoHasta,
          plazoRecargaHoras: plazo,
          plataforma: asignacion.plataforma,
          handle: asignacion.handle,
        }
      : null
  const titulo = tituloDisputa(vista, "medio")
  const volver = (
    <EnlaceBoton href={rutaAsignacionMedio(asignacion.id)} variant="outline">
      <ArrowLeft data-icon="inline-start" aria-hidden />
      Volver a la campaña
    </EnlaceBoton>
  )

  return (
    <ContenedorPagina ancho="estrecho" className="gap-5">
      <TituloMiga titulo={titulo} />
      <CabeceraDisputa
        volver={{
          href: rutaAsignacionMedio(asignacion.id),
          texto: "Volver a la campaña",
        }}
        antetitulo={asignacion.marca ?? asignacion.anuncianteNombre}
        titulo={titulo}
        descripcion={asignacion.ofertaTitulo}
        plataforma={asignacion.plataforma}
        detalles={[
          asignacion.formatoNombre,
          asignacion.handle ? formatearHandle(asignacion.handle) : null,
        ]}
      />
      <PanelDisputa
        apertura={apertura}
        disputaAbiertaId={vista.tipo === "abierta" ? vista.disputa.id : null}
        ahoraServidor={ahora.getTime()}
      >
        <ContenidoDisputa
          vista={vista}
          perspectiva="medio"
          mensajes={mensajes}
          contexto={
            vigente
              ? contextoEstadoDisputa(vigente, asignacion, plazo)
              : { plazoRecargaHoras: plazo }
          }
          puedeEscribir
          autorApertura={
            vigente
              ? autorAperturaParte({
                  perspectiva: "medio",
                  parte: vigente.parte,
                  empresa: asignacion.anuncianteNombre ?? asignacion.marca,
                })
              : undefined
          }
          accion={
            vigente ? (
              <AccionDisputa
                asignacion={asignacion}
                siguiente={siguienteTrasDisputa(vigente, asignacion.estado)}
              />
            ) : null
          }
          volver={volver}
        />
      </PanelDisputa>
    </ContenedorPagina>
  )
}
