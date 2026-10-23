import type { ReactNode } from "react"

import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { NavegacionEmpresa } from "@/features/empresa/components/navegacion-empresa"

/**
 * Marco de «Mi empresa»: encabezado y navegación entre Datos, Documentos y
 * Equipo. Es estático a propósito: no autoriza ni consulta (los layouts no se
 * vuelven a ejecutar al navegar); cada página llama al DAL.
 */
export default function LayoutEmpresa({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <EncabezadoPagina
        antetitulo="Mi negocio"
        titulo="Mi empresa"
        descripcion="Los datos de tu empresa, los documentos para verificarla y tu equipo en AMO."
      />
      <NavegacionEmpresa />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
