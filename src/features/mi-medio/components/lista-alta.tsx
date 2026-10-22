import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  FileText,
  Landmark,
  type LucideIcon,
  ScrollText,
  Share2,
  Store,
} from "lucide-react"
import Link from "next/link"
import { type ReactNode, useId } from "react"

import { InsigniaTono } from "@/features/operacion/components/distintivos"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { EstadoPaso, IdPasoAlta, PasoAlta, ProgresoAlta } from "../alta"
import { ESTADOS_PASO } from "../presentacion"

const ICONOS: Readonly<Record<IdPasoAlta, LucideIcon>> = {
  perfil: Store,
  documentos: FileText,
  pago: Landmark,
  cuentas: Share2,
  terminos: ScrollText,
}

const MARCA: Readonly<Record<EstadoPaso, string>> = {
  completo: "bg-success/12 text-success ring-success/25",
  "en-curso": "bg-info/10 text-info ring-info/25",
  pendiente: "bg-muted text-muted-foreground ring-border",
  atencion: "bg-warning/12 text-warning ring-warning/30",
}

/** Ícono del paso: el del tema, o un visto o una alerta según su estado. */
function MarcaPaso({ paso }: { paso: PasoAlta }) {
  const Icono =
    paso.estado === "atencion"
      ? CircleAlert
      : paso.listo
        ? CircleCheck
        : ICONOS[paso.id]
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

function ContenidoPaso({ paso }: { paso: PasoAlta }) {
  const { etiqueta, tono } = ESTADOS_PASO[paso.estado]
  return (
    <>
      <MarcaPaso paso={paso} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{paso.titulo}</span>
          <InsigniaTono tono={tono} etiqueta={etiqueta} className="h-5" />
        </span>
        <span className="text-sm text-pretty text-muted-foreground">
          {paso.detalle}
        </span>
      </span>
    </>
  )
}

const FILA =
  "flex min-h-18 items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-5"

/**
 * Pasos del alta como una lista ordenada: cada uno lleva a la pantalla donde
 * se completa (todo el renglón es el enlace, cómodo para el pulgar). Sirve
 * en «Mi medio» y en el inicio del medio.
 */
export function ListaAlta({
  pasos,
  progreso,
  titulo,
  descripcion,
  acciones,
  className,
}: {
  pasos: readonly PasoAlta[]
  /** Sin él no se dibuja la barra de avance (medio ya verificado). */
  progreso?: ProgresoAlta
  titulo: string
  descripcion?: ReactNode
  /** Botones al pie (enviar a verificación). */
  acciones?: ReactNode
  className?: string
}) {
  const idTitulo = useId()
  const idProgreso = useId()
  const porcentaje = progreso ? Math.round(progreso.fraccion * 100) : 0
  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card",
        className
      )}
    >
      <header className="flex flex-col gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id={idTitulo}
              className="font-heading text-base leading-snug font-semibold"
            >
              {titulo}
            </h2>
            {descripcion ? (
              <p className="text-sm text-muted-foreground">{descripcion}</p>
            ) : null}
          </div>
          {progreso ? (
            <p
              id={idProgreso}
              className="shrink-0 text-sm text-muted-foreground"
            >
              <span className="font-semibold text-foreground cifras">
                {formatearNumero(progreso.completos)}
              </span>{" "}
              de {formatearNumero(progreso.total)}
              <span className="sr-only"> pasos listos</span>
            </p>
          ) : null}
        </div>
        {progreso ? (
          <div
            role="progressbar"
            aria-labelledby={idProgreso}
            aria-valuemin={0}
            aria-valuemax={progreso.total}
            aria-valuenow={progreso.completos}
            aria-valuetext={`${progreso.completos} de ${progreso.total} pasos listos`}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700 ease-suave motion-reduce:transition-none",
                progreso.completos === progreso.total
                  ? "bg-success"
                  : "bg-primary"
              )}
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        ) : null}
      </header>
      <ol className="divide-y border-t">
        {pasos.map((paso) => (
          <li key={paso.id}>
            {paso.href ? (
              <Link
                href={paso.href}
                className={cn(
                  FILA,
                  "group transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:anillo-foco focus-visible:-outline-offset-2"
                )}
              >
                <ContenidoPaso paso={paso} />
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
                />
              </Link>
            ) : (
              <div className={FILA}>
                <ContenidoPaso paso={paso} />
              </div>
            )}
          </li>
        ))}
      </ol>
      {acciones ? (
        <footer className="flex flex-col gap-3 border-t bg-muted/30 px-4 py-4 sm:px-5">
          {acciones}
        </footer>
      ) : null}
    </section>
  )
}
