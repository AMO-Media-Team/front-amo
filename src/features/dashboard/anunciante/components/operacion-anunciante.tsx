import {
  AlarmClock,
  ArrowRight,
  CalendarX2,
  CircleCheck,
  type LucideIcon,
  Megaphone,
  MessageSquareWarning,
  Plus,
  Rocket,
} from "lucide-react"
import Link from "next/link"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { ConteosOfertas } from "@/features/campanas/components/distintivos-campana"
import { textoFase } from "@/features/campanas/presentacion"
import type { Atencion, MotivoAtencion } from "@/features/campanas/reglas"
import {
  RUTA_MIS_CAMPANAS,
  RUTA_NUEVA_CAMPANA,
  rutaMiCampana,
  rutaMisCampanasEn,
} from "@/features/campanas/rutas"
import type { CampanaActiva, OfertaPorAtender } from "@/features/campanas/tipos"
import { rutaOfertaAnunciante } from "@/features/ofertas/rutas"
import { BarraLlenado } from "@/features/operacion/components/distintivos"
import { proporcion } from "@/features/operacion/calculos"
import type { Tono } from "@/features/operacion/estados"
import { formatearCOPCompacto, formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { TarjetaPanel } from "../../components/tarjeta-panel"
import { presentarAtencion } from "../operacion"

const ICONOS: Readonly<Record<MotivoAtencion, LucideIcon>> = {
  devuelta: MessageSquareWarning,
  envio_vencido: CalendarX2,
  envio_proximo: AlarmClock,
}

const TINTES: Readonly<Record<Tono, { chip: string; barra: string }>> = {
  aviso: { chip: "bg-warning/12 text-warning", barra: "bg-warning" },
  peligro: {
    chip: "bg-destructive/12 text-destructive",
    barra: "bg-destructive",
  },
  info: { chip: "bg-primary/10 text-primary", barra: "bg-primary/50" },
  exito: { chip: "bg-success/12 text-success", barra: "bg-success" },
  neutro: { chip: "bg-muted text-muted-foreground", barra: "bg-border" },
}

function ItemAtencion({
  atencion,
  ahora,
}: {
  atencion: Atencion<OfertaPorAtender>
  ahora: Date
}) {
  const { oferta } = atencion
  const presentacion = presentarAtencion(atencion, ahora)
  const Icono = ICONOS[atencion.motivo]
  const tinte = TINTES[presentacion.tono]
  return (
    <li className="relative flex items-start gap-3 overflow-hidden rounded-lg border bg-background/40 p-3 pl-3.5 has-[a:focus-visible]:anillo-foco">
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-2 left-0 w-0.5 rounded-full",
          tinte.barra
        )}
      />
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          tinte.chip
        )}
      >
        <Icono className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={rutaOfertaAnunciante(oferta.campanaId, oferta.id)}
          className="truncate text-[0.8125rem] leading-snug font-semibold outline-none after:absolute after:inset-0 hover:underline"
          title={oferta.titulo}
        >
          {oferta.titulo}
        </Link>
        <span className="text-xs font-medium">{presentacion.titulo}</span>
        <span className="line-clamp-2 text-xs text-pretty text-muted-foreground">
          {presentacion.detalle}
        </span>
        <span className="truncate text-[0.6875rem] text-muted-foreground">
          {[oferta.campana, oferta.formato].filter(Boolean).join(" · ")}
        </span>
      </span>
    </li>
  )
}

/**
 * Ofertas que esperan algo del anunciante: las devueltas por AMO (con el
 * inicio de su comentario) y los borradores cuyo plazo para enviarse a
 * revisión vence pronto o ya no alcanza. Cada una lleva a su ficha.
 */
export function OfertasPorAtenderPanel({
  atenciones,
  total,
  ahora,
  className,
}: {
  atenciones: readonly Atencion<OfertaPorAtender>[]
  /** Todas las que piden atención (el panel muestra las primeras). */
  total: number
  ahora: Date
  className?: string
}) {
  return (
    <TarjetaPanel
      titulo="Requieren tu atención"
      descripcion="Ofertas devueltas por AMO y borradores con el plazo encima."
      icono={MessageSquareWarning}
      className={className}
      pie={
        total > atenciones.length
          ? `Y ${formatearNumero(total - atenciones.length)} más en tus campañas.`
          : null
      }
      enlace={
        total > 0
          ? { href: RUTA_MIS_CAMPANAS, texto: "Ir a mis campañas" }
          : undefined
      }
    >
      {atenciones.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed bg-background/40 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success/12 text-success">
            <CircleCheck aria-hidden className="size-4.5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold">Nada pendiente</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              Ninguna oferta devuelta ni borradores con el plazo encima.
            </p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Ofertas por atender">
          {atenciones.map((atencion) => (
            <ItemAtencion
              key={atencion.oferta.id}
              atencion={atencion}
              ahora={ahora}
            />
          ))}
        </ul>
      )}
    </TarjetaPanel>
  )
}

function ItemCampana({
  campana,
  hoy,
}: {
  campana: CampanaActiva
  hoy: string
}) {
  const fase = textoFase({ ...campana, estado: "ACTIVA" }, hoy)
  const uso = proporcion(
    campana.presupuestoComprometido,
    campana.presupuestoTotal
  )
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 @md/bloque:flex-row @md/bloque:items-center @md/bloque:gap-4">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={rutaMiCampana(campana.id)}
          className="truncate text-[0.8125rem] font-semibold underline-offset-4 hover:underline focus-visible:underline"
        >
          {campana.nombre}
        </Link>
        <span className="truncate text-xs text-muted-foreground">
          {campana.marca}
          {fase ? ` · ${fase.texto}` : ""}
        </span>
        <ConteosOfertas
          porEstado={campana.ofertasPorEstado}
          vacio="Aún sin ofertas"
        />
      </span>
      <span className="flex w-full shrink-0 flex-col gap-1 @md/bloque:w-36 @md/bloque:items-end">
        <span className="text-xs cifras">
          <span className="font-medium">
            {formatearCOPCompacto(campana.presupuestoComprometido)}
          </span>
          <span className="text-muted-foreground">
            {" "}
            / {formatearCOPCompacto(campana.presupuestoTotal)} comprometido
          </span>
        </span>
        <BarraLlenado fraccion={uso} tono="info" />
      </span>
    </li>
  )
}

/**
 * Campañas activas de la empresa, la que termina primero arriba, con sus
 * ofertas por estado y el presupuesto comprometido; «Crear campaña» a mano.
 */
export function CampanasActivasPanel({
  campanas,
  total,
  hoy,
  puedeCrear,
  className,
}: {
  campanas: readonly CampanaActiva[]
  total: number
  /** Hoy en Bogotá ('YYYY-MM-DD'). */
  hoy: string
  puedeCrear: boolean
  className?: string
}) {
  return (
    <TarjetaPanel
      titulo="Campañas activas"
      descripcion="Las que están en curso, con sus ofertas por estado."
      icono={Rocket}
      className={className}
      acciones={
        // Sin activas, el estado vacío ya ofrece crear la primera.
        puedeCrear && campanas.length > 0 ? (
          <EnlaceBoton href={RUTA_NUEVA_CAMPANA} size="sm" variant="outline">
            <Plus data-icon="inline-start" aria-hidden />
            Crear campaña
          </EnlaceBoton>
        ) : null
      }
      enlace={
        total > campanas.length
          ? {
              href: rutaMisCampanasEn("ACTIVA"),
              texto: `Ver las ${formatearNumero(total)} activas`,
            }
          : { href: RUTA_MIS_CAMPANAS, texto: "Ver todas mis campañas" }
      }
    >
      {campanas.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed bg-background/40 p-4 @md/bloque:flex-row @md/bloque:items-center">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Megaphone aria-hidden className="size-4.5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-sm font-semibold">No tienes campañas activas</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              Crea una campaña, actívala y envía sus ofertas a revisión para
              llegar a los medios.
            </p>
          </div>
          {puedeCrear ? (
            <EnlaceBoton href={RUTA_NUEVA_CAMPANA} size="sm">
              Crear campaña
              <ArrowRight data-icon="inline-end" aria-hidden />
            </EnlaceBoton>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col divide-y" aria-label="Campañas activas">
          {campanas.map((campana) => (
            <ItemCampana key={campana.id} campana={campana} hoy={hoy} />
          ))}
        </ul>
      )}
    </TarjetaPanel>
  )
}
