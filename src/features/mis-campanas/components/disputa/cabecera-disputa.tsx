import { ArrowLeft } from "lucide-react"
import type { Route } from "next"
import type { ReactNode } from "react"

import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { MarcaPlataforma } from "@/features/operacion/components/distintivos"
import type { Plataforma } from "@/features/operacion/estados"

/**
 * Encabezado de la página de una disputa (medio y anunciante): el regreso a
 * la campaña a mano (en el celular las migas viven en la barra superior), la
 * campaña como antetítulo, el título de lo que se hace aquí y, debajo, la red
 * con los datos que identifican la publicación (formato, cuenta o medio).
 */
export function CabeceraDisputa({
  volver,
  antetitulo,
  titulo,
  descripcion,
  plataforma,
  detalles,
}: {
  volver: { href: Route; texto: string }
  antetitulo: string | null
  titulo: string
  descripcion: ReactNode
  plataforma: Plataforma
  /** «Reel», «@cuenta», el nombre del medio… (los vacíos se omiten). */
  detalles: readonly (string | null | undefined)[]
}) {
  const datos = detalles.filter((dato): dato is string => Boolean(dato))
  return (
    <div className="flex flex-col gap-4">
      <EnlaceBoton
        href={volver.href}
        variant="ghost"
        size="sm"
        className="-ml-2 self-start"
      >
        <ArrowLeft data-icon="inline-start" aria-hidden />
        {volver.texto}
      </EnlaceBoton>
      <EncabezadoPagina
        antetitulo={antetitulo ?? undefined}
        titulo={titulo}
        descripcion={descripcion}
      />
      <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        <MarcaPlataforma plataforma={plataforma} conNombre />
        {datos.map((dato) => (
          <span key={dato} className="flex min-w-0 items-center gap-3">
            <span aria-hidden>·</span>
            <span className="min-w-0 truncate">{dato}</span>
          </span>
        ))}
      </p>
    </div>
  )
}
