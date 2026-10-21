"use client"

import { Settings2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { DENSIDADES, type Densidad } from "./preferencias"

const ETIQUETAS_DENSIDAD: Record<Densidad, string> = {
  compacta: "Compacta",
  normal: "Normal",
  comoda: "Cómoda",
}

export interface ColumnaOcultable {
  id: string
  titulo: string
  visible: boolean
}

interface OpcionesVistaProps {
  columnas: readonly ColumnaOcultable[]
  onAlternarColumna: (id: string, visible: boolean) => void
  densidad: Densidad
  onCambiarDensidad: (densidad: Densidad) => void
}

function esDensidad(valor: unknown): valor is Densidad {
  return (DENSIDADES as readonly unknown[]).includes(valor)
}

/** Columnas visibles y densidad de filas (se recuerdan en este navegador). */
export function OpcionesVista({
  columnas,
  onAlternarColumna,
  densidad,
  onCambiarDensidad,
}: OpcionesVistaProps) {
  const visibles = columnas.filter((columna) => columna.visible).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Settings2 data-icon="inline-start" aria-hidden />
        Vista
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Columnas</DropdownMenuLabel>
          {columnas.map((columna) => (
            <DropdownMenuCheckboxItem
              key={columna.id}
              checked={columna.visible}
              // Siempre queda al menos una columna visible.
              disabled={columna.visible && visibles === 1}
              onCheckedChange={(visible) =>
                onAlternarColumna(columna.id, visible)
              }
            >
              {columna.titulo}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Densidad</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={densidad}
            onValueChange={(valor) => {
              if (esDensidad(valor)) onCambiarDensidad(valor)
            }}
          >
            {DENSIDADES.map((opcion) => (
              <DropdownMenuRadioItem key={opcion} value={opcion}>
                {ETIQUETAS_DENSIDAD[opcion]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
