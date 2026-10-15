"use client"

import { ArrowRight } from "lucide-react"
import { useQueryStates } from "nuqs"
import { useTransition } from "react"

import { parseAsPagina } from "@/components/data-table/estado-url"

import type { GrupoBitacora } from "../catalogo"
import { estadoTablaBitacora, ID_REGISTROS_BITACORA } from "../estado-bitacora"

/** Nombre accesible: varios "Ver" en la misma fila no se distinguen solos. */
const ETIQUETAS: Readonly<Record<GrupoBitacora, string>> = {
  CONFIGURACION: "Ver los cambios de configuración en la lista",
  SENSIBLES: "Ver los eventos sensibles en la lista",
}

const parsers = {
  grupo: estadoTablaBitacora.parsers.grupo,
  pagina: parseAsPagina,
}

/** Enlace de un indicador a sus eventos: aplica el filtro y baja a la lista. */
export function BotonVerGrupo({
  grupo,
  children,
}: {
  grupo: GrupoBitacora
  children: string
}) {
  const [, iniciar] = useTransition()
  const [, fijar] = useQueryStates(parsers, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })

  function ver() {
    void fijar({ grupo: [grupo], pagina: null })
    document
      .getElementById(ID_REGISTROS_BITACORA)
      // Sin `behavior`: rige el `scroll-behavior` global (suave salvo movimiento reducido).
      ?.scrollIntoView({ block: "start" })
  }

  return (
    <button
      type="button"
      onClick={ver}
      aria-label={ETIQUETAS[grupo]}
      className="group/ver inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:anillo-foco"
    >
      {children}
      <ArrowRight
        className="size-3 transition-transform group-hover/ver:translate-x-0.5 motion-reduce:transition-none"
        aria-hidden
      />
    </button>
  )
}
