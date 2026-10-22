"use client"

import { ArrowRight, TimerOff, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import { METODOS_VERIFICACION, PLATAFORMAS } from "@/features/operacion/estados"
import { formatearHandle } from "@/features/operacion/formato"
import {
  formatearFechaHora,
  formatearNumero,
  formatearPorcentaje,
  formatearRelativo,
} from "@/lib/format"

import { momentoCaptura } from "../codigo"
import { rutaRevisionMedio } from "../colas"
import { type RangoFranja, variacionSeguidores } from "../seguidores"
import type { VerificacionEnCola } from "../tipos"
import { HojaCuenta } from "./revision-cuenta"

function Cifras({ verificacion }: { verificacion: VerificacionEnCola }) {
  const anteriores = verificacion.cuenta.seguidoresVerificados
  const variacion = variacionSeguidores(
    verificacion.seguidoresReportados,
    anteriores
  )
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span>
        <span className="font-medium cifras text-foreground">
          {formatearNumero(verificacion.seguidoresReportados)}
        </span>{" "}
        reportados
      </span>
      {anteriores !== null && variacion.fraccion !== null ? (
        <span className={variacion.salto ? "text-warning" : undefined}>
          · antes {formatearNumero(anteriores)} (
          {variacion.fraccion >= 0 ? "+" : "−"}
          {formatearPorcentaje(Math.abs(variacion.fraccion), 0)})
        </span>
      ) : (
        <span>· primera verificación</span>
      )}
      {variacion.salto ? (
        <span className="inline-flex items-center gap-1 font-medium text-warning">
          <TriangleAlert aria-hidden className="size-3.5" />
          Salto brusco
        </span>
      ) : null}
    </p>
  )
}

function TarjetaVerificacion({
  verificacion,
  onRevisar,
}: {
  verificacion: VerificacionEnCola
  onRevisar: () => void
}) {
  const { cuenta, medio } = verificacion
  const handle = formatearHandle(cuenta.handle)
  const momento = momentoCaptura(
    verificacion.actualizadaAt,
    verificacion.codigoExpiraAt
  )
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden className="mt-0.5 shrink-0">
          <MarcaPlataforma
            plataforma={cuenta.plataforma}
            className="[&>span:first-child]:size-10 [&>span:first-child]:rounded-xl [&>span:first-child]:text-xs"
          />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-[0.9375rem] font-semibold break-all">
            {handle}
            <span className="sr-only">
              {" "}
              en {PLATAFORMAS[cuenta.plataforma]}
            </span>
          </h3>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Link
              href={rutaRevisionMedio(medio.id)}
              className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
            >
              {medio.nombre}
            </Link>
            <span>· {METODOS_VERIFICACION[verificacion.metodo]}</span>
            {momento && !momento.aTiempo ? (
              <span className="inline-flex items-center gap-1 font-medium text-destructive">
                <TimerOff aria-hidden className="size-3.5" />
                Captura fuera de plazo
              </span>
            ) : null}
          </p>
          <Cifras verificacion={verificacion} />
          <p className="text-xs text-muted-foreground">
            Solicitada{" "}
            <time
              dateTime={verificacion.creadaAt}
              title={formatearFechaHora(verificacion.creadaAt)}
              suppressHydrationWarning
            >
              {formatearRelativo(verificacion.creadaAt)}
            </time>
          </p>
        </div>
      </div>
      <Button
        size="lg"
        className="w-full shrink-0 sm:w-auto"
        aria-label={`Revisar ${handle} de ${medio.nombre}`}
        onClick={onRevisar}
      >
        Revisar
        <ArrowRight data-icon="inline-end" aria-hidden />
      </Button>
    </article>
  )
}

/**
 * Cola de cuentas por verificar con una sola hoja: al decidir una se abre la
 * siguiente. Solo llegan las que ya tienen captura.
 */
export function RevisorCuentas({
  verificaciones,
  franjas,
}: {
  verificaciones: readonly VerificacionEnCola[]
  franjas: readonly RangoFranja[]
}) {
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const actual = verificaciones.find(
    (verificacion) => verificacion.id === seleccion
  )

  function abrirSiguiente() {
    const indice = verificaciones.findIndex(
      (verificacion) => verificacion.id === seleccion
    )
    setSeleccion(verificaciones[indice + 1]?.id ?? null)
  }

  return (
    <>
      <ol aria-label="Cuentas por verificar" className="flex flex-col gap-3">
        {verificaciones.map((verificacion) => (
          <li key={verificacion.id}>
            <TarjetaVerificacion
              verificacion={verificacion}
              onRevisar={() => setSeleccion(verificacion.id)}
            />
          </li>
        ))}
      </ol>
      {actual ? (
        <HojaCuenta
          key={actual.id}
          verificacion={actual}
          franjas={franjas}
          abierta
          onAbiertaChange={(abierta) => {
            if (!abierta) setSeleccion(null)
          }}
          onDecidido={abrirSiguiente}
          conEnlaceExpediente
        />
      ) : null}
    </>
  )
}
