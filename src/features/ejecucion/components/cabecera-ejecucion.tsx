import { ArrowLeft } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { rutaAsignacionMedio } from "@/features/mis-campanas/rutas"
import {
  CLASES_TONO,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import { cn } from "@/lib/utils"

import { NOMBRES_CORTE } from "../cortes"
import { REVISION_PARA_MEDIO } from "../presentacion"
import type { AsignacionEjecucion, Corte, EstadoValidacion } from "../tipos"

/**
 * Encabezado de la evidencia y las métricas: a qué campaña pertenece (marca,
 * red, formato y cuenta) y el título de la pantalla. En el celular,
 * «Volver a la campaña» queda a mano (las migas viven en la barra superior).
 */
export function CabeceraEjecucion({
  asignacion,
  titulo,
  descripcion,
}: {
  asignacion: AsignacionEjecucion
  titulo: string
  descripcion: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <EnlaceBoton
        href={rutaAsignacionMedio(asignacion.id)}
        variant="ghost"
        size="sm"
        className="-ml-2 self-start"
      >
        <ArrowLeft data-icon="inline-start" aria-hidden />
        Volver a la campaña
      </EnlaceBoton>
      <EncabezadoPagina
        antetitulo={asignacion.marca ?? asignacion.ofertaTitulo}
        titulo={titulo}
        descripcion={descripcion}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        <MarcaPlataforma plataforma={asignacion.plataforma} conNombre />
        <span aria-hidden>·</span>
        <span>{asignacion.formatoNombre}</span>
        {asignacion.handle ? (
          <>
            <span aria-hidden>·</span>
            <span className="min-w-0 truncate">@{asignacion.handle}</span>
          </>
        ) : null}
      </div>
    </div>
  )
}

interface Paso {
  clave: string
  etiqueta: string
  ruta: Route
  /** Revisión del paso (sin fila: aún no se carga). */
  estado: EstadoValidacion | null
  actual: boolean
}

/** Pasos enlazados (publicaciones o cortes) con su estado, como fichas. */
function Pasos({ etiqueta, pasos }: { etiqueta: string; pasos: Paso[] }) {
  return (
    <nav aria-label={etiqueta}>
      <ul className="flex flex-wrap gap-2">
        {pasos.map((paso) => {
          const revision = paso.estado ? REVISION_PARA_MEDIO[paso.estado] : null
          const tono = CLASES_TONO[revision?.tono ?? "neutro"]
          return (
            <li key={paso.clave}>
              <Link
                href={paso.ruta}
                aria-current={paso.actual ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  paso.actual &&
                    "border-primary bg-primary/10 font-medium text-foreground"
                )}
              >
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-full", tono.punto)}
                />
                {paso.etiqueta}
                <span className="sr-only">
                  {`: ${revision?.etiqueta.toLowerCase() ?? "por cargar"}`}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Las publicaciones que pide la oferta, para pasar de una a otra. */
export function NavegacionPublicaciones({
  total,
  actual,
  estados,
  ruta,
}: {
  total: number
  actual: number
  /** Revisión de cada publicación registrada, por número. */
  estados: ReadonlyMap<number, EstadoValidacion>
  ruta: (numero: number) => Route
}) {
  if (total < 2) return null
  const pasos = Array.from({ length: total }, (_, indice) => {
    const numero = indice + 1
    return {
      clave: String(numero),
      etiqueta: `Publicación ${numero}`,
      ruta: ruta(numero),
      estado: estados.get(numero) ?? null,
      actual: numero === actual,
    }
  })
  return <Pasos etiqueta="Publicaciones de la oferta" pasos={pasos} />
}

/** Los cortes de la publicación (los de la oferta y el personalizado). */
export function NavegacionCortes({
  cortes,
  actual,
  estados,
  ruta,
}: {
  cortes: readonly Corte[]
  actual: Corte
  estados: ReadonlyMap<Corte, EstadoValidacion>
  ruta: (corte: Corte) => Route
}) {
  const pasos = [...cortes, "PERSONALIZADO" as const].map((corte) => ({
    clave: corte,
    etiqueta:
      corte === "PERSONALIZADO" ? "Personalizado" : NOMBRES_CORTE[corte].largo,
    ruta: ruta(corte),
    estado: corte === "PERSONALIZADO" ? null : (estados.get(corte) ?? null),
    actual: corte === actual,
  }))
  return <Pasos etiqueta="Cortes de métricas" pasos={pasos} />
}
