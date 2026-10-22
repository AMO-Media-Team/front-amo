import { ChevronLeft, ChevronRight } from "lucide-react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Button } from "@/components/ui/button"
import { formatearNumero } from "@/lib/format"

import { type Cola, rutaCola, TAMANO_PAGINA } from "../colas"

/**
 * Anterior / siguiente de una cola. Las colas se atienden de la más antigua a
 * la más reciente: casi siempre basta la primera página.
 */
export function PaginacionCola({
  cola,
  pagina,
  total,
}: {
  cola: Cola
  pagina: number
  total: number
}) {
  const ultima = Math.max(1, Math.ceil(total / TAMANO_PAGINA))
  if (ultima <= 1) return null
  const desde = (pagina - 1) * TAMANO_PAGINA + 1
  const hasta = Math.min(total, pagina * TAMANO_PAGINA)

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
          <EnlaceBoton
            href={rutaCola(cola, pagina - 1)}
            variant="outline"
            size="lg"
            scroll={false}
          >
            <ChevronLeft data-icon="inline-start" aria-hidden />
            Anteriores
          </EnlaceBoton>
        ) : (
          <Button variant="outline" size="lg" disabled>
            <ChevronLeft data-icon="inline-start" aria-hidden />
            Anteriores
          </Button>
        )}
        {pagina < ultima ? (
          <EnlaceBoton
            href={rutaCola(cola, pagina + 1)}
            variant="outline"
            size="lg"
            scroll={false}
          >
            Siguientes
            <ChevronRight data-icon="inline-end" aria-hidden />
          </EnlaceBoton>
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
