import {
  Info,
  type LucideIcon,
  Megaphone,
  ShieldCheck,
  Star,
  TrendingUp,
} from "lucide-react"
import { useId } from "react"

import {
  formatearFactor,
  type ResumenMultiplicador,
} from "@/features/calidad-medio/calidad"
import {
  formatearFechaHora,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  detalleCumplimiento,
  META_CUMPLIMIENTO,
  publicaciones,
  type SituacionCumplimiento,
  situacionCumplimiento,
  TEXTO_CALIFICACION_PENDIENTE,
  textoMeta,
  valorCumplimiento,
  VENTANA_REPUTACION_DIAS,
} from "../datos"
import type { Reputacion } from "../tipos"

/** Más segmentos no caben a 390 px: desde ahí basta el texto. */
const SEGMENTOS_MAXIMOS = 10

function Indicador({
  etiqueta,
  Icono,
  valor,
  nota,
  detalle,
}: {
  etiqueta: string
  Icono: LucideIcon
  valor: string
  nota: string
  detalle?: string | null
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border bg-background/40 p-3 sm:p-4">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icono aria-hidden className="size-3.5 shrink-0 text-primary" />
        {etiqueta}
      </dt>
      <dd className="font-heading text-xl leading-tight font-semibold cifras tracking-tight">
        {valor}
      </dd>
      <dd className="text-[0.6875rem] leading-snug text-pretty text-muted-foreground">
        {nota}
      </dd>
      {detalle ? (
        <dd className="text-[0.6875rem] leading-snug text-muted-foreground">
          {detalle}
        </dd>
      ) : null}
    </div>
  )
}

/** La tasa frente a la meta (barra con la marca del 90 %). */
function BarraTasa({
  situacion,
}: {
  situacion: Extract<SituacionCumplimiento, { tipo: "tasa" }>
}) {
  const porcentaje = Math.round(situacion.tasa * 100)
  const meta = formatearPorcentaje(META_CUMPLIMIENTO, 0)
  return (
    <div className="relative pt-1 pb-5">
      <div
        role="meter"
        aria-label="Tasa de cumplimiento"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje}
        aria-valuetext={`${formatearPorcentaje(situacion.tasa, 0)}; meta ${meta}`}
        className="h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-suave motion-reduce:transition-none",
            situacion.enMeta ? "bg-success" : "bg-warning"
          )}
          style={{ width: `${situacion.tasa * 100}%` }}
        />
      </div>
      <span
        aria-hidden
        className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
        style={{ left: `${META_CUMPLIMIENTO * 100}%` }}
      >
        <span className="h-[1.125rem] w-0.5 rounded-full bg-foreground/50" />
        <span className="mt-0.5 text-[0.625rem] cifras whitespace-nowrap text-muted-foreground">
          Meta {meta}
        </span>
      </span>
    </div>
  )
}

/** Cuántos casos lleva frente al mínimo (decorativo: el texto lo dice). */
function AvanceMinimo({ n, nMinimo }: { n: number; nMinimo: number }) {
  if (nMinimo > SEGMENTOS_MAXIMOS) return null
  return (
    <div aria-hidden className="flex max-w-60 gap-1.5 pt-1">
      {Array.from({ length: nMinimo }, (_, indice) => (
        <span
          key={indice}
          className={cn(
            "h-2 flex-1 rounded-full",
            indice < n ? "bg-primary" : "bg-muted"
          )}
        />
      ))}
    </div>
  )
}

/**
 * Resumen de la reputación (MED-016), móvil primero: el cumplimiento a hoy en
 * la ventana de 180 días como cifra principal —o «Sin historial suficiente»
 * con cuántos negocios lleva frente al mínimo—, y las publicaciones
 * realizadas, el multiplicador de calidad vigente y la calificación promedio
 * (que llega con la calificación de los anunciantes). Al pie, cuándo se
 * calculó y qué ven los anunciantes.
 */
export function ResumenReputacion({
  reputacion,
  multiplicador,
}: {
  reputacion: Reputacion
  /** El vigente más bajo de sus cuentas; `null` sin cuentas verificadas. */
  multiplicador: ResumenMultiplicador | null
}) {
  const idTitulo = useId()
  const situacion = situacionCumplimiento(reputacion)
  const meta = textoMeta(situacion)
  return (
    <section
      aria-labelledby={idTitulo}
      className="relative isolate flex flex-col gap-4 overflow-hidden rounded-2xl border bg-card p-4 sm:p-6"
    >
      {/* Aurora de marca, tenue: jerarquía de la cifra principal. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full bg-aurora opacity-20 blur-3xl dark:opacity-25"
      />
      <h2 id={idTitulo} className="sr-only">
        Resumen de tu reputación
      </h2>
      <div className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <ShieldCheck aria-hidden className="size-4 shrink-0 text-primary" />
          Cumplimiento · últimos {VENTANA_REPUTACION_DIAS} días
        </p>
        <p
          className={cn(
            "font-heading font-bold tracking-tight",
            situacion.tipo === "tasa"
              ? "text-4xl leading-none cifras sm:text-5xl"
              : "text-2xl leading-tight sm:text-3xl",
            situacion.tipo === "tasa" && situacion.enMeta && "text-success"
          )}
        >
          {valorCumplimiento(situacion)}
        </p>
        <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
          {detalleCumplimiento(situacion)}
          {meta ? ` ${meta}` : null}
        </p>
        {situacion.tipo === "tasa" ? (
          <BarraTasa situacion={situacion} />
        ) : situacion.tipo === "sin-historial" ? (
          <AvanceMinimo n={situacion.n} nMinimo={situacion.nMinimo} />
        ) : null}
      </div>

      <dl className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
        <Indicador
          etiqueta="Publicaciones realizadas"
          Icono={Megaphone}
          valor={formatearNumero(reputacion.publicacionesTotal)}
          nota="Aprobadas por el equipo AMO desde que empezaste"
          detalle={`${publicaciones(reputacion.publicaciones180d)} en los últimos ${VENTANA_REPUTACION_DIAS} días`}
        />
        <Indicador
          etiqueta="Multiplicador de calidad"
          Icono={TrendingUp}
          valor={
            multiplicador ? `${formatearFactor(multiplicador.valor)} ×` : "—"
          }
          nota={
            multiplicador?.nota ??
            "Lo verás cuando tengas una cuenta verificada"
          }
        />
        <Indicador
          etiqueta="Calificación promedio"
          Icono={Star}
          valor="—"
          nota={TEXTO_CALIFICACION_PENDIENTE}
        />
      </dl>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-pretty text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Calculado el {formatearFechaHora(reputacion.calculadaAt)}. Los
          anunciantes ven tu tasa de cumplimiento y tus publicaciones aprobadas,
          actualizadas cada noche.
        </span>
      </p>
    </section>
  )
}
