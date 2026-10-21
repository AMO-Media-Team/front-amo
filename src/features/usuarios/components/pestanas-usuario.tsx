"use client"

import { History, LayoutList, ListChecks, ShieldCheck } from "lucide-react"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import type { ReactNode } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const PESTANAS = ["resumen", "seguridad", "actividad", "permisos"] as const
type Pestana = (typeof PESTANAS)[number]

const ETIQUETAS: Record<Pestana, { titulo: string; Icono: typeof History }> = {
  resumen: { titulo: "Resumen", Icono: LayoutList },
  seguridad: { titulo: "Seguridad", Icono: ShieldCheck },
  actividad: { titulo: "Actividad", Icono: History },
  permisos: { titulo: "Permisos", Icono: ListChecks },
}

const parseAsPestana = parseAsStringLiteral(PESTANAS).withDefault("resumen")

function esPestana(valor: unknown): valor is Pestana {
  return (PESTANAS as readonly unknown[]).includes(valor)
}

/**
 * Pestañas de la ficha. La activa va en la URL (`?pestana=`) para enlazarla
 * y conservarla al recargar; el cambio es solo del cliente (`shallow`): el
 * contenido de todas ya llegó del servidor en streaming.
 */
export function PestanasUsuario({
  paneles,
}: {
  paneles: Record<Pestana, ReactNode>
}) {
  const [pestana, setPestana] = useQueryState("pestana", parseAsPestana)

  return (
    <Tabs
      value={pestana}
      onValueChange={(valor) => {
        if (esPestana(valor))
          void setPestana(valor === "resumen" ? null : valor)
      }}
      className="gap-5"
    >
      <TabsList
        variant="line"
        className="h-auto w-full [scrollbar-width:none] justify-start gap-1 overflow-x-auto border-b pb-px"
      >
        {PESTANAS.map((clave) => {
          const { titulo, Icono } = ETIQUETAS[clave]
          return (
            <TabsTrigger
              key={clave}
              value={clave}
              className="h-9 flex-none px-2.5 sm:px-3 max-sm:[&_svg]:hidden"
            >
              <Icono aria-hidden />
              {titulo}
            </TabsTrigger>
          )
        })}
      </TabsList>
      {PESTANAS.map((clave) => (
        <TabsContent
          key={clave}
          value={clave}
          className="animate-aparecer-arriba motion-reduce:animate-none"
        >
          {paneles[clave]}
        </TabsContent>
      ))}
    </Tabs>
  )
}
