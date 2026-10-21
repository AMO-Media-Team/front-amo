"use client"

import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTransicionTema } from "@/hooks/use-transicion-tema"
import { cn } from "@/lib/utils"

import { esTema, OPCIONES_TEMA, origenDelEvento } from "./opciones-tema"

/**
 * Opciones de tema para cualquier menú desplegable. El cambio se revela en
 * círculo desde el punto del clic (View Transition API, ver
 * `useTransicionTema`); sin soporte o con movimiento reducido es instantáneo.
 */
export function OpcionesTemaMenu() {
  const { tema, cambiarTema } = useTransicionTema()

  return (
    <DropdownMenuRadioGroup
      value={tema ?? "system"}
      onValueChange={(valor, detalles) => {
        if (esTema(valor)) cambiarTema(valor, origenDelEvento(detalles.event))
      }}
    >
      {OPCIONES_TEMA.map(({ valor, etiqueta, icono: Icono }) => (
        <DropdownMenuRadioItem key={valor} value={valor}>
          <Icono aria-hidden />
          {etiqueta}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}

/** Botón de tema para barras (AppShell y pantallas de acceso). */
export function SelectorTema({ className }: { className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cambiar tema"
            className={cn("relative", className)}
          />
        }
      >
        {/* El icono sigue la clase `dark` de <html>: sin desajustes de hidratación. */}
        <Sun className="size-[1.1rem] dark:hidden" aria-hidden />
        <Moon className="hidden size-[1.1rem] dark:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tema</DropdownMenuLabel>
          <OpcionesTemaMenu />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
