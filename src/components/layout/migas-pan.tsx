"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Fragment } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { type Miga, migas as migasDeRuta } from "@/lib/auth/navegacion"
import { cn } from "@/lib/utils"

import { useTituloMiga } from "./titulo-miga"

function ContenidoMiga({ miga, esUltima }: { miga: Miga; esUltima: boolean }) {
  if (esUltima) {
    return (
      <BreadcrumbPage className="font-medium">{miga.titulo}</BreadcrumbPage>
    )
  }
  if (miga.href) {
    return (
      // 24 px de alto: objetivo táctil mínimo (WCAG 2.5.8).
      <BreadcrumbLink
        render={<Link href={miga.href} />}
        className="inline-flex min-h-6 items-center"
      >
        {miga.titulo}
      </BreadcrumbLink>
    )
  }
  return <span>{miga.titulo}</span>
}

/**
 * Clases de cada miga según su posición y el ancho de las migas (consulta de
 * contenedor `migas`, no del viewport: la barra lateral cambia el espacio).
 * La página actual siempre se ve y es la única que se recorta. Las demás no se
 * encogen (encogidas se montaban unas sobre otras y sus enlaces quedaban por
 * debajo de 24 px, WCAG 2.5.8): con poco ancho se ocultan a la vista, de la
 * más lejana a la más cercana, pero siguen para los lectores de pantalla y
 * reaparecen al recibir el foco con el teclado.
 */
export function clasesMiga(
  indice: number,
  total: number
): { item: string; separador: string } {
  if (indice === total - 1) return { item: "min-w-0 truncate", separador: "" }
  const fija = "shrink-0 whitespace-nowrap"
  // El padre de la página actual se ve desde 20 rem; el resto, desde 36 rem.
  return indice === total - 2
    ? {
        item: `${fija} @max-xs/migas:sr-only @max-xs/migas:focus-within:not-sr-only`,
        separador: "@max-xs/migas:hidden",
      }
    : {
        item: `${fija} @max-xl/migas:sr-only @max-xl/migas:focus-within:not-sr-only`,
        separador: "@max-xl/migas:hidden",
      }
}

/**
 * Migas de la ruta actual según el registro de navegación; la última lleva el
 * título que la página haya fijado con `<TituloMiga>` (el nombre del registro
 * de una ficha). Con poco ancho solo se ven la página actual y, si cabe, su
 * padre (el resto queda para lectores de pantalla; ver `clasesMiga`).
 */
export function MigasPan({
  migas,
  className,
}: {
  /** Migas explícitas (p. ej. con el nombre de un registro); por defecto, las de la ruta. */
  migas?: readonly Miga[]
  className?: string
}) {
  const rutaActual = usePathname()
  const tituloPagina = useTituloMiga(rutaActual)
  const lista = migas ?? migasDeRuta(rutaActual, tituloPagina)
  if (lista.length === 0) return null

  return (
    <Breadcrumb
      aria-label="Ruta de navegación"
      className={cn("@container/migas min-w-0", className)}
    >
      <BreadcrumbList className="flex-nowrap">
        {lista.map((miga, indice) => {
          const esUltima = indice === lista.length - 1
          const clases = clasesMiga(indice, lista.length)
          return (
            <Fragment key={`${miga.titulo}-${indice}`}>
              <BreadcrumbItem className={clases.item}>
                <ContenidoMiga miga={miga} esUltima={esUltima} />
              </BreadcrumbItem>
              {esUltima ? null : (
                <BreadcrumbSeparator className={clases.separador} />
              )}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
