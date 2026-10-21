"use client"

import { ListTree, Table2 } from "lucide-react"
import { useQueryState } from "nuqs"
import { useTransition } from "react"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { parseAsVista, type VistaBitacora } from "../estado-bitacora"

const VISTAS: readonly {
  valor: VistaBitacora
  etiqueta: string
  Icono: typeof Table2
}[] = [
  { valor: "tabla", etiqueta: "Tabla", Icono: Table2 },
  { valor: "linea", etiqueta: "Línea de tiempo", Icono: ListTree },
]

/**
 * Alterna tabla y línea de tiempo. La vista va en la URL y se consulta en el
 * servidor (cada una pide sus propios datos); mientras llega, se conserva la
 * anterior y aparece un indicador de carga.
 */
export function SelectorVista() {
  const [cargando, iniciar] = useTransition()
  const [vista, setVista] = useQueryState(
    "vista",
    parseAsVista.withOptions({
      shallow: false,
      scroll: false,
      startTransition: iniciar,
    })
  )

  return (
    <div className="flex items-center gap-2">
      <div
        role="group"
        aria-label="Vista de la bitácora"
        className="inline-flex h-8 items-center rounded-lg bg-muted p-[3px]"
      >
        {VISTAS.map(({ valor, etiqueta, Icono }) => {
          const activa = vista === valor
          return (
            <button
              key={valor}
              type="button"
              aria-pressed={activa}
              onClick={() => void setVista(valor === "tabla" ? null : valor)}
              className={cn(
                "inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-medium text-muted-foreground transition-all hover:text-foreground focus-visible:anillo-foco",
                activa &&
                  "bg-background text-foreground shadow-sm dark:bg-input/40"
              )}
            >
              <Icono className="size-3.5" aria-hidden />
              {etiqueta}
            </button>
          )
        })}
      </div>
      {cargando ? (
        <Spinner
          className="size-4 text-muted-foreground"
          aria-label="Cambiando de vista"
        />
      ) : null}
    </div>
  )
}
