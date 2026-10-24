"use client"

import { createContext, type ReactNode, use, useMemo, useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"

import { BLOQUEO_GENERADA_POR_MI, bloqueoAprobacion } from "../presentacion"
import type { FilaLiquidacion } from "../tipos"

/**
 * Selección de los borradores para aprobarlos en lote. Vive fuera de la
 * tabla genérica porque las que generó quien mira (D17) se muestran sin poder
 * marcarse, con el porqué. Solo cuentan las filas de la página visible y
 * aprobables: al cambiar de página, de filtro o tras aprobar, la selección se
 * ajusta sola.
 */
interface Seleccion {
  /** Filas marcadas de la página (en el orden de la tabla). */
  marcadas: FilaLiquidacion[]
  /** Filas de la página que quien mira puede aprobar. */
  aprobables: FilaLiquidacion[]
  estaMarcada: (id: string) => boolean
  alternar: (id: string, marcar: boolean) => void
  alternarTodas: (marcar: boolean) => void
  limpiar: () => void
  /** D17: por qué no puede aprobar una fila (`null` si puede). */
  bloqueo: (fila: FilaLiquidacion) => string | null
}

const ContextoSeleccion = createContext<Seleccion | null>(null)

function useSeleccion(): Seleccion {
  const seleccion = use(ContextoSeleccion)
  if (!seleccion) {
    throw new Error("Falta ProveedorSeleccion alrededor de la tabla.")
  }
  return seleccion
}

export function ProveedorSeleccion({
  filas,
  superadmin,
  children,
}: {
  filas: readonly FilaLiquidacion[]
  superadmin: boolean
  children: (seleccion: Seleccion) => ReactNode
}) {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set())
  // Otra página, otro filtro o filas que ya se aprobaron: se empieza de cero.
  const clavePagina = filas.map((fila) => fila.id).join(",")
  const [paginaVista, setPaginaVista] = useState(clavePagina)
  if (paginaVista !== clavePagina) {
    setPaginaVista(clavePagina)
    setIds(new Set())
  }

  const seleccion = useMemo<Seleccion>(() => {
    const bloqueo = (fila: FilaLiquidacion) =>
      bloqueoAprobacion(fila, superadmin)
    const aprobables = filas.filter((fila) => bloqueo(fila) === null)
    const marcadas = aprobables.filter((fila) => ids.has(fila.id))
    return {
      marcadas,
      aprobables,
      estaMarcada: (id) => marcadas.some((fila) => fila.id === id),
      alternar: (id, marcar) =>
        setIds((previas) => {
          const nuevas = new Set(previas)
          if (marcar) nuevas.add(id)
          else nuevas.delete(id)
          return nuevas
        }),
      alternarTodas: (marcar) =>
        setIds(marcar ? new Set(aprobables.map((fila) => fila.id)) : new Set()),
      limpiar: () => setIds(new Set()),
      bloqueo,
    }
  }, [filas, ids, superadmin])

  return (
    <ContextoSeleccion value={seleccion}>
      {children(seleccion)}
    </ContextoSeleccion>
  )
}

const CLASES_MIXTO =
  "data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground data-indeterminate:before:h-0.5 data-indeterminate:before:w-2 data-indeterminate:before:rounded-full data-indeterminate:before:bg-current [&[data-indeterminate]_svg]:hidden"

/** Cabecera: marca o desmarca todas las aprobables de la página. */
export function CasillaTodas() {
  const { marcadas, aprobables, alternarTodas } = useSeleccion()
  const todas = aprobables.length > 0 && marcadas.length === aprobables.length
  return (
    <Checkbox
      aria-label="Seleccionar todas las que puedes aprobar en esta página"
      className={CLASES_MIXTO}
      disabled={aprobables.length === 0}
      checked={todas}
      indeterminate={marcadas.length > 0 && !todas}
      onCheckedChange={(valor) => alternarTodas(valor)}
    />
  )
}

/** Casilla de una fila; deshabilitada con el porqué si quien mira la generó. */
export function CasillaBorrador({ fila }: { fila: FilaLiquidacion }) {
  const { estaMarcada, alternar, bloqueo } = useSeleccion()
  const motivo = bloqueo(fila)
  const medio = fila.medio ?? "un medio"
  if (motivo) {
    return (
      <span title={motivo} className="inline-flex">
        <Checkbox
          disabled
          checked={false}
          aria-label={`No puedes aprobar la liquidación de ${medio}: ${
            motivo === BLOQUEO_GENERADA_POR_MI ? "la generaste tú" : motivo
          }`}
        />
      </span>
    )
  }
  return (
    <Checkbox
      aria-label={`Seleccionar la liquidación de ${medio}`}
      checked={estaMarcada(fila.id)}
      onCheckedChange={(valor) => alternar(fila.id, valor)}
    />
  )
}
