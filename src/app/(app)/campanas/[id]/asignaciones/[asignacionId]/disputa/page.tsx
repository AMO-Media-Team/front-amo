import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { TituloMiga } from "@/components/layout/titulo-miga"
import { SinEmpresa } from "@/features/campanas/components/sin-empresa"
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
import {
  type AperturaDisputa,
  autorAperturaParte,
  avisoPaginaAnunciante,
  contextoEstadoDisputa,
  tituloDisputa,
  vistaDisputa,
} from "@/features/mis-campanas/disputa"
import { UUID } from "@/features/operacion/components/ficha"
import { formatearHandle } from "@/features/operacion/formato"
import { seguimientoDeCampana } from "@/features/seguimiento/queries"
import { rutaSeguimiento } from "@/features/seguimiento/rutas"
import type { AsignacionSeguimiento } from "@/features/seguimiento/tipos"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

type Parametros =
  PageProps<"/campanas/[id]/asignaciones/[asignacionId]/disputa">

/**
 * La asignación tal como la ve la empresa (`seguimiento_campana`, filtrada a
 * la suya): `null` si la campaña no es de la empresa o la asignación no es de
 * la campaña.
 */
async function asignacionDeLaCampana(
  campanaId: string,
  asignacionId: string
): Promise<AsignacionSeguimiento | null> {
  const { asignaciones } = await seguimientoDeCampana(campanaId)
  return (
    asignaciones.find((asignacion) => asignacion.id === asignacionId) ?? null
  )
}

export async function generateMetadata({
  params,
}: Parametros): Promise<Metadata> {
  const usuario = await requerirPermiso("asignaciones.ver_propias")
  const { id, asignacionId } = await params
  const asignacion =
    usuario.anuncianteId && UUID.test(id) && UUID.test(asignacionId)
      ? await asignacionDeLaCampana(id, asignacionId).catch(() => null)
      : null
  return {
    title: asignacion
      ? `Disputa · ${asignacion.medio.nombre} · ${asignacion.oferta}`
      : "Disputa",
  }
}

/**
 * Disputa de una publicación de la campaña, para el anunciante (ADM-011): en
 * los estados disputables «Reportar un problema» (Incumplimiento, Métricas,
 * Contenido, Permanencia u Otro) con el aviso de que, mientras dure, no se
 * verifica ni se liquida y que lo escrito lo verán el medio y el equipo AMO;
 * con una abierta, su estado y la conversación; cerrada, el resultado en la
 * voz de la empresa. Leerla pide lo mismo que el seguimiento de la campaña
 * (`asignaciones.ver_propias`: así se llega desde `/ir` sin un 403); abrirla,
 * responder y adjuntar, además `disputas.abrir` (sin él, la página dice que
 * no puede escribir). La BD vuelve a comprobarlo todo al abrir y al escribir.
 */
export default async function PaginaDisputaAnunciante({ params }: Parametros) {
  const usuario = await requerirPermiso("asignaciones.ver_propias")
  const puedeDisputar = tieneAlgunPermiso(usuario, ["disputas.abrir"])
  const { id, asignacionId } = await params
  if (!UUID.test(id) || !UUID.test(asignacionId)) notFound()
  if (!usuario.anuncianteId) {
    return (
      <ContenedorPagina ancho="estrecho">
        <EncabezadoPagina titulo="Disputa" />
        <SinEmpresa />
      </ContenedorPagina>
    )
  }

  const asignacion = await asignacionDeLaCampana(id, asignacionId)
  if (!asignacion) notFound()
  const [disputas, plazo] = await Promise.all([
    disputasDeAsignacion(asignacionId),
    // Dato de apoyo: sin la configuración, el plazo sembrado.
    plazoRecargaHoras().catch(() => PLAZO_RECARGA_POR_DEFECTO),
  ])
  const ahora = new Date()
  const vista = vistaDisputa({
    perspectiva: "anunciante",
    estadoAsignacion: asignacion.estado,
    disputas,
    ahora,
  })
  const vigente =
    vista.tipo === "abierta" || vista.tipo === "cerrada" ? vista.disputa : null
  const mensajes: MensajeDisputa[] = vigente
    ? await mensajesDeDisputa(vigente.id)
    : []
  const apertura: AperturaDisputa | null =
    vista.tipo === "abrir" && puedeDisputar
      ? {
          perspectiva: "anunciante",
          asignacionId: asignacion.id,
          modo: vista.modo,
          motivos: vista.motivos,
          estadoAsignacion: asignacion.estado,
          reclamoHasta: null,
          plazoRecargaHoras: plazo,
          plataforma: asignacion.plataforma,
          handle: asignacion.cuenta.handle,
        }
      : null
  const titulo = tituloDisputa(vista, "anunciante", puedeDisputar)
  const seguimiento = rutaSeguimiento(id, asignacion.id)

  return (
    <ContenedorPagina ancho="estrecho" className="gap-5">
      <TituloMiga titulo={titulo} />
      <CabeceraDisputa
        volver={{ href: seguimiento, texto: "Volver al seguimiento" }}
        antetitulo={asignacion.oferta}
        titulo={titulo}
        descripcion={
          avisoPaginaAnunciante(vista, puedeDisputar) ??
          `Publicación de ${asignacion.medio.nombre}.`
        }
        plataforma={asignacion.plataforma}
        detalles={[
          asignacion.medio.nombre,
          asignacion.cuenta.handle
            ? formatearHandle(asignacion.cuenta.handle)
            : null,
        ]}
      />
      <PanelDisputa
        apertura={apertura}
        disputaAbiertaId={vista.tipo === "abierta" ? vista.disputa.id : null}
        ahoraServidor={ahora.getTime()}
      >
        <ContenidoDisputa
          vista={vista}
          perspectiva="anunciante"
          mensajes={mensajes}
          contexto={
            vigente
              ? contextoEstadoDisputa(
                  vigente,
                  {
                    fechaLimitePublicacion: asignacion.fechaLimitePublicacion,
                    causaCancelacion: null,
                  },
                  plazo
                )
              : { plazoRecargaHoras: plazo }
          }
          puedeEscribir={puedeDisputar}
          autorApertura={
            vigente
              ? autorAperturaParte({
                  perspectiva: "anunciante",
                  parte: vigente.parte,
                  medio: asignacion.medio.nombre,
                })
              : undefined
          }
          volver={
            <EnlaceBoton href={seguimiento} variant="outline">
              <ArrowLeft data-icon="inline-start" aria-hidden />
              Volver al seguimiento
            </EnlaceBoton>
          }
        />
      </PanelDisputa>
    </ContenedorPagina>
  )
}
