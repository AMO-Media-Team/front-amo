"use client"

import * as m from "motion/react-m"
import { useQueryState } from "nuqs"
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import {
  consultaSeccion,
  INFO_SECCIONES,
  parseAsSeccion,
  RUTA_CONFIGURACION,
  SECCIONES,
  type Seccion,
} from "../secciones"
import { GRUPOS_NAVEGACION, ICONOS_SECCION } from "./iconos"
import { REJILLA_MARCO } from "./rejilla-marco"

function conModificador(evento: MouseEvent): boolean {
  return (
    evento.metaKey ||
    evento.ctrlKey ||
    evento.shiftKey ||
    evento.altKey ||
    evento.button !== 0
  )
}

/**
 * Marco de Configuración: navegación entre secciones y el contenido de la
 * sección activa (que llega del servidor). Cambiar de sección actualiza
 * `?seccion=` dentro de una transición: la sección anterior sigue visible
 * (atenuada) mientras llega la nueva, sin parpadeos de esqueleto. Cada
 * entrada es un enlace real (abrir en otra pestaña funciona).
 */
export function MarcoConfiguracion({ children }: { children: ReactNode }) {
  const [pendiente, iniciar] = useTransition()
  const [seccion, fijarSeccion] = useQueryState(
    "seccion",
    parseAsSeccion.withOptions({
      shallow: false,
      history: "push",
      scroll: false,
      startTransition: iniciar,
    })
  )
  // Destino del clic (para el indicador de carga en esa misma entrada).
  const [destino, setDestino] = useState<Seccion | null>(null)
  const contenido = useRef<HTMLDivElement>(null)

  function navegar(evento: MouseEvent, siguiente: Seccion) {
    if (conModificador(evento)) return
    evento.preventDefault()
    if (siguiente === seccion) return
    setDestino(siguiente)
    void fijarSeccion(siguiente)
    // En móvil la navegación queda arriba: lleva la vista al contenido.
    const caja = contenido.current?.getBoundingClientRect()
    if (caja && caja.top < 0) {
      contenido.current?.scrollIntoView({ block: "start", behavior: "smooth" })
    }
  }

  return (
    // La navegación pasa a la izquierda cuando el ÁREA de la página tiene
    // 56rem (consulta de contenedor): con el menú principal abierto en una
    // tableta sigue siendo una fila de pastillas y el contenido no se estrecha.
    <div className="@container">
      <div className={REJILLA_MARCO}>
        <NavegacionSecciones
          activa={seccion}
          cargando={pendiente ? destino : null}
          onNavegar={navegar}
        />
        <div
          ref={contenido}
          aria-busy={pendiente || undefined}
          className={cn(
            "flex min-w-0 scroll-mt-20 flex-col gap-6 transition-opacity duration-200",
            pendiente && "pointer-events-none opacity-55"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function NavegacionSecciones({
  activa,
  cargando,
  onNavegar,
}: {
  activa: Seccion
  cargando: Seccion | null
  onNavegar: (evento: MouseEvent, seccion: Seccion) => void
}) {
  const lista = useRef<HTMLUListElement>(null)

  // En móvil la fila se desplaza: mantiene la sección activa a la vista.
  useEffect(() => {
    const elemento = lista.current?.querySelector<HTMLElement>(
      "[aria-current='page']"
    )
    if (!elemento || !lista.current) return
    const fila = lista.current
    if (fila.scrollWidth <= fila.clientWidth) return
    const izquierda =
      elemento.offsetLeft - fila.clientWidth / 2 + elemento.clientWidth / 2
    fila.scrollTo({ left: Math.max(0, izquierda), behavior: "smooth" })
  }, [activa])

  return (
    <nav
      aria-label="Secciones de configuración"
      className="min-w-0 @4xl:sticky @4xl:top-20 @4xl:self-start"
    >
      {/* Móvil y tableta: una fila desplazable de pastillas. */}
      <ul
        ref={lista}
        className="-mx-4 flex snap-x [scrollbar-width:none] gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 @4xl:hidden"
      >
        {SECCIONES.map((seccion) => (
          <li key={seccion} className="shrink-0 snap-start">
            <EnlaceSeccion
              seccion={seccion}
              activa={seccion === activa}
              cargando={seccion === cargando}
              onNavegar={onNavegar}
              compacta
            />
          </li>
        ))}
      </ul>

      {/* Escritorio: lista vertical agrupada. */}
      <div className="hidden flex-col gap-5 @4xl:flex">
        {GRUPOS_NAVEGACION.map((grupo) => (
          <div key={grupo.titulo} className="flex flex-col gap-1">
            <p className="px-3 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {grupo.titulo}
            </p>
            <ul className="flex flex-col gap-0.5">
              {grupo.secciones.map((seccion) => (
                <li key={seccion}>
                  <EnlaceSeccion
                    seccion={seccion}
                    activa={seccion === activa}
                    cargando={seccion === cargando}
                    onNavegar={onNavegar}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}

function EnlaceSeccion({
  seccion,
  activa,
  cargando,
  compacta = false,
  onNavegar,
}: {
  seccion: Seccion
  activa: boolean
  cargando: boolean
  compacta?: boolean
  onNavegar: (evento: MouseEvent, seccion: Seccion) => void
}) {
  const Icono = ICONOS_SECCION[seccion]
  const { titulo, resumen } = INFO_SECCIONES[seccion]
  const href = `${RUTA_CONFIGURACION}${consultaSeccion(seccion)}`

  if (compacta) {
    return (
      <a
        href={href}
        onClick={(evento) => onNavegar(evento, seccion)}
        aria-current={activa ? "page" : undefined}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:anillo-foco",
          activa
            ? "border-primary/40 bg-primary/12 text-foreground"
            : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        {cargando ? (
          <Spinner className="size-4" aria-label="Cargando" />
        ) : (
          <Icono
            aria-hidden
            className={cn("size-4", activa && "text-primary")}
          />
        )}
        {titulo}
      </a>
    )
  }

  return (
    <a
      href={href}
      onClick={(evento) => onNavegar(evento, seccion)}
      aria-current={activa ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors outline-none focus-visible:anillo-foco",
        activa
          ? "text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      {activa ? (
        <m.span
          layoutId="indicador-configuracion"
          aria-hidden
          className="absolute inset-0 rounded-xl bg-card shadow-xs ring-1 ring-border"
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
        />
      ) : null}
      <span
        aria-hidden
        className={cn(
          "relative grid size-7 shrink-0 place-items-center rounded-lg transition-colors",
          activa
            ? "bg-primary/12 text-primary"
            : "bg-muted/70 text-muted-foreground group-hover:text-foreground"
        )}
      >
        {cargando ? (
          <Spinner className="size-4" aria-label="Cargando" />
        ) : (
          <Icono className="size-4" />
        )}
      </span>
      <span className="relative flex min-w-0 flex-col">
        <span className="truncate font-medium">{titulo}</span>
        <span className="truncate text-xs text-muted-foreground">
          {resumen}
        </span>
      </span>
    </a>
  )
}
