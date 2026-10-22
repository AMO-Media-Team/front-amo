import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"

import { RUTAS_MI_MEDIO } from "../alta"

/**
 * Encabezado de cada sección de «Mi medio» (perfil, documentos, pago,
 * cuentas, nivel): vuelta al resumen —en el celular las migas solo muestran
 * la página actual— y el título con su explicación.
 */
export function EncabezadoSeccionMiMedio({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string
  descripcion?: ReactNode
  acciones?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={RUTAS_MI_MEDIO.inicio}
        className="-ml-1 inline-flex min-h-9 w-fit items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:anillo-foco"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Mi medio
      </Link>
      <EncabezadoPagina
        titulo={titulo}
        descripcion={descripcion}
        acciones={acciones}
      />
    </div>
  )
}
