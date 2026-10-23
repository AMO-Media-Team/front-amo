"use client"

import { Building2, FilterX, Shapes } from "lucide-react"
import type { Route } from "next"
import { useQueryStates } from "nuqs"
import {
  type ComponentType,
  createContext,
  type MouseEvent,
  type ReactNode,
  type SVGProps,
  use,
  useId,
  useRef,
  useTransition,
} from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import { cn } from "@/lib/utils"

import {
  FILTROS_LIMPIOS,
  hayFiltros,
  ORDENES_MARKETPLACE,
  type OrdenMarketplace,
  parsersMarketplace,
  PLATAFORMAS_URL,
  type PlataformaUrl,
  plataformaDeUrl,
} from "../filtros"
import type { FacetasMarketplace, OpcionFaceta } from "../tipos"
import { SelectorPublicacion } from "./selector-publicacion"

const TODAS = "todas"
const TODOS = "todos"

const ETIQUETA_ORDEN: Readonly<Record<OrdenMarketplace, string>> = {
  fecha: "Cierran antes",
  pago: "Mejor pago",
}

const CLASE_GRUPO =
  "max-w-full flex-wrap gap-1 rounded-xl border bg-card/60 p-1 [&>[data-slot=toggle-group-item]]:h-8 [&>[data-slot=toggle-group-item]]:rounded-lg [&>[data-slot=toggle-group-item]]:px-2.5 [&>[data-slot=toggle-group-item]]:text-xs [&>[data-slot=toggle-group-item]]:data-pressed:bg-primary/12 [&>[data-slot=toggle-group-item]]:data-pressed:text-foreground [&>[data-slot=toggle-group-item]]:data-pressed:font-semibold"

const CLASE_ETIQUETA = "text-xs font-medium text-muted-foreground"

/** «Limpiar filtros» para lo que va dentro de los filtros (su estado vacío). */
const ContextoLimpiar = createContext<(() => void) | null>(null)

function esClicConModificador(evento: MouseEvent): boolean {
  return (
    evento.button !== 0 ||
    evento.metaKey ||
    evento.ctrlKey ||
    evento.shiftKey ||
    evento.altKey
  )
}

/**
 * «Ver todas las ofertas» del estado vacío: dentro de los filtros, los quita
 * como «Limpiar filtros» (en la misma transición, con la vista atenuada
 * mientras carga) y deja el foco en su grupo. El estado vacío, y con él este
 * enlace, se desmonta al llegar la lista: sin esto el foco caería en el
 * `<body>`. Con un modificador (pestaña nueva) o fuera de los filtros sigue
 * su `href`.
 */
export function EnlaceVerTodas({
  href,
  children,
}: {
  href: Route
  children: ReactNode
}) {
  const limpiar = use(ContextoLimpiar)
  return (
    <EnlaceBoton
      href={href}
      variant="outline"
      size="lg"
      scroll={false}
      onClick={(evento) => {
        if (!limpiar || esClicConModificador(evento)) return
        evento.preventDefault()
        limpiar()
      }}
    >
      {children}
    </EnlaceBoton>
  )
}

/**
 * Filtro por sector o por anunciante: «Todos…» y las opciones que tienen
 * ofertas para el medio. Sin opciones (y sin nada elegido) queda inactivo.
 * Sin filtro, el campo dice solo «Todos» (la etiqueta ya nombra qué): cabe
 * en media columna a 390 px; la lista dice «Todos los sectores». Un valor de
 * la URL sin nombre conocido (p. ej. un sector inactivo) dice «Sin ofertas
 * ahora» en el campo, nunca su id; la lista no lo ofrece.
 */
function CampoFaceta({
  etiqueta,
  todos,
  icono: Icono,
  opciones,
  valor,
  onCambiar,
  className,
}: {
  etiqueta: string
  /** Primera opción, que quita el filtro («Todos los sectores»). */
  todos: string
  icono: ComponentType<SVGProps<SVGSVGElement>>
  opciones: readonly OpcionFaceta[]
  valor: string | null
  onCambiar: (valor: string | null) => void
  className?: string
}) {
  const id = useId()
  const lista = [
    { value: TODOS, label: "Todos" },
    ...opciones.map((opcion) => ({ value: opcion.id, label: opcion.nombre })),
  ]
  const huerfano =
    valor !== null && !opciones.some((opcion) => opcion.id === valor)
  const items = huerfano
    ? [...lista, { value: valor, label: "Sin ofertas ahora" }]
    : lista
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className={CLASE_ETIQUETA}>
        {etiqueta}
      </Label>
      <Select
        value={valor ?? TODOS}
        onValueChange={(elegido) =>
          onCambiar(elegido && elegido !== TODOS ? String(elegido) : null)
        }
        items={items}
        disabled={opciones.length === 0 && valor === null}
      >
        <SelectTrigger
          id={id}
          className="w-full min-w-0 bg-card data-[size=default]:h-9 dark:bg-input/30"
        >
          <Icono aria-hidden className="text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          align="start"
          alignItemWithTrigger={false}
          className="max-h-80 w-auto max-w-[calc(100vw-2rem)] min-w-(--anchor-width)"
        >
          {lista.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.value === TODOS ? todos : item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * Filtros del marketplace en la URL (MED-008): plataforma, orden, «Ver las
 * que rechacé», sector del anunciante, anunciante y días de publicación.
 * Cada cambio vuelve a pedir la lista al servidor dentro de una transición,
 * conserva la vista anterior mientras carga (atenuada y con `aria-busy`) y
 * vuelve a la primera página. «Limpiar filtros» quita todo menos el orden; lo
 * mismo hace «Ver todas las ofertas» del estado vacío (`EnlaceVerTodas`).
 *
 * El filtro por el anunciante se llama «Sector» (no «Categoría»): en AMO las
 * categorías son las del contenido del medio (a las que se dirige una
 * oferta), y la exclusividad ya habla de «marcas del mismo sector».
 * `facetas` `null` (no se pudieron leer): sin esos dos filtros.
 */
export function FiltrosMarketplace({
  facetas,
  children,
}: {
  facetas: FacetasMarketplace | null
  children: ReactNode
}) {
  const [cargando, iniciar] = useTransition()
  const [filtros, fijar] = useQueryStates(parsersMarketplace, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })
  const grupo = useRef<HTMLDivElement>(null)
  const idPlataforma = useId()
  const idOrden = useId()
  const idRechazadas = useId()
  const idPublicacion = useId()
  const conFiltros = hayFiltros(filtros)

  function limpiar() {
    void fijar(FILTROS_LIMPIOS)
    // El botón (o el estado vacío) desaparece: el foco vuelve al inicio de
    // los filtros, que siguen en pantalla.
    grupo.current?.focus()
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={grupo}
        role="group"
        aria-label="Filtros de las ofertas"
        tabIndex={-1}
        className="flex flex-col gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span id={idPlataforma} className={CLASE_ETIQUETA}>
              Plataforma
            </span>
            <ToggleGroup
              aria-labelledby={idPlataforma}
              value={[filtros.plataforma ?? TODAS]}
              onValueChange={(valor) => {
                const [elegida] = valor
                // Tocar la opción activa no la desmarca: siempre hay una elegida.
                if (elegida === undefined) return
                void fijar({
                  plataforma:
                    elegida === TODAS ? null : (elegida as PlataformaUrl),
                  pagina: null,
                })
              }}
              className={CLASE_GRUPO}
            >
              <ToggleGroupItem value={TODAS}>Todas</ToggleGroupItem>
              {PLATAFORMAS_URL.map((plataforma) => (
                <ToggleGroupItem key={plataforma} value={plataforma}>
                  <MarcaPlataforma
                    plataforma={plataformaDeUrl(plataforma) ?? "INSTAGRAM"}
                    conNombre
                    className="[&>span:first-child]:size-4 [&>span:first-child]:text-[0.5rem] [&>span:last-child]:text-xs"
                  />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span id={idOrden} className={CLASE_ETIQUETA}>
                Ordenar por
              </span>
              <ToggleGroup
                aria-labelledby={idOrden}
                value={[filtros.orden]}
                onValueChange={(valor) => {
                  const [elegido] = valor
                  if (elegido === undefined) return
                  void fijar({
                    orden:
                      elegido === "fecha"
                        ? null
                        : (elegido as OrdenMarketplace),
                    pagina: null,
                  })
                }}
                className={CLASE_GRUPO}
              >
                {ORDENES_MARKETPLACE.map((orden) => (
                  <ToggleGroupItem key={orden} value={orden}>
                    {ETIQUETA_ORDEN[orden]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="flex h-10 items-center gap-2.5">
              <Switch
                id={idRechazadas}
                checked={filtros.rechazadas}
                onCheckedChange={(marcado) =>
                  void fijar({ rechazadas: marcado || null, pagina: null })
                }
              />
              <Label htmlFor={idRechazadas} className="text-sm font-normal">
                Ver las que rechacé
              </Label>
            </div>
          </div>
        </div>

        {/* Móvil: sector y anunciante lado a lado, los días debajo; desde `sm`, en fila. */}
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          {facetas ? (
            <>
              <CampoFaceta
                etiqueta="Sector"
                todos="Todos los sectores"
                icono={Shapes}
                opciones={facetas.sectores}
                valor={filtros.sector}
                onCambiar={(sector) => void fijar({ sector, pagina: null })}
                className="sm:w-52"
              />
              <CampoFaceta
                etiqueta="Anunciante"
                todos="Todos los anunciantes"
                icono={Building2}
                opciones={facetas.anunciantes}
                valor={filtros.anunciante}
                onCambiar={(anunciante) =>
                  void fijar({ anunciante, pagina: null })
                }
                className="sm:w-56"
              />
            </>
          ) : null}
          <div className="col-span-2 flex min-w-0 flex-col gap-1.5 sm:w-60">
            <Label htmlFor={idPublicacion} className={CLASE_ETIQUETA}>
              Días de publicación
            </Label>
            <SelectorPublicacion
              id={idPublicacion}
              dias={{ desde: filtros.desde, hasta: filtros.hasta }}
              onCambiar={(dias) => void fijar({ ...dias, pagina: null })}
            />
          </div>
          {conFiltros ? (
            <Button
              variant="ghost"
              onClick={limpiar}
              className="col-span-2 h-9 justify-self-start text-muted-foreground"
            >
              <FilterX data-icon="inline-start" aria-hidden />
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      </div>

      <div
        aria-busy={cargando || undefined}
        className={cn(
          "relative transition-opacity duration-200",
          cargando && "pointer-events-none opacity-60"
        )}
      >
        {cargando ? (
          <span
            role="status"
            className="absolute top-0 right-0 z-10 inline-flex items-center gap-1.5 rounded-full border bg-popover px-2.5 py-1 text-xs shadow-sm"
          >
            <Spinner aria-hidden className="size-3.5" />
            Actualizando…
          </span>
        ) : null}
        <ContextoLimpiar value={limpiar}>{children}</ContextoLimpiar>
      </div>
    </div>
  )
}
