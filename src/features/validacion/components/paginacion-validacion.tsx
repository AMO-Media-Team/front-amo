import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatearNumero } from "@/lib/format"

import {
  type ColaValidacion,
  rutaCola,
  TAMANO_PAGINA_VALIDACION,
} from "../colas"
import { EnlacePaginaCola } from "./foco-paginacion"

/**
 * Anterior / siguiente de una cola de validación (conserva el filtro de
 * alertas). Las colas se atienden de la más antigua a la más reciente: casi
 * siempre basta la primera página. Al cambiar de página el foco va al título
 * de la cola (`FocoTrasPaginar`, montado con la lista).
 */
export function PaginacionValidacion({
  cola,
  pagina,
  total,
  soloAlertas = false,
}: {
  cola: ColaValidacion
  pagina: number
  total: number
  soloAlertas?: boolean
}) {
  const ultima = Math.max(1, Math.ceil(total / TAMANO_PAGINA_VALIDACION))
  if (ultima <= 1) return null
  const desde = (pagina - 1) * TAMANO_PAGINA_VALIDACION + 1
  const hasta = Math.min(total, pagina * TAMANO_PAGINA_VALIDACION)

  return (
    <nav
      aria-label="Páginas de la cola"
      className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"
    >
      <p className="text-muted-foreground" aria-live="polite">
        <span className="cifras">
          {formatearNumero(desde)}–{formatearNumero(hasta)}
        </span>{" "}
        de <span className="cifras">{formatearNumero(total)}</span>
      </p>
      <div className="flex gap-2">
        {pagina > 1 ? (
          <EnlacePaginaCola
            href={rutaCola(cola, { pagina: pagina - 1, soloAlertas })}
            variant="outline"
            size="lg"
          >
            <ChevronLeft data-icon="inline-start" aria-hidden />
            Anteriores
          </EnlacePaginaCola>
        ) : (
          <Button variant="outline" size="lg" disabled>
            <ChevronLeft data-icon="inline-start" aria-hidden />
            Anteriores
          </Button>
        )}
        {pagina < ultima ? (
          <EnlacePaginaCola
            href={rutaCola(cola, { pagina: pagina + 1, soloAlertas })}
            variant="outline"
            size="lg"
          >
            Siguientes
            <ChevronRight data-icon="inline-end" aria-hidden />
          </EnlacePaginaCola>
        ) : (
          <Button variant="outline" size="lg" disabled>
            Siguientes
            <ChevronRight data-icon="inline-end" aria-hidden />
          </Button>
        )}
      </div>
    </nav>
  )
}
