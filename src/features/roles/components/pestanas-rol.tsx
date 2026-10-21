"use client"

import { History, ListChecks, Users } from "lucide-react"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { type ReactNode, useState } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { ContextoCambiosRol } from "./contexto-cambios"

const PESTANAS = ["permisos", "usuarios", "historial"] as const
type Pestana = (typeof PESTANAS)[number]

/** `complemento`: parte del título que en móvil solo leen los lectores de pantalla. */
const ETIQUETAS: Record<
  Pestana,
  { titulo: string; complemento?: string; Icono: typeof History }
> = {
  permisos: { titulo: "Permisos", Icono: ListChecks },
  usuarios: { titulo: "Usuarios", complemento: " con este rol", Icono: Users },
  historial: { titulo: "Historial", Icono: History },
}

const parseAsPestana = parseAsStringLiteral(PESTANAS).withDefault("permisos")

function esPestana(valor: unknown): valor is Pestana {
  return (PESTANAS as readonly unknown[]).includes(valor)
}

/**
 * Pestañas de la ficha del rol. La activa va en la URL (`?pestana=`, sin
 * viaje al servidor). La matriz queda montada aunque se mire otra pestaña
 * (conserva los cambios sin guardar) y su pestaña muestra cuántos hay.
 */
export function PestanasRol({
  paneles,
  cantidades,
}: {
  paneles: Record<Pestana, ReactNode>
  /** Cifra junto al título de cada pestaña (`null`: no se muestra). */
  cantidades: Partial<Record<Pestana, number | null>>
}) {
  const [pestana, setPestana] = useQueryState("pestana", parseAsPestana)
  const [cambios, setCambios] = useState(0)

  return (
    <ContextoCambiosRol value={setCambios}>
      <Tabs
        value={pestana}
        onValueChange={(valor) => {
          if (esPestana(valor))
            void setPestana(valor === "permisos" ? null : valor)
        }}
        className="gap-5"
      >
        <TabsList
          variant="line"
          className="h-auto w-full [scrollbar-width:none] justify-start gap-1 overflow-x-auto border-b pb-px"
        >
          {PESTANAS.map((clave) => {
            const { titulo, complemento, Icono } = ETIQUETAS[clave]
            const cantidad = cantidades[clave]
            return (
              <TabsTrigger
                key={clave}
                value={clave}
                className="h-9 flex-none px-2.5 sm:px-3 max-sm:[&_svg]:hidden"
              >
                <Icono aria-hidden />
                <span>
                  {titulo}
                  {complemento ? (
                    <span className="max-sm:sr-only">{complemento}</span>
                  ) : null}
                </span>
                {cantidad !== null && cantidad !== undefined ? (
                  <span className="rounded-full bg-muted px-1.5 text-[0.6875rem] leading-4 cifras text-muted-foreground">
                    {cantidad}
                  </span>
                ) : null}
                {clave === "permisos" && cambios > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 text-[0.6875rem] leading-4 cifras text-primary-foreground">
                    {cambios}
                    <span className="sr-only"> cambios sin guardar</span>
                  </span>
                ) : null}
              </TabsTrigger>
            )
          })}
        </TabsList>
        {PESTANAS.map((clave) => (
          <TabsContent
            key={clave}
            value={clave}
            keepMounted={clave === "permisos"}
            className="animate-aparecer-arriba motion-reduce:animate-none"
          >
            {paneles[clave]}
          </TabsContent>
        ))}
      </Tabs>
    </ContextoCambiosRol>
  )
}
