import {
  BadgeCheck,
  Building2,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleOff,
  CircleX,
  ClipboardList,
  FileText,
  Hourglass,
  type LucideIcon,
  Quote,
  UserRound,
} from "lucide-react"
import Link from "next/link"
import { type ReactNode, useId } from "react"

import { InsigniaTono } from "@/features/operacion/components/distintivos"
import type { Tono } from "@/features/usuarios/presentacion"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  type EstadoPaso,
  etiquetaPaso,
  ID_SITUACION_VERIFICACION,
  type IdPasoVerificacion,
  type PasoVerificacion,
  presentarSituacionEmpresa,
  type ProgresoVerificacion,
  type SituacionEmpresa,
} from "../verificacion"

const ICONOS_SITUACION: Readonly<Record<SituacionEmpresa["tipo"], LucideIcon>> =
  {
    alta: ClipboardList,
    "en-revision": Hourglass,
    rechazado: CircleX,
    verificado: BadgeCheck,
    suspendido: CircleOff,
  }

const TINTES: Readonly<Record<Tono, string>> = {
  exito: "bg-success/12 text-success ring-success/25",
  info: "bg-primary/10 text-primary ring-primary/20",
  aviso: "bg-warning/12 text-warning ring-warning/30",
  peligro: "bg-destructive/10 text-destructive ring-destructive/25",
  neutro: "bg-muted text-muted-foreground ring-border",
}

const ICONOS_PASO: Readonly<Record<IdPasoVerificacion, LucideIcon>> = {
  datos: Building2,
  contacto: UserRound,
  documentos: FileText,
}

const MARCA: Readonly<Record<EstadoPaso, string>> = {
  completo: "bg-success/12 text-success ring-success/25",
  "en-curso": "bg-info/10 text-info ring-info/25",
  pendiente: "bg-muted text-muted-foreground ring-border",
  atencion: "bg-warning/12 text-warning ring-warning/30",
}

function MarcaPaso({ paso }: { paso: PasoVerificacion }) {
  const Icono =
    paso.estado === "atencion"
      ? CircleAlert
      : paso.estado === "completo"
        ? CircleCheck
        : ICONOS_PASO[paso.id]
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset",
        MARCA[paso.estado]
      )}
    >
      <Icono className="size-5" />
    </span>
  )
}

/** Pasos como lista ordenada: cada renglón lleva a donde se completa. */
function ListaPasos({ pasos }: { pasos: readonly PasoVerificacion[] }) {
  return (
    <ol className="-mx-5 divide-y border-y sm:-mx-6">
      {pasos.map((paso) => {
        const { etiqueta, tono } = etiquetaPaso(paso)
        return (
          <li key={paso.id}>
            <Link
              href={paso.href}
              className="group flex min-h-18 items-center gap-3 px-5 py-3.5 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:anillo-foco focus-visible:-outline-offset-2 sm:gap-4 sm:px-6"
            >
              <MarcaPaso paso={paso} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{paso.titulo}</span>
                  <InsigniaTono
                    tono={tono}
                    etiqueta={etiqueta}
                    className="h-5"
                  />
                </span>
                <span className="text-sm text-pretty break-words text-muted-foreground">
                  {paso.detalle}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

function BarraProgreso({ progreso }: { progreso: ProgresoVerificacion }) {
  const id = useId()
  const completo = progreso.completos === progreso.total
  return (
    <div className="flex flex-col gap-1.5">
      <p id={id} className="text-sm text-muted-foreground">
        <span className="font-semibold cifras text-foreground">
          {formatearNumero(progreso.completos)}
        </span>{" "}
        de {formatearNumero(progreso.total)} pasos listos
      </p>
      <div
        role="progressbar"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={progreso.total}
        aria-valuenow={progreso.completos}
        aria-valuetext={`${progreso.completos} de ${progreso.total} pasos listos`}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-suave motion-reduce:transition-none",
            completo ? "bg-success" : "bg-primary"
          )}
          style={{ width: `${Math.round(progreso.fraccion * 100)}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Situación de la verificación de la empresa: en alta (con su avance y los
 * pasos), en revisión desde cuándo, verificada, rechazada o suspendida con el
 * motivo que dejó el equipo AMO. `acciones` lleva el envío a verificación.
 */
export function TarjetaVerificacion({
  situacion,
  pasos,
  progreso,
  acciones,
  className,
}: {
  situacion: SituacionEmpresa
  /** Mientras se verifica: los pasos y su avance. */
  pasos?: readonly PasoVerificacion[]
  progreso?: ProgresoVerificacion
  acciones?: ReactNode
  className?: string
}) {
  const faltantes = pasos?.filter((paso) => !paso.listo).length ?? 0
  const { titulo, descripcion, tono } = presentarSituacionEmpresa(
    situacion,
    faltantes
  )
  const Icono = ICONOS_SITUACION[situacion.tipo]
  const motivo =
    situacion.tipo === "rechazado" || situacion.tipo === "suspendido"
      ? situacion.motivo
      : null
  return (
    <section
      aria-labelledby={ID_SITUACION_VERIFICACION}
      className={cn(
        "relative isolate flex flex-col gap-4 overflow-hidden rounded-2xl border bg-card p-5 sm:p-6",
        className
      )}
    >
      {situacion.tipo === "verificado" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full bg-aurora opacity-20 blur-3xl dark:opacity-25"
        />
      ) : null}
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-2xl ring-1 ring-inset",
            TINTES[tono]
          )}
        >
          <Icono className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          {/* Destino del foco tras enviar a verificación (el botón desaparece). */}
          <h2
            id={ID_SITUACION_VERIFICACION}
            tabIndex={-1}
            className="rounded-sm font-heading text-lg leading-snug font-semibold text-balance sm:text-xl"
          >
            {titulo}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {descripcion}
          </p>
        </div>
      </div>
      {motivo || situacion.tipo === "rechazado" ? (
        <figure className="flex gap-3 rounded-xl border bg-muted/30 p-3.5">
          <Quote
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <figcaption className="text-xs font-medium text-muted-foreground">
              Motivo del equipo AMO
            </figcaption>
            <blockquote className="text-sm break-words whitespace-pre-line">
              {motivo ??
                "No dejó un motivo escrito. Revisa tus documentos y escríbele al equipo de AMO si tienes dudas."}
            </blockquote>
          </div>
        </figure>
      ) : null}
      {progreso && situacion.tipo !== "en-revision" ? (
        <BarraProgreso progreso={progreso} />
      ) : null}
      {pasos && pasos.length > 0 ? <ListaPasos pasos={pasos} /> : null}
      {acciones}
    </section>
  )
}
