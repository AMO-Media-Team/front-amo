"use client"

import { CalendarRange, Check, ChevronDown } from "lucide-react"
import { type ReactNode, useState } from "react"
import type { DateRange } from "react-day-picker"
import { es } from "react-day-picker/locale"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  diasEnRango,
  ETIQUETAS_PRESET,
  inicioDelDia,
  type PresetRango,
  rangoPersonalizado,
  type RangoFechas,
  ZONA,
} from "@/lib/fechas"
import { cn } from "@/lib/utils"

/**
 * Clases del calendario compartidas por los selectores de periodo y de fecha:
 * el tramo elegido va con el primario translúcido (un `bg-muted` apenas se
 * distingue del fondo del popover) y «hoy» con un anillo, para no confundirlo
 * con un día elegido. El extremo que abre o cierra una semana no dibuja el
 * empalme con el día vecino (está en otra fila: asomaba como esquina cuadrada).
 */
export const CLASES_CALENDARIO = {
  range_start:
    "relative isolate z-0 rounded-l-(--cell-radius) bg-primary/15 after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-primary/15 last:rounded-r-(--cell-radius) last:after:hidden",
  range_end:
    "relative isolate z-0 rounded-r-(--cell-radius) bg-primary/15 after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-primary/15 first:rounded-l-(--cell-radius) first:after:hidden",
  today:
    "rounded-(--cell-radius) font-semibold text-primary ring-1 ring-primary/45 ring-inset data-[selected=true]:rounded-none data-[selected=true]:ring-0",
}

/** Tramo intermedio: lo pinta el botón del día, no la celda. */
export const CLASE_TRAMO_CALENDARIO =
  "**:data-[range-middle=true]:bg-primary/15!"

/** Celdas para el dedo en el teléfono (40 px, o lo que quepa a 320 px). */
const CELDA_MOVIL =
  "mx-auto [--cell-size:min(--spacing(10),calc((100vw-3.5rem)/7))]"
const CELDA_ESCRITORIO = "[--cell-size:--spacing(8)]"

/** Tamaño de celda del calendario según el dispositivo. */
export function claseCeldaCalendario(esMovil: boolean): string {
  return esMovil ? CELDA_MOVIL : CELDA_ESCRITORIO
}

/** Botón de una opción rápida: el mismo en todos los paneles de fecha. */
export function BotonOpcionPeriodo({
  activa,
  onElegir,
  className,
  children,
}: {
  activa: boolean
  onElegir: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onElegir}
      className={cn(
        "flex min-h-8 items-center justify-between gap-2 rounded-md px-2.5 py-1 text-left text-[0.8125rem] transition-colors hover:bg-accent focus-visible:anillo-foco",
        activa && "bg-primary/10 font-medium text-primary hover:bg-primary/15",
        className
      )}
    >
      {children}
      {activa ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
    </button>
  )
}

export interface OpcionPeriodo<T extends string = string> {
  valor: T
  etiqueta: string
}

/** Opciones rápidas a partir de presets de `@/lib/fechas`, con su rótulo. */
export function opcionesDePresets<T extends PresetRango>(
  presets: readonly T[]
): OpcionPeriodo<T>[] {
  return presets.map((preset) => ({
    valor: preset,
    etiqueta: ETIQUETAS_PRESET[preset],
  }))
}

/** Tope del rango elegible en el calendario. */
export interface LimitePeriodo {
  dias: number
  /** Se muestra en lugar del rango cuando se supera («…máximo dos años»). */
  mensaje: string
}

type Extremos = Pick<RangoFechas, "desde" | "hasta">

const APARIENCIAS = {
  /** Campo con borde: encabezados de página y barras de filtros. */
  campo: {
    variante: "outline",
    boton: "min-w-0 justify-start bg-card dark:bg-input/30",
    icono: undefined,
    conFlecha: true,
  },
  /** Píldora sin borde: barras de herramientas sobre el mapa. */
  barra: {
    variante: "ghost",
    boton:
      "h-9 min-w-0 gap-2 rounded-xl bg-foreground/5 px-3 font-medium hover:bg-foreground/8 dark:hover:bg-foreground/10",
    icono: "text-primary",
    conFlecha: false,
  },
} as const

export interface SelectorPeriodoProps<T extends string> {
  /** Periodo vigente; `null` = sin filtro de fechas. */
  rango: Extremos | null
  /** Texto del botón («Últimos 30 días», «1 – 30 de sept de 2026»). */
  etiqueta: string
  /** Nombre accesible del botón; por defecto, `Periodo: <etiqueta>`. */
  nombreAccesible?: string
  /** Nombre accesible del panel (es un diálogo). */
  tituloPanel?: string
  /** Opciones rápidas, en el orden en que se ofrecen. */
  opciones: readonly OpcionPeriodo<T>[]
  opcionActiva: T | null
  onOpcion: (opcion: T) => void
  /** Rango elegido en el calendario (ya ordenado, días de Bogotá). */
  onRango: (rango: RangoFechas) => void
  /** Cómo se escribe un rango del calendario en el pie del panel. */
  describirRango: (rango: RangoFechas) => string
  limite?: LimitePeriodo
  /** Aclaración sobre a qué fecha aplica el filtro. */
  nota?: string
  /** El servidor está trayendo los datos del periodo nuevo. */
  cargando?: boolean
  apariencia?: keyof typeof APARIENCIAS
  /** Clases del rótulo del botón (p. ej. solo para lectores en una barra estrecha). */
  claseEtiqueta?: string
  id?: string
  className?: string
}

/**
 * Selector de periodo de toda la app: opciones rápidas y un rango del
 * calendario (dos meses; uno, con celdas de 40 px, en el teléfono), hasta
 * hoy. No sabe de la URL ni del dominio: quien lo usa le da el periodo
 * vigente y recibe la opción o el rango elegidos. Cada apertura parte del
 * periodo vigente; el rango solo se aplica con «Aplicar».
 */
export function SelectorPeriodo<T extends string>({
  rango,
  etiqueta,
  nombreAccesible = `Periodo: ${etiqueta}`,
  tituloPanel = "Elegir el periodo",
  opciones,
  opcionActiva,
  onOpcion,
  onRango,
  describirRango,
  limite,
  nota,
  cargando = false,
  apariencia = "campo",
  claseEtiqueta = "truncate",
  id,
  className,
}: SelectorPeriodoProps<T>) {
  const esMovil = useIsMobile()
  const [abierto, setAbierto] = useState(false)
  const [borrador, setBorrador] = useState<DateRange | undefined>()
  const estilo = APARIENCIAS[apariencia]

  function cambiarAbierto(siguiente: boolean) {
    if (siguiente) {
      setBorrador(rango ? { from: rango.desde, to: rango.hasta } : undefined)
    }
    setAbierto(siguiente)
  }

  function elegirOpcion(opcion: T) {
    onOpcion(opcion)
    setAbierto(false)
  }

  const hoy = inicioDelDia(new Date())
  const elegido = borrador?.from
    ? rangoPersonalizado(borrador.from, borrador.to ?? borrador.from)
    : null
  const excedido =
    elegido !== null && limite !== undefined
      ? diasEnRango(elegido) > limite.dias
      : false

  function aplicarRango() {
    if (!elegido || excedido) return
    onRango(elegido)
    setAbierto(false)
  }

  // Con dos meses a la vista, el de la izquierda es el anterior al último día.
  const ultimoDia = rango?.hasta ?? hoy
  const mesInicial = esMovil
    ? ultimoDia
    : new Date(ultimoDia.getFullYear(), ultimoDia.getMonth() - 1, 1)

  return (
    <Popover open={abierto} onOpenChange={cambiarAbierto}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant={estilo.variante}
            className={cn(estilo.boton, className)}
          />
        }
        aria-label={nombreAccesible}
      >
        {cargando ? (
          <Spinner data-icon="inline-start" aria-hidden />
        ) : (
          <CalendarRange
            data-icon="inline-start"
            aria-hidden
            className={estilo.icono}
          />
        )}
        <span className={claseEtiqueta}>{etiqueta}</span>
        {estilo.conFlecha ? (
          <ChevronDown
            data-icon="inline-end"
            aria-hidden
            className="ml-auto opacity-60"
          />
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        // El popover es un `dialog`: sin nombre, el lector solo dice «diálogo».
        aria-label={tituloPanel}
        // En el teléfono, al menos tan ancho como su botón (que suele ocupar
        // todo el ancho): el panel no queda descolgado a un lado.
        className="w-auto max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 max-sm:min-w-(--anchor-width)"
      >
        <div className="flex flex-col md:flex-row">
          <div
            role="group"
            aria-label="Periodos rápidos"
            className="grid grid-cols-2 gap-1 border-b p-2 md:flex md:w-44 md:flex-col md:border-r md:border-b-0"
          >
            {opciones.map((opcion) => (
              <BotonOpcionPeriodo
                key={opcion.valor}
                activa={opcionActiva === opcion.valor}
                onElegir={() => elegirOpcion(opcion.valor)}
              >
                {opcion.etiqueta}
              </BotonOpcionPeriodo>
            ))}
          </div>
          <div className="flex min-w-0 flex-col">
            {nota ? (
              <p className="border-b px-3 py-2 text-xs text-muted-foreground">
                {nota}
              </p>
            ) : null}
            <Calendar
              mode="range"
              locale={es}
              timeZone={ZONA}
              numberOfMonths={esMovil ? 1 : 2}
              defaultMonth={mesInicial}
              selected={borrador}
              onSelect={setBorrador}
              disabled={{ after: hoy }}
              // Con dos meses, los días del mes vecino repetirían el tramo
              // elegido en ambas rejillas.
              showOutsideDays={esMovil}
              classNames={CLASES_CALENDARIO}
              className={cn(
                "bg-transparent p-3",
                CLASE_TRAMO_CALENDARIO,
                claseCeldaCalendario(esMovil)
              )}
            />
            <div className="flex items-center justify-between gap-3 border-t px-3 py-2.5">
              <p
                className={cn(
                  "min-w-0 truncate text-xs cifras",
                  excedido ? "text-destructive" : "text-muted-foreground"
                )}
                aria-live="polite"
              >
                {excedido && limite
                  ? limite.mensaje
                  : elegido
                    ? describirRango(elegido)
                    : "Elige el día inicial y el final"}
              </p>
              <Button
                size="sm"
                onClick={aplicarRango}
                disabled={!elegido || excedido}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
