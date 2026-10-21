import { ShieldAlert, ShieldCheck } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import {
  formatearFechaHora,
  formatearNumero,
  formatearRelativo,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { EVENTOS } from "../catalogo"
import type { ConteoEvento } from "../desglose"
import type { AccesoFila } from "../tipos"
import { BotonVerSospechosos } from "./boton-ver-sospechosos"
import { Bandera, IconoEvento, InsigniaSospecha } from "./distintivos"

function lugar(acceso: AccesoFila): string {
  return (
    [acceso.ciudad, acceso.pais].filter(Boolean).join(", ") ||
    "Ubicación desconocida"
  )
}

function Persona({
  acceso,
  enlazar,
}: {
  acceso: AccesoFila
  enlazar: boolean
}) {
  if (!acceso.usuario) {
    return (
      <span className="text-muted-foreground">Correo sin cuenta en AMO</span>
    )
  }
  if (!enlazar) return <span className="truncate">{acceso.usuario.nombre}</span>
  return (
    <Link
      href={`/administracion/usuarios/${acceso.usuario.id}` as Route}
      className="truncate rounded-sm hover:underline focus-visible:anillo-foco"
    >
      {acceso.usuario.nombre}
    </Link>
  )
}

function Alerta({
  acceso,
  enlazar,
  indice,
}: {
  acceso: AccesoFila
  enlazar: boolean
  indice: number
}) {
  return (
    <li
      style={{ animationDelay: `${120 + indice * 50}ms` }}
      className="flex animate-aparecer-arriba items-start gap-3 py-2.5 first:pt-0 motion-reduce:animate-none"
    >
      <Bandera
        bandera={acceso.bandera}
        iso2={acceso.paisIso2}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
          <Persona acceso={acceso} enlazar={enlazar} />
          <InsigniaSospecha motivo={acceso.motivoSospecha} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {acceso.etiquetaEvento} · {lugar(acceso)}
        </p>
      </div>
      <time
        dateTime={acceso.at}
        title={formatearFechaHora(acceso.at)}
        className="shrink-0 pt-0.5 text-xs text-muted-foreground"
      >
        {formatearRelativo(acceso.at)}
      </time>
    </li>
  )
}

function EventosDeSesion({ conteos }: { conteos: readonly ConteoEvento[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        Eventos de sesión
      </h3>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-1">
        {conteos.map(({ evento, cantidad }) => (
          // Sin actividad: el icono se apaga y la cifra baja de peso; el texto
          // conserva el contraste AA.
          <div key={evento} className="flex min-w-0 items-center gap-2.5">
            <IconoEvento
              evento={evento}
              resultado={cantidad === 0 ? "INFO" : EVENTOS[evento].resultado}
              className={cn(
                "size-6 rounded-md [&_svg]:size-3",
                cantidad === 0 && "opacity-50"
              )}
            />
            <dt className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted-foreground">
              {EVENTOS[evento].etiqueta}
            </dt>
            <dd
              className={cn(
                "text-sm cifras",
                cantidad === 0
                  ? "text-muted-foreground"
                  : "font-medium text-foreground"
              )}
            >
              {formatearNumero(cantidad)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * Seguridad del periodo: los accesos sospechosos más recientes (país inusual,
 * fallos repetidos…) con atajo al registro filtrado, y el desglose de los
 * eventos de sesión. Sin alertas, la cabecera lo confirma en verde.
 */
export function PanelSeguridad({
  alertas,
  total,
  conteos,
  enlazarUsuarios,
  className,
}: {
  alertas: readonly AccesoFila[]
  total: number
  conteos: readonly ConteoEvento[]
  /** Quien consulta puede abrir la ficha de usuario (`usuarios.ver`). */
  enlazarUsuarios: boolean
  className?: string
}) {
  const hay = total > 0
  return (
    <section
      aria-labelledby="titulo-seguridad-accesos"
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5",
        hay &&
          "border-warning/40 bg-[linear-gradient(170deg,color-mix(in_oklab,var(--warning)_8%,var(--card))_0%,var(--card)_55%)]",
        className
      )}
    >
      <header className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl",
            hay ? "bg-warning/14 text-warning" : "bg-success/12 text-success"
          )}
        >
          {hay ? (
            <ShieldAlert className="size-[1.125rem]" aria-hidden />
          ) : (
            <ShieldCheck className="size-[1.125rem]" aria-hidden />
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            id="titulo-seguridad-accesos"
            className="font-heading text-[0.9375rem] leading-snug font-semibold"
          >
            {hay ? "Alertas de seguridad" : "Sin alertas de seguridad"}
          </h2>
          <p className="text-[0.8125rem] text-muted-foreground">
            {hay
              ? `${formatearNumero(total)} ${total === 1 ? "acceso sospechoso" : "accesos sospechosos"} en el periodo`
              : "Se marca un ingreso desde un país no usado en 90 días o tras varios fallos seguidos."}
          </p>
        </div>
      </header>

      {hay ? (
        <div className="flex flex-col gap-2">
          <ol className="flex flex-col divide-y">
            {alertas.map((acceso, indice) => (
              <Alerta
                key={acceso.id}
                acceso={acceso}
                enlazar={enlazarUsuarios}
                indice={indice}
              />
            ))}
          </ol>
          <BotonVerSospechosos className="self-end">
            {total > alertas.length
              ? `Ver los ${formatearNumero(total)} en el registro`
              : "Ver en el registro"}
          </BotonVerSospechosos>
        </div>
      ) : null}

      <div className={cn("mt-auto border-t pt-4", !hay && "mt-0")}>
        <EventosDeSesion conteos={conteos} />
      </div>
    </section>
  )
}
