"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Check, ChevronDown, Minus, Star } from "lucide-react"
import { useId } from "react"

import type { ClavePermiso } from "@/lib/auth/permisos"
import { cn } from "@/lib/utils"

import {
  contarSensibles,
  type EstadoSeleccion,
  estadoSeleccion,
} from "../catalogo"
import { type CambioPermiso, FilaPermiso } from "./fila-permiso"
import { ICONO_MODULO_GENERICO, ICONOS_MODULO } from "./iconos"

/** Casilla de tres estados ("todos", "algunos", "ninguno") para el módulo entero. */
function CasillaModulo({
  estado,
  etiqueta,
  deshabilitada,
  onAlternar,
}: {
  estado: EstadoSeleccion
  etiqueta: string
  deshabilitada: boolean
  onAlternar: () => void
}) {
  return (
    <label
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground",
        deshabilitada && "cursor-not-allowed opacity-50"
      )}
    >
      <CheckboxPrimitive.Root
        checked={estado === "todos"}
        indeterminate={estado === "algunos"}
        onCheckedChange={onAlternar}
        disabled={deshabilitada}
        aria-label={etiqueta}
        className="grid size-4 place-items-center rounded-[4px] border border-input transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground dark:bg-input/30 dark:data-indeterminate:bg-primary data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary"
      >
        <CheckboxPrimitive.Indicator className="grid place-items-center [&>svg]:size-3">
          {estado === "algunos" ? <Minus aria-hidden /> : <Check aria-hidden />}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span aria-hidden className="max-sm:hidden">
        Todos
      </span>
    </label>
  )
}

/** Anillo de progreso: cuántos permisos del módulo tiene el rol. */
function AnilloProgreso({
  fraccion,
  color,
}: {
  fraccion: number
  color: string
}) {
  const radio = 7
  const perimetro = 2 * Math.PI * radio
  return (
    <svg
      viewBox="0 0 18 18"
      className="size-4.5 shrink-0 -rotate-90"
      aria-hidden
    >
      <circle
        cx="9"
        cy="9"
        r={radio}
        fill="none"
        strokeWidth="2.5"
        className="stroke-foreground/12"
      />
      <circle
        cx="9"
        cy="9"
        r={radio}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        stroke={color}
        strokeDasharray={perimetro}
        strokeDashoffset={perimetro * (1 - fraccion)}
        className="transition-[stroke-dashoffset] duration-500 ease-suave"
      />
    </svg>
  )
}

export interface PropsModuloPermisos {
  modulo: string
  titulo: string
  /** Todos los permisos del módulo (contador y "seleccionar todo"). */
  permisos: readonly ClavePermiso[]
  /** Los que pasan la búsqueda y el filtro. */
  visibles: readonly ClavePermiso[]
  seleccion: ReadonlySet<ClavePermiso>
  cambioDe: (clave: ClavePermiso) => CambioPermiso
  /** El tipo del rol no admite este permiso (solo se puede retirar). */
  esAjeno: (clave: ClavePermiso) => boolean
  editable: boolean
  puedeTocar: (clave: ClavePermiso) => boolean
  color: string
  contraido: boolean
  onContraer: (modulo: string) => void
  onAlternar: (clave: ClavePermiso) => void
  onAlternarModulo: (permisos: readonly ClavePermiso[]) => void
}

/**
 * Tarjeta de un módulo en la matriz: cabecera plegable con contador, anillo
 * de progreso y "seleccionar todo"; debajo, un interruptor por permiso.
 */
export function ModuloPermisos({
  modulo,
  titulo,
  permisos,
  visibles,
  seleccion,
  cambioDe,
  esAjeno,
  editable,
  puedeTocar,
  color,
  contraido,
  onContraer,
  onAlternar,
  onAlternarModulo,
}: PropsModuloPermisos) {
  const idPanel = useId()
  const Icono = ICONOS_MODULO[modulo] ?? ICONO_MODULO_GENERICO
  const marcados = permisos.filter((clave) => seleccion.has(clave)).length
  const sensibles = contarSensibles(permisos)
  const hayCambios = permisos.some((clave) => cambioDe(clave) !== null)
  const editables = permisos.filter(
    (clave) => puedeTocar(clave) && !esAjeno(clave)
  )

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card transition-colors duration-300",
        hayCambios && "border-primary/40"
      )}
    >
      <div className="flex items-center gap-1 py-1.5 pr-2 pl-1.5">
        {/* Patrón acordeón: el botón va dentro del encabezado del módulo. */}
        <h3 className="flex min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={!contraido}
            aria-controls={idPanel}
            onClick={() => onContraer(modulo)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icono className="size-4" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {titulo}
                {hayCambios ? (
                  <span className="size-1.5 rounded-full bg-primary">
                    <span className="sr-only">(con cambios sin guardar)</span>
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-1.5 text-xs cifras text-muted-foreground">
                {marcados} de {permisos.length}
                {sensibles > 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-warning">
                    · <Star className="size-2.5 fill-current" aria-hidden />
                    {sensibles}
                    <span className="sr-only">sensibles</span>
                  </span>
                ) : null}
              </span>
            </span>
            <AnilloProgreso
              fraccion={permisos.length > 0 ? marcados / permisos.length : 0}
              color={color}
            />
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-suave",
                contraido && "-rotate-90"
              )}
            />
          </button>
        </h3>
        {editable ? (
          <CasillaModulo
            estado={estadoSeleccion(editables, seleccion)}
            etiqueta={`Seleccionar todos los permisos de ${titulo}`}
            deshabilitada={editables.length === 0}
            onAlternar={() => onAlternarModulo(permisos)}
          />
        ) : null}
      </div>
      <div
        id={idPanel}
        inert={contraido}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-suave motion-reduce:transition-none",
          contraido ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        )}
      >
        <ul
          className={cn(
            "min-h-0 divide-y overflow-hidden",
            !contraido && "border-t"
          )}
        >
          {visibles.map((clave) => (
            <FilaPermiso
              key={clave}
              clave={clave}
              marcado={seleccion.has(clave)}
              cambio={cambioDe(clave)}
              ajeno={esAjeno(clave)}
              editable={editable}
              bloqueado={editable && !puedeTocar(clave)}
              onAlternar={onAlternar}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}
