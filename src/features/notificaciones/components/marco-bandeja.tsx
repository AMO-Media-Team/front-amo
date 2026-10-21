"use client"

import { useQueryStates } from "nuqs"
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useState,
  useTransition,
} from "react"
import { toast } from "sonner"

import { parsersBandeja, type FiltrosBandeja } from "../esquemas"
import { useMarcarNotificaciones } from "../fuente"
import { leidaEnBandeja } from "../lecturas"
import type { Notificacion } from "../tipos"

interface ValorBandeja {
  filtros: FiltrosBandeja
  /** Cambia los filtros en la URL; el servidor vuelve a consultar. */
  fijarFiltros: (cambios: Partial<FiltrosBandeja>) => void
  /** Hay una consulta con filtros nuevos en curso (se atenúa la lista). */
  cargando: boolean
  /** Estado de lectura vigente (aplica los cambios optimistas). */
  estaLeida: (notificacion: Notificacion) => boolean
  marcar: (ids: readonly number[], leida: boolean) => void
  marcarTodas: () => void
  marcandoTodas: boolean
}

const ContextoBandeja = createContext<ValorBandeja | null>(null)

function avisarError(error: Error) {
  toast.error("No pudimos actualizar tus notificaciones", {
    description: error.message,
  })
}

/** Lecturas marcadas en esta visita: se imponen a lo que trajo el servidor. */
function useLecturasOptimistas() {
  const mutacion = useMarcarNotificaciones()
  const [lecturas, setLecturas] = useState<ReadonlyMap<number, boolean>>(
    () => new Map()
  )
  const [todasLeidasHasta, setTodasLeidasHasta] = useState<number | null>(null)

  const estaLeida = useCallback(
    (notificacion: Notificacion) =>
      leidaEnBandeja(notificacion, lecturas, todasLeidasHasta),
    [lecturas, todasLeidasHasta]
  )

  const fijar = (
    entradas: readonly (readonly [number, boolean | undefined])[]
  ) =>
    setLecturas((actuales) => {
      const siguientes = new Map(actuales)
      for (const [id, leida] of entradas) {
        if (leida === undefined) siguientes.delete(id)
        else siguientes.set(id, leida)
      }
      return siguientes
    })

  const marcar = (ids: readonly number[], leida: boolean) => {
    const anteriores = ids.map((id) => [id, lecturas.get(id)] as const)
    fijar(ids.map((id) => [id, leida] as const))
    mutacion.mutate(
      { ids, leida },
      {
        onError: (error) => {
          fijar(anteriores)
          avisarError(error)
        },
      }
    )
  }

  const marcarTodas = () => {
    const anteriores = { lecturas, hasta: todasLeidasHasta }
    setTodasLeidasHasta(Date.now())
    setLecturas(new Map())
    mutacion.mutate(
      { todas: true },
      {
        onError: (error) => {
          setTodasLeidasHasta(anteriores.hasta)
          setLecturas(anteriores.lecturas)
          avisarError(error)
        },
      }
    )
  }

  const variables = mutacion.variables
  const marcandoTodas =
    mutacion.isPending && variables !== undefined && "todas" in variables

  return { estaLeida, marcar, marcarTodas, marcandoTodas }
}

/**
 * Estado compartido de la bandeja (sin DOM propio): filtros en la URL con
 * transición (la lista anterior sigue visible mientras llega la nueva) y
 * marcas de lectura optimistas que ven a la vez el encabezado y la lista.
 */
export function MarcoBandeja({ children }: { children: ReactNode }) {
  const [cargando, iniciar] = useTransition()
  const [filtros, setFiltros] = useQueryStates(parsersBandeja, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })
  const lecturas = useLecturasOptimistas()

  const fijarFiltros = useCallback(
    (cambios: Partial<FiltrosBandeja>) => void setFiltros(cambios),
    [setFiltros]
  )

  return (
    <ContextoBandeja value={{ filtros, fijarFiltros, cargando, ...lecturas }}>
      {children}
    </ContextoBandeja>
  )
}

export function useBandeja(): ValorBandeja {
  const valor = use(ContextoBandeja)
  if (!valor)
    throw new Error("useBandeja debe usarse dentro de <MarcoBandeja>.")
  return valor
}
