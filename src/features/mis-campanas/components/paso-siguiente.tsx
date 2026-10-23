"use client"

import {
  ArrowRight,
  Ban,
  ChartColumn,
  CircleCheck,
  CircleSlash,
  Download,
  Hourglass,
  ImageUp,
  LockKeyhole,
  type LucideIcon,
  PencilLine,
  Scale,
  TimerOff,
} from "lucide-react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { CuentaRegresiva } from "@/components/tiempo/cuenta-regresiva"
import { useAhora } from "@/components/tiempo/use-ahora"
import { formatearFechaHora } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  DESCRIPCION_ACCION,
  disponibilidadAccion,
  TEXTO_BOTON_ACCION,
} from "../siguiente-accion"
import type { AccionMedio, PasoMedio, TipoAccionMedio } from "../tipos"

const ICONOS_ACCION: Readonly<Record<TipoAccionMedio, LucideIcon>> = {
  DESCARGAR: Download,
  DESCARGAR_NUEVA_VERSION: Download,
  PUBLICAR: ImageUp,
  CORREGIR_EVIDENCIA: PencilLine,
  CARGAR_METRICA: ChartColumn,
  CORREGIR_METRICAS: PencilLine,
}

/** Un corte que aún no se cumple no es urgente: siempre en tono neutro. */
const SIN_URGENCIA = { criticaHoras: 0, prontoHoras: 0 }

const ES_METRICA: ReadonlySet<TipoAccionMedio> = new Set([
  "CARGAR_METRICA",
  "CORREGIR_METRICAS",
])

function IconoAccion({
  tipo,
  className,
}: {
  tipo: TipoAccionMedio
  className?: string
}) {
  const Icono = ICONOS_ACCION[tipo]
  return <Icono aria-hidden className={className} />
}

/**
 * El plazo de la acción: cuándo se habilita (un corte que aún no se cumple),
 * cuándo vence o desde cuándo venció. Lo usa también el pie de la ficha.
 */
export function PlazoAccion({
  accion,
  ahora,
  ahoraServidor,
  variante = "insignia",
}: {
  accion: AccionMedio
  ahora: Date
  ahoraServidor: number
  variante?: "insignia" | "texto"
}) {
  const disponibilidad = disponibilidadAccion(accion, ahora)
  if (disponibilidad === "bloqueada") {
    return (
      <CuentaRegresiva
        venceAt={accion.disponibleDesde}
        ahoraServidor={ahoraServidor}
        etiqueta="Se habilita el corte"
        textos={{ pendiente: "Se habilita en", vencido: "Habilitado hace" }}
        umbrales={SIN_URGENCIA}
        variante={variante}
      />
    )
  }
  return (
    <CuentaRegresiva
      venceAt={accion.venceAt}
      ahoraServidor={ahoraServidor}
      etiqueta={accion.etiquetaPlazo}
      variante={variante}
    />
  )
}

/** Aclaración bajo el plazo cuando ya pasó o aún no empieza. */
function NotaPlazo({ accion, ahora }: { accion: AccionMedio; ahora: Date }) {
  const disponibilidad = disponibilidadAccion(accion, ahora)
  if (disponibilidad === "bloqueada" && accion.disponibleDesde) {
    return (
      <p className="text-xs text-muted-foreground">
        Podrás cargarlas desde el {formatearFechaHora(accion.disponibleDesde)}.
      </p>
    )
  }
  if (disponibilidad === "vencida") {
    return (
      <p className="text-xs text-muted-foreground">
        {ES_METRICA.has(accion.tipo)
          ? "Aún puedes cargarlas: el equipo AMO verá que llegaron tarde."
          : "El plazo ya pasó: si crees que es un error, escríbele al equipo AMO."}
      </p>
    )
  }
  return null
}

export interface PasoSiguienteProps {
  paso: PasoMedio
  /** `Date.now()` del servidor al pintar (hidratación sin desajustes). */
  ahoraServidor: number
  /** El rol puede ejecutar (descargar, cargar evidencia y métricas). */
  puedeEjecutar: boolean
  /** `tarjeta`: compacto, en el tablero; `ficha`: con la explicación. */
  variante?: "tarjeta" | "ficha"
  /** Sin el botón (cuando la acción ya está en el pie de la pantalla). */
  sinBoton?: boolean
  className?: string
}

/**
 * Lo que sigue en una asignación: la acción con su plazo y el botón que
 * lleva a hacerla, la espera mientras el equipo AMO revisa, el plazo para
 * reclamar una vencida o cómo terminó. La cuenta regresiva se actualiza sola.
 */
export function PasoSiguiente({
  paso,
  ahoraServidor,
  puedeEjecutar,
  variante = "tarjeta",
  sinBoton = false,
  className,
}: PasoSiguienteProps) {
  const ahora = useAhora(ahoraServidor)
  const enFicha = variante === "ficha"

  if (paso.tipo === "accion") {
    const { accion } = paso
    const bloqueada = disponibilidadAccion(accion, ahora) === "bloqueada"
    return (
      <div className={cn("flex flex-col gap-2.5", className)}>
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden
            className={cn(
              "grid shrink-0 place-items-center rounded-lg bg-primary/12 text-primary",
              enFicha ? "size-10" : "size-8"
            )}
          >
            {bloqueada ? (
              <LockKeyhole className="size-4" />
            ) : (
              <IconoAccion tipo={accion.tipo} className="size-4" />
            )}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p
              className={cn(
                "leading-snug font-semibold text-pretty",
                enFicha ? "text-base" : "text-sm"
              )}
            >
              {accion.etiqueta}
            </p>
            {enFicha ? (
              <p className="text-sm text-pretty text-muted-foreground">
                {DESCRIPCION_ACCION[accion.tipo]}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1">
            <PlazoAccion
              accion={accion}
              ahora={ahora}
              ahoraServidor={ahoraServidor}
            />
            {enFicha ? <NotaPlazo accion={accion} ahora={ahora} /> : null}
          </div>
          {puedeEjecutar && !sinBoton ? (
            <EnlaceBoton
              href={accion.ruta}
              size="sm"
              variant={bloqueada ? "outline" : "default"}
              className="relative z-10 max-sm:w-full"
            >
              {TEXTO_BOTON_ACCION[accion.tipo]}
              <ArrowRight data-icon="inline-end" aria-hidden />
            </EnlaceBoton>
          ) : null}
        </div>
      </div>
    )
  }

  if (paso.tipo === "reclamo") {
    const abierto =
      paso.hasta !== null && new Date(paso.hasta).getTime() > ahora.getTime()
    return (
      <div className={cn("flex items-start gap-2.5", className)}>
        <span
          aria-hidden
          className={cn(
            "grid shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive",
            enFicha ? "size-10" : "size-8"
          )}
        >
          <TimerOff className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p
            className={cn(
              "leading-snug font-semibold",
              enFicha ? "text-base" : "text-sm"
            )}
          >
            {abierto
              ? "Puedes reclamar si publicaste a tiempo"
              : "El plazo para publicar se venció"}
          </p>
          {abierto && paso.hasta ? (
            <>
              <CuentaRegresiva
                venceAt={paso.hasta}
                ahoraServidor={ahoraServidor}
                etiqueta="Plazo para reclamar"
                textos={{ pendiente: "Reclama en", vencido: "Cerró hace" }}
              />
              {enFicha ? (
                <p className="text-sm text-pretty text-muted-foreground">
                  Tienes hasta el {formatearFechaHora(paso.hasta)}. Muy pronto
                  podrás abrir el reclamo desde aquí; mientras tanto, el equipo
                  AMO lo atiende directamente: escríbele y menciona esta
                  campaña.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-pretty text-muted-foreground">
              {paso.hasta
                ? `El plazo para reclamar terminó el ${formatearFechaHora(paso.hasta)}.`
                : "El cupo se liberó para otro medio."}
            </p>
          )}
        </div>
      </div>
    )
  }

  const { titulo, descripcion } = paso
  const Icono =
    paso.tipo === "espera"
      ? paso.disputa
        ? Scale
        : Hourglass
      : paso.tono === "exito"
        ? CircleCheck
        : paso.tono === "peligro"
          ? Ban
          : CircleSlash
  const tono =
    paso.tipo === "espera"
      ? "bg-warning/12 text-warning"
      : paso.tono === "exito"
        ? "bg-success/12 text-success"
        : paso.tono === "peligro"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground"
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center rounded-lg",
          enFicha ? "size-10" : "size-8",
          tono
        )}
      >
        <Icono className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p
          className={cn(
            "leading-snug font-semibold",
            enFicha ? "text-base" : "text-sm"
          )}
        >
          {titulo}
        </p>
        {descripcion ? (
          <p className="text-sm text-pretty text-muted-foreground">
            {descripcion}
          </p>
        ) : null}
      </div>
    </div>
  )
}
