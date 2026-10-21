"use client"

import {
  ChevronDown,
  History,
  Layers,
  SearchX,
  ShieldAlert,
} from "lucide-react"
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"

import { BarraHerramientas } from "@/components/data-table/barra-herramientas"
import { hayFiltrosActivos } from "@/components/data-table/estado-url"
import { useEstadoTabla } from "@/components/data-table/use-estado-tabla"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatearFechaHora, formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { cargarMasEventos } from "../actions"
import { estadoTablaBitacora, type FiltrosBitacora } from "../estado-bitacora"
import {
  agruparPorDia,
  compactarSimilares,
  type ElementoLinea,
  formatearHora,
} from "../linea-tiempo"
import type { ValoresPeriodo } from "../periodo"
import type {
  EventoBitacora,
  OpcionesFiltroBitacora,
  TramoLineaTiempo,
} from "../tipos"
import { useDetalleEvento } from "./contexto-detalle"
import {
  AvatarActor,
  CLASES_TONO,
  IconoAccion,
  InsigniaOrigen,
} from "./distintivos"
import { filtrosFacetadosBitacora } from "./filtros-bitacora"

/** Retraso máximo de la entrada escalonada (los tramos nuevos también entran así). */
const PASOS_ANIMADOS = 12

/** Columna de hora + riel + icono, común a los eventos y a las ráfagas. */
function MarcoLinea({
  instante,
  orden,
  icono,
  children,
}: {
  instante: string
  orden: number
  icono: ReactNode
  children: ReactNode
}) {
  return (
    <li
      style={{ animationDelay: `${Math.min(orden, PASOS_ANIMADOS) * 30}ms` }}
      className="group/evento relative grid animate-aparecer-arriba grid-cols-[2rem_minmax(0,1fr)] gap-x-3 motion-reduce:animate-none sm:grid-cols-[4.5rem_2rem_minmax(0,1fr)]"
    >
      <time
        dateTime={instante}
        title={formatearFechaHora(instante)}
        className="hidden pt-2 text-right text-xs cifras text-muted-foreground sm:block"
      >
        {formatearHora(instante)}
      </time>
      <div className="relative flex justify-center">
        {/* Riel que une los eventos del día. */}
        <span
          aria-hidden
          className="absolute top-0 bottom-0 w-px bg-border group-first/evento:top-4 group-last/evento:bottom-auto group-last/evento:h-4"
        />
        {icono}
      </div>
      <div className="mb-1.5 min-w-0">{children}</div>
    </li>
  )
}

function MetaEvento({
  evento,
  hora,
}: {
  evento: EventoBitacora
  hora?: string
}) {
  return (
    <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
      {/* En móvil no hay columna de hora: va primero, sin separador colgando al final. */}
      <span className="cifras sm:hidden">
        {hora ?? formatearHora(evento.at)}
      </span>
      <span aria-hidden className="sm:hidden">
        ·
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <AvatarActor actor={evento.actor} tamano="xs" />
        <span className="truncate text-foreground/85">
          {evento.actor.nombre}
        </span>
      </span>
      <span aria-hidden>·</span>
      <span className="truncate">{evento.nombreEntidad}</span>
      {evento.origen !== "APP" ? (
        <InsigniaOrigen origen={evento.origen} />
      ) : null}
    </span>
  )
}

function InsigniaSensible() {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6875rem] font-medium",
        CLASES_TONO.aviso.suave
      )}
    >
      <ShieldAlert className="size-3" aria-hidden />
      Sensible
    </span>
  )
}

const CLASE_TARJETA =
  "flex w-full min-w-0 flex-col gap-1 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:anillo-foco"

function EventoLinea({
  evento,
  orden,
  seleccionado,
  onAbrir,
}: {
  evento: EventoBitacora
  orden: number
  seleccionado: boolean
  onAbrir: () => void
}) {
  return (
    <MarcoLinea
      instante={evento.at}
      orden={orden}
      icono={
        <IconoAccion
          accion={evento.accion}
          tono={evento.tono}
          className="relative mt-0.5 ring-4 ring-background"
        />
      }
    >
      <button
        type="button"
        onClick={onAbrir}
        aria-haspopup="dialog"
        className={cn(
          CLASE_TARJETA,
          seleccionado && "bg-primary/8 ring-1 ring-primary/25"
        )}
      >
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="text-sm font-medium">{evento.titulo}</span>
          {evento.sensible ? <InsigniaSensible /> : null}
        </span>
        {evento.resumen ? (
          <span className="line-clamp-2 text-sm text-muted-foreground">
            {evento.resumen}
          </span>
        ) : null}
        <MetaEvento evento={evento} />
      </button>
    </MarcoLinea>
  )
}

/**
 * Ráfaga plegada: N eventos iguales seguidos (p. ej. los permisos de un rol
 * guardados de una vez) ocupan una sola entrada que se despliega en su lista.
 */
function RafagaLinea({
  eventos,
  orden,
  seleccionadoId,
  onAbrir,
}: {
  eventos: EventoBitacora[]
  orden: number
  seleccionadoId: number | null
  onAbrir: (evento: EventoBitacora) => void
}) {
  const [abierta, setAbierta] = useState(false)
  const idLista = useId()
  const reciente = eventos[0]
  const antiguo = eventos[eventos.length - 1]
  const inicio = formatearHora(antiguo.at)
  const fin = formatearHora(reciente.at)
  const lapso = inicio === fin ? `a las ${fin}` : `entre ${inicio} y ${fin}`
  const contieneSeleccion = eventos.some(
    (evento) => evento.id === seleccionadoId
  )

  return (
    <MarcoLinea
      instante={reciente.at}
      orden={orden}
      icono={
        <span className="relative mt-0.5 self-start">
          {/* Pila: sugiere varios eventos bajo un mismo icono. */}
          <span
            aria-hidden
            className="absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-full bg-muted ring-1 ring-border"
          />
          <IconoAccion
            accion={reciente.accion}
            tono={reciente.tono}
            className="relative ring-4 ring-background"
          />
        </span>
      }
    >
      <button
        type="button"
        onClick={() => setAbierta((actual) => !actual)}
        aria-expanded={abierta}
        aria-controls={idLista}
        className={cn(
          CLASE_TARJETA,
          contieneSeleccion && !abierta && "bg-primary/8 ring-1 ring-primary/25"
        )}
      >
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
            {reciente.titulo}
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-primary/12 px-1.5 text-[0.6875rem] font-semibold cifras text-primary">
              <Layers className="size-3" aria-hidden />×
              {formatearNumero(eventos.length)}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {reciente.sensible ? <InsigniaSensible /> : null}
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                abierta && "rotate-180"
              )}
              aria-hidden
            />
          </span>
        </span>
        <span className="text-sm text-muted-foreground">
          {formatearNumero(eventos.length)} eventos seguidos {lapso}
        </span>
        <MetaEvento evento={reciente} hora={fin} />
      </button>
      {abierta ? (
        <ol
          id={idLista}
          aria-label={`${reciente.titulo}: ${eventos.length} eventos`}
          className="mt-1 ml-3 flex animate-aparecer-arriba flex-col border-l border-border/80 pl-2 motion-reduce:animate-none"
        >
          {eventos.map((evento) => (
            <li key={evento.id}>
              <button
                type="button"
                onClick={() => onAbrir(evento)}
                aria-haspopup="dialog"
                className={cn(
                  "flex w-full min-w-0 items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-[0.8125rem] transition-colors hover:bg-muted/60 focus-visible:anillo-foco",
                  seleccionadoId === evento.id &&
                    "bg-primary/8 ring-1 ring-primary/25"
                )}
              >
                <span className="w-14 shrink-0 text-xs cifras text-muted-foreground sm:w-16">
                  {formatearHora(evento.at)}
                </span>
                <span className="line-clamp-2 min-w-0 flex-1 sm:line-clamp-1">
                  {evento.resumen ?? evento.titulo}
                </span>
                {/* El número del evento cede su sitio al texto en móvil (está en el panel). */}
                <span className="shrink-0 font-mono text-[0.6875rem] cifras text-muted-foreground max-sm:hidden">
                  #{evento.id}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </MarcoLinea>
  )
}

function ElementoDeLinea({
  elemento,
  orden,
  seleccionadoId,
  onAbrir,
}: {
  elemento: ElementoLinea<EventoBitacora>
  orden: number
  seleccionadoId: number | null
  onAbrir: (evento: EventoBitacora) => void
}) {
  if (elemento.tipo === "grupo") {
    return (
      <RafagaLinea
        eventos={elemento.eventos}
        orden={orden}
        seleccionadoId={seleccionadoId}
        onAbrir={onAbrir}
      />
    )
  }
  const { evento } = elemento
  return (
    <EventoLinea
      evento={evento}
      orden={orden}
      seleccionado={seleccionadoId === evento.id}
      onAbrir={() => onAbrir(evento)}
    />
  )
}

interface ListaProps {
  inicial: TramoLineaTiempo
  filtros: FiltrosBitacora
  periodo: ValoresPeriodo
  actualizando: boolean
}

/**
 * Eventos agrupados por día con carga continua: al acercarse al final se pide
 * el siguiente tramo por cursor (`cargarMasEventos`); el botón queda como
 * alternativa accesible. Se monta de nuevo (con `key`) al cambiar filtros.
 */
function ListaLineaTiempo({
  inicial,
  filtros,
  periodo,
  actualizando,
}: ListaProps) {
  const { abrir, seleccionadoId } = useDetalleEvento()
  const [eventos, setEventos] = useState(inicial.eventos)
  const [siguiente, setSiguiente] = useState(inicial.siguiente)
  const [error, setError] = useState<string | null>(null)
  const [cargando, iniciar] = useTransition()
  /** Índice donde empieza el último tramo cargado (su entrada se escalona desde ahí). */
  const [inicioTramo, setInicioTramo] = useState(0)
  const centinela = useRef<HTMLDivElement>(null)

  const grupos = useMemo(
    () =>
      agruparPorDia(eventos).map((grupo) => ({
        ...grupo,
        elementos: compactarSimilares(grupo.eventos),
      })),
    [eventos]
  )
  const indices = useMemo(
    () => new Map(eventos.map((evento, indice) => [evento.id, indice])),
    [eventos]
  )

  function cargarMas() {
    if (!siguiente || cargando) return
    setError(null)
    iniciar(async () => {
      const resultado = await cargarMasEventos({
        periodo,
        filtros,
        cursor: siguiente,
      })
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setInicioTramo(eventos.length)
      setEventos((actuales) => [...actuales, ...resultado.datos.eventos])
      setSiguiente(resultado.datos.siguiente)
    })
  }

  const alVerCentinela = useEffectEvent(cargarMas)

  useEffect(() => {
    const elemento = centinela.current
    if (!elemento || !siguiente || error) return
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) alVerCentinela()
      },
      { rootMargin: "400px 0px" }
    )
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [siguiente, error])

  /** Posición dentro del último tramo: lo recién cargado también entra escalonado. */
  function orden(evento: EventoBitacora): number {
    return Math.max(0, (indices.get(evento.id) ?? 0) - inicioTramo)
  }

  return (
    <div
      aria-busy={actualizando || cargando}
      className={cn(
        "flex max-w-4xl flex-col gap-6 transition-opacity",
        actualizando && "opacity-60"
      )}
    >
      {grupos.map((grupo, indice) => (
        <section key={grupo.clave} aria-labelledby={`dia-${grupo.clave}`}>
          <h3
            id={`dia-${grupo.clave}`}
            className="sticky top-14 z-10 -mx-1 mb-2 flex items-center gap-2 bg-background/85 px-1 py-2 text-sm font-semibold backdrop-blur-md"
          >
            {grupo.titulo}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium cifras text-muted-foreground">
              {formatearNumero(grupo.eventos.length)}
              {siguiente && indice === grupos.length - 1 ? "+" : ""}
            </span>
          </h3>
          <ol className="flex flex-col">
            {grupo.elementos.map((elemento) => (
              <ElementoDeLinea
                key={
                  elemento.tipo === "grupo"
                    ? elemento.clave
                    : elemento.evento.id
                }
                elemento={elemento}
                orden={orden(
                  elemento.tipo === "grupo"
                    ? elemento.eventos[0]
                    : elemento.evento
                )}
                seleccionadoId={seleccionadoId}
                onAbrir={abrir}
              />
            ))}
          </ol>
        </section>
      ))}

      <div ref={centinela} className="flex flex-col items-center gap-2 pb-2">
        {siguiente ? (
          <>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button variant="outline" onClick={cargarMas} disabled={cargando}>
              {cargando ? (
                <Spinner data-icon="inline-start" aria-hidden />
              ) : null}
              {cargando
                ? "Cargando eventos…"
                : error
                  ? "Reintentar"
                  : "Cargar más eventos"}
            </Button>
          </>
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <History className="size-3.5" aria-hidden />
            Inicio del periodo · {formatearNumero(eventos.length)}{" "}
            {eventos.length === 1 ? "evento" : "eventos"}
          </p>
        )}
      </div>
    </div>
  )
}

interface LineaTiempoBitacoraProps extends Omit<ListaProps, "actualizando"> {
  opciones: OpcionesFiltroBitacora
  /** Cambia con los filtros o el periodo: reinicia la lista cargada. */
  firma: string
}

/**
 * Vista de línea de tiempo: la misma barra de búsqueda y filtros que la tabla
 * (estado en la URL) y la lista por días. La barra vive fuera de la lista para
 * no perder el foco del buscador cuando llegan resultados nuevos.
 */
export function LineaTiempoBitacora({
  inicial,
  filtros,
  periodo,
  opciones,
  firma,
}: LineaTiempoBitacoraProps) {
  const control = useEstadoTabla(estadoTablaBitacora)
  const facetas = useMemo(() => filtrosFacetadosBitacora(opciones), [opciones])
  const filtrosActivos = hayFiltrosActivos(
    control.estado.q,
    estadoTablaBitacora.clavesFiltro.map(control.valoresFiltro)
  )

  return (
    <section
      aria-label="Línea de tiempo de la bitácora"
      className="flex flex-col gap-4"
    >
      <BarraHerramientas
        busqueda={control.estado.q}
        placeholderBusqueda="Buscar por correo, id o motivo"
        onBuscar={control.buscar}
        filtros={facetas}
        valoresFiltro={control.valoresFiltro}
        onFiltrar={control.filtrar}
        filtrosActivos={filtrosActivos}
        onLimpiar={control.limpiarFiltros}
        ordenMovil={{ valor: "", opciones: [], onCambiar: () => undefined }}
      />
      {inicial.eventos.length === 0 ? (
        filtrosActivos ? (
          <EstadoVacio
            icono={SearchX}
            titulo="Sin resultados"
            descripcion="Ningún evento coincide con la búsqueda o los filtros."
            className="flex-none py-14"
          >
            <Button variant="outline" onClick={control.limpiarFiltros}>
              Limpiar filtros
            </Button>
          </EstadoVacio>
        ) : (
          <EstadoVacio
            icono={History}
            titulo="Sin eventos en este periodo"
            descripcion="La bitácora registra cada cambio de la plataforma. Prueba con un periodo más amplio."
            className="flex-none py-14"
          />
        )
      ) : (
        <ListaLineaTiempo
          key={firma}
          inicial={inicial}
          filtros={filtros}
          periodo={periodo}
          actualizando={control.cargando}
        />
      )}
    </section>
  )
}
