import type { ReactNode } from "react"

import type { Miga } from "@/lib/auth/navegacion"
import { cn } from "@/lib/utils"

import { MigasPan } from "./migas-pan"

interface EncabezadoPaginaProps {
  titulo: string
  descripcion?: ReactNode
  /** Botones de la página (crear, exportar…), alineados a la derecha. */
  acciones?: ReactNode
  /**
   * Migas propias sobre el título (p. ej. con el nombre de un registro). La
   * barra superior ya muestra las de la ruta; úsalo solo si aportan contexto.
   */
  migas?: readonly Miga[]
  /** Sobretítulo corto (módulo, estado…). */
  antetitulo?: ReactNode
  className?: string
}

/** Encabezado estándar de página: h1, apoyo y acciones; se apila en móvil. */
export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
  migas,
  antetitulo,
  className,
}: EncabezadoPaginaProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        {migas ? <MigasPan migas={migas} className="mb-1" /> : null}
        {antetitulo ? (
          <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-primary uppercase">
            {antetitulo}
          </p>
        ) : null}
        <h1 className="text-2xl leading-tight font-bold sm:text-[1.75rem]">
          {titulo}
        </h1>
        {descripcion ? (
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-[0.9375rem]">
            {descripcion}
          </p>
        ) : null}
      </div>
      {acciones ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {acciones}
        </div>
      ) : null}
    </header>
  )
}
