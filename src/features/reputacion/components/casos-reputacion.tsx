"use client"

import {
  ChevronDown,
  CircleCheck,
  CircleHelp,
  CircleX,
  ListChecks,
} from "lucide-react"
import Link from "next/link"
import { type Ref, useEffect, useId, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { TarjetaPanel } from "@/features/dashboard/components/tarjeta-panel"
import { rutaAsignacionMedio } from "@/features/mis-campanas/rutas"
import { InsigniaTono } from "@/features/operacion/components/distintivos"
import { formatearFecha } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  negocios,
  noCumplidos,
  presentarCaso,
  reglasCumplimiento,
  VENTANA_REPUTACION_DIAS,
} from "../datos"
import type { CasoReputacion } from "../tipos"

/** Negocios visibles antes de «Ver los restantes» (a 390 px, una pantalla). */
export const CASOS_VISIBLES = 6

function Caso({
  caso,
  enlazar,
  ref,
  tabIndex,
}: {
  caso: CasoReputacion
  enlazar: boolean
  ref?: Ref<HTMLLIElement>
  tabIndex?: number
}) {
  const presentacion = presentarCaso(caso)
  const titulo = caso.oferta ?? "Oferta sin título"
  const Icono = caso.cumplida ? CircleCheck : CircleX
  return (
    <li
      ref={ref}
      tabIndex={tabIndex}
      className={cn(
        "relative -mx-2 flex items-start gap-3 rounded-lg px-2 py-3 outline-none focus-visible:anillo-foco",
        enlazar &&
          "transition-colors duration-200 hover:bg-accent/40 has-[a:focus-visible]:anillo-foco motion-reduce:transition-none"
      )}
    >
      <Icono
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          caso.cumplida ? "text-success" : "text-destructive"
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {enlazar ? (
          <Link
            href={rutaAsignacionMedio(caso.asignacionId)}
            className="text-sm font-medium text-pretty break-words outline-none after:absolute after:inset-0 after:content-['']"
          >
            {titulo}
          </Link>
        ) : (
          <span className="text-sm font-medium text-pretty break-words">
            {titulo}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Fecha límite:{" "}
          <time dateTime={caso.limite}>{formatearFecha(caso.limite)}</time> ·{" "}
          {presentacion.estado}
        </span>
        <span className="text-xs leading-relaxed text-pretty text-muted-foreground">
          {presentacion.motivo}
        </span>
      </div>
      <InsigniaTono
        tono={presentacion.tono}
        etiqueta={presentacion.etiqueta}
        className="shrink-0"
      />
    </li>
  )
}

/** Qué cuenta y qué no, plegado: es consulta, no lo primero que se lee. */
function QueCuenta({ nMinimo }: { nMinimo: number }) {
  return (
    <Collapsible className="border-t pt-2">
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="group/regla -mx-2 h-9 w-[calc(100%+1rem)] justify-between px-2 text-muted-foreground"
          />
        }
      >
        <span className="flex items-center gap-2">
          <CircleHelp aria-hidden />
          ¿Qué cuenta para tu cumplimiento?
        </span>
        <ChevronDown
          aria-hidden
          className="transition-transform duration-200 group-aria-expanded/regla:rotate-180 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex list-disc flex-col gap-2 pt-2 pl-5 text-xs leading-relaxed text-muted-foreground marker:text-foreground/60">
          {reglasCumplimiento(nMinimo).map((regla) => (
            <li key={regla}>{regla}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Los negocios de la ventana que forman la tasa (MED-016): oferta, fecha
 * límite, si se cumplió y por qué. Muestra los más recientes y despliega el
 * resto; al desplegar, el foco pasa al primero que aparece para no obligar a
 * volver atrás con el teclado. Cada negocio lleva a su ficha si el rol puede
 * abrir «Mis campañas».
 */
export function CasosReputacion({
  casos,
  nMinimo,
  enlazar,
  className,
}: {
  casos: readonly CasoReputacion[]
  nMinimo: number
  /** Ficha en «Mis campañas» (`asignaciones.ver_propias`). */
  enlazar: boolean
  className?: string
}) {
  const [todos, setTodos] = useState(false)
  const idLista = useId()
  const primeraNueva = useRef<HTMLLIElement>(null)
  const enfocarNueva = useRef(false)

  useEffect(() => {
    if (!todos || !enfocarNueva.current) return
    enfocarNueva.current = false
    primeraNueva.current?.focus()
  }, [todos])

  const visibles = todos ? casos : casos.slice(0, CASOS_VISIBLES)
  const restantes = casos.length - CASOS_VISIBLES
  const fallidos = noCumplidos(casos)

  return (
    <TarjetaPanel
      titulo={`Tus negocios de los últimos ${VENTANA_REPUTACION_DIAS} días`}
      descripcion={
        casos.length === 0
          ? "Los que forman tu tasa de cumplimiento."
          : `${negocios(casos.length)} con fecha límite en la ventana${fallidos > 0 ? `, ${fallidos} sin cumplir` : ", todos cumplidos"}. Del más reciente al más antiguo.`
      }
      icono={ListChecks}
      className={className}
    >
      <div className="flex flex-col gap-3">
        {casos.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-background/40 p-4 text-[0.8125rem] text-muted-foreground">
            Aún no tienes negocios con fecha límite en los últimos{" "}
            {VENTANA_REPUTACION_DIAS} días. Cuando aceptes ofertas y pase su
            fecha límite, aquí verás cuáles cumpliste.
          </p>
        ) : (
          <>
            <ul
              id={idLista}
              aria-label={`Negocios de los últimos ${VENTANA_REPUTACION_DIAS} días`}
              className="flex flex-col divide-y"
            >
              {visibles.map((caso, indice) => (
                <Caso
                  key={caso.asignacionId}
                  caso={caso}
                  enlazar={enlazar}
                  ref={indice === CASOS_VISIBLES ? primeraNueva : undefined}
                  tabIndex={indice === CASOS_VISIBLES ? -1 : undefined}
                />
              ))}
            </ul>
            {restantes > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-fit"
                aria-expanded={todos}
                aria-controls={idLista}
                onClick={() => {
                  enfocarNueva.current = !todos
                  setTodos(!todos)
                }}
              >
                <ChevronDown
                  data-icon="inline-start"
                  aria-hidden
                  className={cn(
                    "transition-transform duration-200 motion-reduce:transition-none",
                    todos && "rotate-180"
                  )}
                />
                {todos
                  ? "Ver menos"
                  : `Ver ${restantes === 1 ? "el negocio restante" : `los ${restantes} restantes`}`}
              </Button>
            ) : null}
          </>
        )}
        <QueCuenta nMinimo={nMinimo} />
      </div>
    </TarjetaPanel>
  )
}
