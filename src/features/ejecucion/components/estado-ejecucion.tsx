import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"

import type { TextoSituacion } from "../presentacion"

/**
 * Lo que ve el medio cuando la pantalla no admite cambios (descarga primero,
 * venció, aprobada, aún no llega el corte…), con el paso que sigue.
 */
export function EstadoEjecucion({
  texto,
  icono,
  children,
}: {
  texto: TextoSituacion
  icono: LucideIcon
  /** Acciones: enlaces al contenido, a la evidencia o a la campaña. */
  children?: ReactNode
}) {
  return (
    <EstadoVacio
      titulo={texto.titulo}
      descripcion={texto.descripcion}
      icono={icono}
    >
      {children}
    </EstadoVacio>
  )
}
