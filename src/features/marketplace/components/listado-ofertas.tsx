import { ChevronLeft, ChevronRight } from "lucide-react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Button } from "@/components/ui/button"
import { contar } from "@/features/operacion/formato"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  type FiltrosMarketplace,
  rutaMarketplace,
  TAMANO_PAGINA_MARKETPLACE,
  ultimaPagina,
} from "../filtros"
import type { PaginaMarketplace } from "../tipos"
import { TarjetaOfertaMedio } from "./tarjeta-oferta"
import { SinOfertas } from "./vacio-marketplace"

/** Anterior / siguiente del marketplace (enlaces: conservan los filtros). */
export function PaginacionMarketplace({
  filtros,
  pagina,
  total,
}: {
  filtros: FiltrosMarketplace
  pagina: number
  total: number
}) {
  const ultima = ultimaPagina(total)
  if (ultima <= 1) return null
  const desde = (pagina - 1) * TAMANO_PAGINA_MARKETPLACE + 1
  const hasta = Math.min(total, pagina * TAMANO_PAGINA_MARKETPLACE)

  return (
    <nav
      aria-label="Páginas de ofertas"
      className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"
    >
      <p className="text-muted-foreground">
        <span className="cifras">
          {formatearNumero(desde)}–{formatearNumero(hasta)}
        </span>{" "}
        de <span className="cifras">{formatearNumero(total)}</span>
      </p>
      <div className="flex gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
        {pagina > 1 ? (
          <EnlaceBoton
            href={rutaMarketplace({ ...filtros, pagina: pagina - 1 })}
            variant="outline"
            size="lg"
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
            href={rutaMarketplace({ ...filtros, pagina: pagina + 1 })}
            variant="outline"
            size="lg"
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

function resumen(total: number, rechazadas: boolean): string {
  const cantidad = contar(total, "oferta", "ofertas")
  return rechazadas
    ? `${cantidad}, incluidas las que rechazaste.`
    : `${cantidad} que puedes aceptar hoy.`
}

/**
 * Las ofertas de una página (MED-008), de la fecha límite más cercana a la
 * más lejana o del mejor pago al menor, con su paginación. Sin ofertas, el
 * estado vacío explica por qué (filtros, página u «hoy no hay»).
 */
export function ListadoOfertas({
  pagina,
  filtros,
  ahoraServidor,
}: {
  pagina: PaginaMarketplace
  filtros: FiltrosMarketplace
  ahoraServidor: number
}) {
  const vigentes = { ...filtros, pagina: pagina.pagina }
  return (
    <section aria-labelledby="titulo-ofertas" className="flex flex-col gap-4">
      <h2 id="titulo-ofertas" className="sr-only">
        Ofertas disponibles
      </h2>
      {/* Anuncia el resultado al cambiar un filtro; sin ofertas, lo dice el estado vacío. */}
      <p
        className={cn(
          "text-sm text-muted-foreground",
          pagina.filas.length === 0 && "sr-only"
        )}
        aria-live="polite"
      >
        {pagina.filas.length > 0
          ? resumen(pagina.total, filtros.rechazadas)
          : "No hay ofertas para mostrar."}
      </p>
      {pagina.filas.length === 0 ? (
        <SinOfertas filtros={vigentes} />
      ) : (
        <ul
          aria-labelledby="titulo-ofertas"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {pagina.filas.map((oferta, indice) => (
            <li
              key={oferta.id}
              className="animate-aparecer-arriba"
              style={{ animationDelay: `${Math.min(indice, 8) * 40}ms` }}
            >
              <TarjetaOfertaMedio
                oferta={oferta}
                ahoraServidor={ahoraServidor}
              />
            </li>
          ))}
        </ul>
      )}
      <PaginacionMarketplace
        filtros={vigentes}
        pagina={pagina.pagina}
        total={pagina.total}
      />
    </section>
  )
}
