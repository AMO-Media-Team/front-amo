"use client"

import { parseAsString, useQueryState } from "nuqs"
import type { ReactNode } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatearNumero } from "@/lib/format"

export interface PestanaFicha {
  clave: string
  titulo: string
  /** Elemento (no componente): los íconos llegan ya renderizados del servidor. */
  icono: ReactNode
  /** Cantidad junto al título (p. ej. asignaciones). */
  contador?: number | null
  contenido: ReactNode
}

/**
 * Pestañas de una ficha de operación. La activa va en la URL (`?pestana=`)
 * para enlazarla y conservarla al recargar; el cambio es solo del cliente: el
 * contenido de todas ya llegó del servidor en streaming. La primera es la de
 * por defecto y no ocupa la URL.
 */
export function PestanasFicha({
  pestanas,
}: {
  pestanas: readonly PestanaFicha[]
}) {
  const [valor, setValor] = useQueryState("pestana", parseAsString)
  const primera = pestanas[0]?.clave ?? ""
  const activa = pestanas.some((pestana) => pestana.clave === valor)
    ? (valor as string)
    : primera

  return (
    <Tabs
      value={activa}
      onValueChange={(siguiente) => {
        if (typeof siguiente !== "string") return
        void setValor(siguiente === primera ? null : siguiente)
      }}
      className="gap-5"
    >
      <TabsList
        variant="line"
        className="h-auto w-full [scrollbar-width:none] justify-start gap-1 overflow-x-auto border-b pb-px"
      >
        {pestanas.map((pestana) => (
          <TabsTrigger
            key={pestana.clave}
            value={pestana.clave}
            className="h-9 flex-none px-2.5 sm:px-3 max-sm:[&_svg]:hidden"
          >
            {pestana.icono}
            {pestana.titulo}
            {pestana.contador != null && pestana.contador > 0 ? (
              <span className="ml-0.5 rounded-full bg-muted px-1.5 text-[0.6875rem] font-medium cifras text-muted-foreground">
                {formatearNumero(pestana.contador)}
              </span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {pestanas.map((pestana) => (
        <TabsContent
          key={pestana.clave}
          value={pestana.clave}
          className="animate-aparecer-arriba motion-reduce:animate-none"
        >
          {pestana.contenido}
        </TabsContent>
      ))}
    </Tabs>
  )
}
