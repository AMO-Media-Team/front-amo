"use client"

import {
  BadgeCheck,
  CalendarClock,
  ChartColumnBig,
  CircleCheck,
  Clock,
  Hourglass,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Button } from "@/components/ui/button"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import {
  cerrarFrase,
  formatearFechaHoraFija,
} from "@/features/operacion/formato"
import { rutaAsignacion } from "@/features/operacion/rutas"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import { formatearNumero } from "@/lib/format"
import type { ResultadoAccion } from "@/lib/result"
import { cn } from "@/lib/utils"

import { verificarAsignacion } from "../actions"
import { rutaCola, tituloCola } from "../colas"
import { bloqueoEnCola, SUGERENCIAS_CONSTANCIA } from "../decision"
import type { AsignacionPorVerificar } from "../tipos"
import { Dato, Hace, textoMedio } from "./piezas"

type Dialogo = {
  tipo: "verificar" | "constancia"
  fila: AsignacionPorVerificar
}

function Estado({ fila }: { fila: AsignacionPorVerificar }) {
  const bloqueo = bloqueoEnCola(fila)
  if (!bloqueo) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-success">
        <CircleCheck aria-hidden className="size-4 shrink-0" />
        Lista para verificar
      </p>
    )
  }
  const Icono = fila.bloqueo === "PERMANENCIA" ? Hourglass : ChartColumnBig
  return (
    <p className="flex items-start gap-1.5 text-sm text-pretty text-warning">
      <Icono aria-hidden className="mt-0.5 size-4 shrink-0" />
      {bloqueo}
    </p>
  )
}

function TarjetaPorVerificar({
  fila,
  constanciaManual,
  onDecidir,
}: {
  fila: AsignacionPorVerificar
  constanciaManual: boolean
  onDecidir: (dialogo: Dialogo) => void
}) {
  const nombre = `${fila.medio.nombre}: ${fila.ofertaTitulo}`
  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4 lg:flex-row lg:items-center lg:justify-between",
        fila.lista && "border-success/40"
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <MarcaPlataforma
          plataforma={fila.plataforma}
          className="[&>span:first-child]:size-11 [&>span:first-child]:rounded-xl [&>span:first-child]:text-xs"
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-[0.9375rem] font-semibold break-words">
            {fila.ofertaTitulo}
          </h3>
          <p className="text-xs break-words text-muted-foreground">
            <span className="font-medium text-foreground">
              {textoMedio(fila.medio)}
            </span>
            {fila.marca ? ` · ${fila.marca}` : ""}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Dato icono={<BadgeCheck aria-hidden />}>
              <span className="cifras">
                {formatearNumero(fila.cortesAprobados)} de{" "}
                {formatearNumero(fila.cortesRequeridos)}{" "}
                {fila.cortesRequeridos === 1
                  ? "corte aprobado"
                  : "cortes aprobados"}
              </span>
            </Dato>
            {fila.metricasCargadasAt ? (
              <Dato icono={<Clock aria-hidden />}>
                <span>
                  Métricas completas <Hace instante={fila.metricasCargadasAt} />
                </span>
              </Dato>
            ) : null}
            {fila.permanenciaHasta && fila.bloqueo !== "PERMANENCIA" ? (
              // Lista: la BD ya comprobó que la permanencia se cumplió.
              <Dato icono={<CalendarClock aria-hidden />}>
                {fila.lista
                  ? "Permanencia cumplida el"
                  : "Debe seguir publicada hasta el"}{" "}
                {formatearFechaHoraFija(fila.permanenciaHasta)}
              </Dato>
            ) : null}
            {fila.metricasConAlerta > 0 ? (
              <Dato
                icono={<TriangleAlert aria-hidden />}
                className="text-warning"
              >
                {fila.metricasConAlerta === 1
                  ? "1 métrica tuvo alerta"
                  : `${formatearNumero(fila.metricasConAlerta)} métricas tuvieron alerta`}
              </Dato>
            ) : null}
          </p>
          <Estado fila={fila} />
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:shrink-0 lg:justify-end">
        {fila.lista ? (
          <Button
            size="lg"
            className="w-full sm:w-auto"
            aria-label={`Verificar ${nombre}`}
            onClick={() => onDecidir({ tipo: "verificar", fila })}
          >
            <ShieldCheck data-icon="inline-start" aria-hidden />
            Verificar
          </Button>
        ) : null}
        {fila.bloqueo === "PERMANENCIA" && constanciaManual ? (
          <Button
            size="lg"
            variant="outline"
            className="w-full sm:w-auto"
            aria-label={`Verificar con constancia de permanencia ${nombre}`}
            onClick={() => onDecidir({ tipo: "constancia", fila })}
          >
            <ShieldCheck data-icon="inline-start" aria-hidden />
            Verificar con constancia
          </Button>
        ) : null}
        {fila.bloqueo === "METRICAS" ? (
          <EnlaceBoton
            href={rutaCola("metricas")}
            size="lg"
            variant="outline"
            className="w-full sm:w-auto"
          >
            Ir a la cola de métricas
          </EnlaceBoton>
        ) : null}
        <EnlaceBoton
          href={rutaAsignacion(fila.asignacionId)}
          size="lg"
          variant="ghost"
          className="w-full sm:w-auto"
          aria-label={`Ver la ficha de ${nombre}`}
        >
          Ver la ficha
        </EnlaceBoton>
      </div>
    </article>
  )
}

/**
 * Asignaciones con las métricas cargadas (ADM-009): las listas se verifican
 * con una confirmación; las bloqueadas dicen por qué («Faltan métricas por
 * aprobar», «Permanencia pendiente hasta…») y, si solo falta la permanencia,
 * quien corrige métricas validadas puede verificar con constancia manual.
 * Tras verificar, la tarjeta sale de la cola y el foco va a su título.
 */
export function ListaPorVerificar({
  filas,
  constanciaManual,
}: {
  filas: readonly AsignacionPorVerificar[]
  constanciaManual: boolean
}) {
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const fila = dialogo?.fila ?? null
  /** Hubo cambio: el botón que abrió el diálogo desaparece al verificar. */
  const cambio = useRef(false)

  function cerrar(abierto: boolean) {
    if (!abierto) setDialogo(null)
  }

  function abrir(siguiente: Dialogo) {
    cambio.current = false
    setDialogo(siguiente)
  }

  async function verificar(
    constancia: boolean,
    motivo = ""
  ): Promise<ResultadoAccion> {
    if (!fila) return { ok: false, error: "Elige una asignación." }
    const resultado = await verificarAsignacion({
      asignacionId: fila.asignacionId,
      constancia,
      motivo,
    })
    if (resultado.ok) {
      cambio.current = true
      toast.success("Asignación verificada", {
        description: `${fila.medio.nombre} · ${fila.ofertaTitulo}. Ya puede entrar a la liquidación.`,
      })
    }
    return resultado
  }

  const focoAlCerrar = () => (cambio.current ? tituloCola() : null)

  return (
    <>
      <ol
        aria-label="Asignaciones por verificar"
        className="flex flex-col gap-3"
      >
        {filas.map((elemento) => (
          <li key={elemento.asignacionId}>
            <TarjetaPorVerificar
              fila={elemento}
              constanciaManual={constanciaManual}
              onDecidir={abrir}
            />
          </li>
        ))}
      </ol>
      <DialogoConfirmacion
        abierto={dialogo?.tipo === "verificar"}
        onAbiertoChange={cerrar}
        titulo="¿Verificar la asignación?"
        descripcion={
          fila
            ? `${fila.medio.nombre} · ${fila.ofertaTitulo}. Queda verificada y disponible para la liquidación del medio: es la única puerta a pago.`
            : undefined
        }
        textoConfirmar="Verificar"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={() => verificar(false)}
      />
      <DialogoMotivo
        abierto={dialogo?.tipo === "constancia"}
        onAbiertoChange={cerrar}
        titulo="¿Verificar antes de cumplir la permanencia?"
        descripcion={
          fila?.permanenciaHasta
            ? `La publicación debe seguir en línea hasta el ${cerrarFrase(formatearFechaHoraFija(fila.permanenciaHasta))} Si comprobaste que sigue publicada, deja constancia de lo que revisaste.`
            : "Si comprobaste que la publicación sigue en línea, deja constancia de lo que revisaste."
        }
        etiqueta="Qué comprobaste"
        placeholder="Ej.: abrí la publicación hoy y sigue en línea con la etiqueta de publicidad…"
        ayuda="Queda como constancia de permanencia en la bitácora."
        sugerencias={SUGERENCIAS_CONSTANCIA}
        textoConfirmar="Verificar con constancia"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={(motivo) => verificar(true, motivo)}
      />
    </>
  )
}
