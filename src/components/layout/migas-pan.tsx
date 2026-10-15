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
      <BreadcrumbLink render={<Link href={miga.href} />}>
        {miga.titulo}
      </BreadcrumbLink>
    )
  }
  return <span>{miga.titulo}</span>
}

/**
 * Migas de la ruta actual según el registro de navegación; la última lleva el
 * título que la página haya fijado con `<TituloMiga>` (el nombre del registro
 * de una ficha). En móvil solo se ve la página actual (el resto queda para
 * lectores de pantalla).
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
      className={cn("min-w-0", className)}
    >
      <BreadcrumbList className="flex-nowrap">
        {lista.map((miga, indice) => {
          const esUltima = indice === lista.length - 1
          return (
            <Fragment key={`${miga.titulo}-${indice}`}>
              <BreadcrumbItem
                className={cn(
                  "min-w-0",
                  !esUltima && "max-sm:sr-only",
                  esUltima && "truncate"
                )}
              >
                <ContenidoMiga miga={miga} esUltima={esUltima} />
              </BreadcrumbItem>
              {esUltima ? null : (
                <BreadcrumbSeparator className="max-sm:hidden" />
              )}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
