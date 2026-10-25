import { Building2, CalendarRange, Megaphone, RotateCcw } from "lucide-react"
import type { Route } from "next"
import type { ReactNode } from "react"

import {
  InsigniaEstado,
  InsigniaTono,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import {
  CabeceraFicha,
  EnlaceFicha,
} from "@/features/operacion/components/ficha"
import { InsigniaGestionAsistida } from "@/features/campanas/components/distintivos-campana"
import { ESTADOS_OFERTA } from "@/features/operacion/estados"
import { formatearRangoCompacto } from "@/features/operacion/formato"
import { formatearFecha, formatearFechaHora } from "@/lib/format"

import { formatoYPlataforma, type UrgenciaFechaLimite } from "../presentacion"
import type { OfertaCompleta, Perspectiva } from "../tipos"

function Fecha({
  etiqueta,
  valor,
}: {
  etiqueta: string
  valor: string | null
}) {
  if (!valor) return null
  return (
    <span>
      {etiqueta}{" "}
      <time dateTime={valor} title={formatearFechaHora(valor)}>
        {formatearFecha(valor)}
      </time>
    </span>
  )
}

export interface EnlacesCabecera {
  /** A dónde vuelve el botón superior. */
  volver: { href: Route; titulo: string }
  campana: { href: Route; permitido: boolean }
  /** Solo en la ficha interna. */
  anunciante?: { href: Route; permitido: boolean }
}

/**
 * Cabecera de la ficha de una oferta (la del anunciante y la interna):
 * formato y plataforma, campaña (y anunciante), estado, urgencia de la fecha
 * límite, si la creó el equipo AMO por cuenta del anunciante (ADM-014) y los
 * hitos de su recorrido. El aviso del estado va debajo.
 */
export function CabeceraOferta({
  oferta,
  enlaces,
  urgencia,
  acciones,
  aviso,
  conReenvio = false,
  perspectiva = "interno",
}: {
  oferta: OfertaCompleta
  enlaces: EnlacesCabecera
  urgencia: UrgenciaFechaLimite | null
  acciones?: ReactNode
  aviso?: ReactNode
  /** Distingue en la moderación una oferta que vuelve tras una devolución. */
  conReenvio?: boolean
  /** A quién se le explica la insignia de la gestión asistida. */
  perspectiva?: Perspectiva
}) {
  const { fechas } = oferta
  return (
    <CabeceraFicha
      volver={enlaces.volver}
      antetitulo={`Oferta · ${formatoYPlataforma(oferta)}`}
      titulo={oferta.titulo}
      visual={
        <MarcaPlataforma
          plataforma={oferta.plataforma}
          className="[&>span:first-child]:size-14 [&>span:first-child]:rounded-2xl [&>span:first-child]:text-base sm:[&>span:first-child]:size-16 sm:[&>span:first-child]:text-lg"
        />
      }
      subtitulo={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {enlaces.anunciante ? (
            <EnlaceFicha
              href={enlaces.anunciante.href}
              permitido={enlaces.anunciante.permitido}
              className="inline-flex items-center gap-1.5 font-medium text-foreground"
            >
              <Building2
                aria-hidden
                className="size-3.5 text-muted-foreground"
              />
              {oferta.anunciante.nombre ?? "Anunciante"}
            </EnlaceFicha>
          ) : null}
          <EnlaceFicha
            href={enlaces.campana.href}
            permitido={enlaces.campana.permitido}
            className="inline-flex items-center gap-1.5 font-medium text-foreground"
          >
            <Megaphone aria-hidden className="size-3.5 text-muted-foreground" />
            <span className="sr-only">Campaña: </span>
            {oferta.campana.nombre}
          </EnlaceFicha>
          <span className="inline-flex items-center gap-1.5 cifras">
            <CalendarRange aria-hidden className="size-3.5" />
            <span className="sr-only">Ventana de publicación: </span>
            {formatearRangoCompacto(oferta.ventanaInicio, oferta.ventanaFin)}
          </span>
        </span>
      }
      distintivos={
        <>
          <InsigniaEstado catalogo={ESTADOS_OFERTA} estado={oferta.estado} />
          {urgencia && urgencia.nivel !== "holgada" ? (
            <InsigniaTono tono={urgencia.tono} etiqueta={urgencia.texto} />
          ) : null}
          {conReenvio ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-full border border-info/40 bg-info/8 px-2.5 text-xs font-medium text-info">
              <RotateCcw aria-hidden className="size-3" />
              Reenvío
            </span>
          ) : null}
          {oferta.gestionAsistida ? (
            <InsigniaGestionAsistida
              voz={perspectiva === "anunciante" ? "propio" : "asistido"}
            />
          ) : null}
        </>
      }
      lateral={
        <>
          <Fecha etiqueta="Creada el" valor={fechas.creadaAt} />
          <Fecha etiqueta="Enviada a revisión el" valor={fechas.enviadaAt} />
          <Fecha etiqueta="Publicada el" valor={fechas.publicadaAt} />
          <Fecha etiqueta="Cancelada el" valor={fechas.canceladaAt} />
        </>
      }
      acciones={acciones}
      aviso={aviso}
    />
  )
}
