import {
  ArrowRight,
  BadgeCheck,
  FileClock,
  Hourglass,
  MapPin,
  RadioTower,
  RotateCcw,
  UserRoundSearch,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Monograma } from "@/features/operacion/components/ficha"
import { TIPOS_MEDIO } from "@/features/operacion/estados"
import { contar, unirUbicacion } from "@/features/operacion/formato"
import {
  formatearFecha,
  formatearFechaHora,
  formatearNumero,
  formatearRelativo,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  type AccesoColas,
  COLAS_VERIFICACION,
  rutaRevisionMedio,
} from "../colas"
import { colaMedios } from "../queries"
import type { MedioEnCola, MedioSinEnviar } from "../tipos"
import { PaginacionCola } from "./paginacion-cola"

function Dato({
  icono,
  tono,
  children,
}: {
  icono: ReactNode
  tono?: "aviso" | "exito"
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0",
        tono === "aviso" && "text-warning",
        tono === "exito" && "text-success"
      )}
    >
      {icono}
      {children}
    </span>
  )
}

function TarjetaMedio({ medio }: { medio: MedioEnCola }) {
  const lugar = unirUbicacion(medio.municipio, medio.departamento)
  const ruta = rutaRevisionMedio(medio.id)
  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Monograma
          texto={medio.nombre}
          className="size-11 rounded-xl text-sm sm:size-12 sm:text-base"
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] font-semibold">
            <Link
              href={ruta}
              className="break-words underline-offset-4 hover:underline focus-visible:underline"
            >
              {medio.nombre}
            </Link>
            {medio.reenvio ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full border border-info/40 bg-info/8 px-2 text-[0.6875rem] font-medium text-info">
                <RotateCcw aria-hidden className="size-3" />
                Reenvío
              </span>
            ) : null}
          </h3>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{TIPOS_MEDIO[medio.tipo]}</span>
            {lugar ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden className="size-3.5" />
                {lugar}
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Dato icono={<Hourglass aria-hidden />}>
              <span title={formatearFechaHora(medio.enviadoAt)}>
                Enviado{" "}
                <time dateTime={medio.enviadoAt} suppressHydrationWarning>
                  {formatearRelativo(medio.enviadoAt)}
                </time>
              </span>
            </Dato>
            {medio.documentosPorRevisar !== null ? (
              <Dato
                icono={<FileClock aria-hidden />}
                tono={medio.documentosPorRevisar > 0 ? "aviso" : undefined}
              >
                {medio.documentosPorRevisar > 0
                  ? contar(
                      medio.documentosPorRevisar,
                      "documento por revisar",
                      "documentos por revisar"
                    )
                  : "Documentos revisados"}
              </Dato>
            ) : null}
            <Dato
              icono={<UserRoundSearch aria-hidden />}
              tono={medio.cuentasPorVerificar > 0 ? "aviso" : undefined}
            >
              {medio.cuentasPorVerificar > 0
                ? contar(
                    medio.cuentasPorVerificar,
                    "cuenta por verificar",
                    "cuentas por verificar"
                  )
                : "Sin cuentas por verificar"}
            </Dato>
            <Dato
              icono={<BadgeCheck aria-hidden />}
              tono={medio.cuentasVerificadas > 0 ? "exito" : undefined}
            >
              {contar(
                medio.cuentasVerificadas,
                "cuenta verificada",
                "cuentas verificadas"
              )}
            </Dato>
          </div>
        </div>
      </div>
      <EnlaceBoton
        href={ruta}
        size="lg"
        className="w-full shrink-0 sm:w-auto"
        aria-label={`Revisar ${medio.nombre}`}
      >
        Revisar
        <ArrowRight data-icon="inline-end" aria-hidden />
      </EnlaceBoton>
    </article>
  )
}

function SinEnviar({
  total,
  primeros,
}: {
  total: number
  primeros: readonly MedioSinEnviar[]
}) {
  if (total === 0) return null
  return (
    <section
      aria-labelledby="medios-sin-enviar"
      className="flex flex-col gap-3 rounded-xl border border-dashed bg-muted/20 p-4"
    >
      <div className="flex flex-col gap-0.5">
        <h3 id="medios-sin-enviar" className="text-sm font-semibold">
          Aún completan su perfil ({formatearNumero(total)})
        </h3>
        <p className="text-xs text-pretty text-muted-foreground">
          Medios registrados que no han enviado su perfil a verificación. Puedes
          revisar lo que llevan y acompañarlos; entran a la cola cuando lo
          envíen.
        </p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {primeros.map((medio) => (
          <li key={medio.id}>
            <Link
              href={`/operacion/medios/${medio.id}` as Route}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium transition-colors hover:bg-muted focus-visible:anillo-foco"
              title={`Registrado el ${formatearFecha(medio.creadoAt)}`}
            >
              <RadioTower aria-hidden className="size-3.5 text-primary" />
              {medio.nombre}
            </Link>
          </li>
        ))}
        {total > primeros.length ? (
          <li className="inline-flex min-h-8 items-center px-1 text-xs text-muted-foreground">
            y {formatearNumero(total - primeros.length)} más
          </li>
        ) : null}
      </ul>
    </section>
  )
}

/** Cola de medios enviados a verificación (el envío más antiguo primero). */
export async function ColaMedios({
  pagina,
  acceso,
}: {
  pagina: number
  acceso: AccesoColas
}) {
  const cola = await colaMedios(pagina, acceso)
  return (
    <div className="flex flex-col gap-4">
      {cola.filas.length === 0 ? (
        <EstadoVacio
          icono={RadioTower}
          titulo={COLAS_VERIFICACION.medios.vacia}
          descripcion="Cuando un medio complete su perfil y lo envíe, aparecerá aquí con lo que falta revisar."
        />
      ) : (
        <ol aria-label="Medios por verificar" className="flex flex-col gap-3">
          {cola.filas.map((medio) => (
            <li key={medio.id}>
              <TarjetaMedio medio={medio} />
            </li>
          ))}
        </ol>
      )}
      <PaginacionCola cola="medios" pagina={cola.pagina} total={cola.total} />
      <SinEnviar {...cola.sinEnviar} />
    </div>
  )
}
