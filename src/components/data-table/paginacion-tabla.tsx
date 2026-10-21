"use client"

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from "lucide-react"
import { useId } from "react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  rangoVisible,
  TAMANOS_PAGINA,
  type TamanoPagina,
  totalPaginas,
} from "./estado-url"

interface PaginacionTablaProps {
  pagina: number
  tamano: TamanoPagina
  total: number
  onPagina: (pagina: number) => void
  onTamano: (tamano: TamanoPagina) => void
  className?: string
}

function esTamano(valor: unknown): valor is TamanoPagina {
  return (TAMANOS_PAGINA as readonly unknown[]).includes(valor)
}

function BotonPagina({
  etiqueta,
  icono: Icono,
  deshabilitado,
  onClick,
  className,
}: {
  etiqueta: string
  icono: LucideIcon
  deshabilitado: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={etiqueta}
      title={etiqueta}
      disabled={deshabilitado}
      onClick={onClick}
      className={className}
    >
      <Icono aria-hidden />
    </Button>
  )
}

/** Tamaño de página, rango visible y navegación entre páginas. */
export function PaginacionTabla({
  pagina,
  tamano,
  total,
  onPagina,
  onTamano,
  className,
}: PaginacionTablaProps) {
  const idTamano = useId()
  const paginas = totalPaginas(total, tamano)
  const actual = Math.min(pagina, paginas)
  const { desde, hasta } = rangoVisible(actual, tamano, total)
  const enPrimera = actual <= 1
  const enUltima = actual >= paginas

  return (
    <nav
      aria-label="Paginación de la tabla"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm",
        className
      )}
    >
      <p className="cifras text-muted-foreground" aria-live="polite">
        {total === 0 ? (
          "Sin resultados"
        ) : (
          <>
            <span className="font-medium text-foreground">
              {formatearNumero(desde)}–{formatearNumero(hasta)}
            </span>{" "}
            de {formatearNumero(total)}
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2 max-sm:hidden">
          <span id={idTamano} className="text-muted-foreground">
            Filas por página
          </span>
          <Select
            value={tamano}
            onValueChange={(valor) => {
              if (esTamano(valor)) onTamano(valor)
            }}
          >
            <SelectTrigger
              size="sm"
              aria-labelledby={idTamano}
              className="w-18"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAMANOS_PAGINA.map((opcion) => (
                <SelectItem key={opcion} value={opcion}>
                  {opcion}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <BotonPagina
            etiqueta="Primera página"
            icono={ChevronsLeft}
            deshabilitado={enPrimera}
            onClick={() => onPagina(1)}
            className="max-sm:hidden"
          />
          <BotonPagina
            etiqueta="Página anterior"
            icono={ChevronLeft}
            deshabilitado={enPrimera}
            onClick={() => onPagina(actual - 1)}
          />
          <span className="min-w-24 px-2 text-center cifras">
            Página {formatearNumero(actual)} de {formatearNumero(paginas)}
          </span>
          <BotonPagina
            etiqueta="Página siguiente"
            icono={ChevronRight}
            deshabilitado={enUltima}
            onClick={() => onPagina(actual + 1)}
          />
          <BotonPagina
            etiqueta="Última página"
            icono={ChevronsRight}
            deshabilitado={enUltima}
            onClick={() => onPagina(paginas)}
            className="max-sm:hidden"
          />
        </div>
      </div>
    </nav>
  )
}
