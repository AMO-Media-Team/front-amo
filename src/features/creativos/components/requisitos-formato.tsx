import {
  Clock,
  FileType,
  type LucideIcon,
  Ratio,
  Scale,
  Shield,
  SquareStack,
} from "lucide-react"

import { type ClaveRequisito, piezaDe, requisitosVisibles } from "../formatos"
import type { FormatoOferta, LimitesCreativo, TipoCreativo } from "../tipos"

const ICONOS: Readonly<Record<ClaveRequisito, LucideIcon>> = {
  proporcion: Ratio,
  formatos: FileType,
  peso: Scale,
  duracion: Clock,
  cantidad: SquareStack,
}

/** «Un reel de Instagram» → «un reel de Instagram». */
function minusculaInicial(texto: string): string {
  return texto.charAt(0).toLowerCase() + texto.slice(1)
}

/**
 * Lo que pide el formato antes de elegir archivos (proporción con un ejemplo
 * de medidas, tipos de archivo, peso, duración y cantidad) y la garantía de
 * que el original no se recomprime.
 */
export function RequisitosFormato({
  formato,
  tipo,
  limites,
}: {
  formato: FormatoOferta
  tipo: TipoCreativo
  limites: LimitesCreativo
}) {
  const requisitos = requisitosVisibles(formato, tipo, limites)
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3.5 sm:p-4">
      <p className="text-sm font-medium text-balance">
        Lo que pide {minusculaInicial(piezaDe(formato))}
      </p>
      <ul className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        {requisitos.map(({ clave, texto }) => {
          const Icono = ICONOS[clave]
          return (
            <li key={clave} className="flex min-w-0 items-start gap-2">
              <Icono
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              <span className="min-w-0 cifras text-pretty">{texto}</span>
            </li>
          )
        })}
      </ul>
      <p className="flex items-start gap-2 text-xs text-pretty text-muted-foreground">
        <Shield aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Guardamos tus archivos tal como los subes, sin recomprimirlos, con su
        huella SHA-256 para comprobar que el medio publica el mismo original.
      </p>
    </div>
  )
}
