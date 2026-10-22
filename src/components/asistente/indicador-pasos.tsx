"use client"

import { Check, CircleAlert } from "lucide-react"

import { cn } from "@/lib/utils"

import { type EstadoPaso, estadoPaso } from "./navegacion"

export interface PasoIndicador {
  id: string
  titulo: string
  opcional?: boolean
  completo?: boolean
  /** Marca el paso con errores (p. ej. los que devolvió el servidor al enviar). */
  conError?: boolean
}

const DESCRIPCION_ESTADO: Readonly<Record<EstadoPaso, string>> = {
  actual: "paso actual",
  completado: "completado",
  disponible: "pendiente",
  bloqueado: "bloqueado hasta completar los anteriores",
}

/*
 * Fondos opacos (mezcla con el fondo, no transparencia): la línea que une los
 * pasos pasa por detrás del círculo y no debe verse a través.
 */
const CLASES_MARCA: Readonly<Record<EstadoPaso, string>> = {
  actual:
    "border-primary bg-[color-mix(in_oklab,var(--primary)_14%,var(--background))] text-primary ring-4 ring-primary/15 font-semibold",
  completado: "border-primary bg-primary text-primary-foreground",
  disponible: "border-primary/50 bg-background text-foreground",
  bloqueado: "border-border bg-background text-muted-foreground",
}

function Marca({
  numero,
  estado,
  conError,
}: {
  numero: number
  estado: EstadoPaso
  conError: boolean
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border text-[0.8125rem] cifras transition-[background-color,border-color,box-shadow,color] duration-200",
        conError
          ? "border-destructive bg-[color-mix(in_oklab,var(--destructive)_14%,var(--background))] text-destructive"
          : CLASES_MARCA[estado],
        conError && estado === "actual" && "ring-4 ring-destructive/15"
      )}
    >
      {conError ? (
        <CircleAlert className="size-4" />
      ) : estado === "completado" ? (
        <Check className="size-4" strokeWidth={2.5} />
      ) : (
        numero
      )}
    </span>
  )
}

/**
 * Indicador de pasos: lista ordenada con el estado de cada uno (también en
 * texto para lectores de pantalla) y `aria-current="step"` en el actual. Los
 * pasos ya alcanzados son botones para volver a ellos; los bloqueados no son
 * interactivos. En pantallas angostas solo se ven los círculos (los títulos
 * siguen disponibles para lectores de pantalla) y el título del paso actual
 * lo da el encabezado del contenido.
 */
export function IndicadorPasos({
  pasos,
  actual,
  alcanzado,
  onIrA,
  deshabilitado = false,
  className,
}: {
  pasos: readonly PasoIndicador[]
  actual: number
  alcanzado: number
  /** Ir al paso (índice). Sin él, el indicador solo informa. */
  onIrA?: (indice: number) => void
  deshabilitado?: boolean
  className?: string
}) {
  return (
    <ol aria-label="Pasos" className={cn("flex w-full items-start", className)}>
      {pasos.map((paso, indice) => {
        const estado = estadoPaso(indice, { actual, alcanzado }, paso)
        const conError = Boolean(paso.conError)
        const interactivo =
          Boolean(onIrA) && estado !== "bloqueado" && estado !== "actual"
        const contenido = (
          <>
            <Marca numero={indice + 1} estado={estado} conError={conError} />
            <span
              className={cn(
                "line-clamp-2 max-w-[11rem] text-[0.8125rem] leading-snug text-balance max-md:sr-only",
                estado === "actual"
                  ? "font-semibold text-foreground"
                  : estado === "bloqueado"
                    ? "text-muted-foreground"
                    : "text-foreground/85",
                conError && "text-destructive"
              )}
            >
              {/* Espacios fuera de los `sr-only` (dentro se recortan al nombrar). */}
              <span className="sr-only">Paso {indice + 1}:</span> {paso.titulo}{" "}
              {paso.opcional ? (
                <span className="block text-xs font-normal text-muted-foreground">
                  Opcional
                </span>
              ) : null}
              <span className="sr-only">
                ({DESCRIPCION_ESTADO[estado]}
                {conError ? ", con errores" : ""})
              </span>
            </span>
          </>
        )
        const clasesElemento =
          "group/paso flex w-full flex-col items-center gap-1.5 rounded-lg px-1 py-1 text-center outline-none"
        return (
          <li
            key={paso.id}
            className="relative flex min-w-0 flex-1 justify-center"
          >
            {indice > 0 ? (
              <span
                aria-hidden
                className={cn(
                  "absolute top-5 right-1/2 h-0.5 w-full -translate-y-1/2 rounded-full transition-colors duration-300",
                  indice <= alcanzado ? "bg-primary/55" : "bg-border"
                )}
              />
            ) : null}
            {interactivo ? (
              <button
                type="button"
                onClick={() => onIrA?.(indice)}
                disabled={deshabilitado}
                className={cn(
                  clasesElemento,
                  "cursor-pointer focus-visible:anillo-foco disabled:cursor-not-allowed disabled:opacity-60 [&:hover:not(:disabled)>span:first-child]:border-primary"
                )}
              >
                {contenido}
              </button>
            ) : (
              <span
                aria-current={estado === "actual" ? "step" : undefined}
                className={clasesElemento}
              >
                {contenido}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
