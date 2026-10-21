"use client"

import { CornerDownLeft, LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { useTransicionTema } from "@/hooks/use-transicion-tema"
import type { ItemNavegacion } from "@/lib/auth/navegacion"
import { cn } from "@/lib/utils"

import { useCerrarSesion } from "./boton-cerrar-sesion"
import { useShell } from "./contexto-shell"
import { puntuarComando } from "./filtro-comandos"
import { OPCIONES_TEMA } from "./opciones-tema"

/** El resaltado por defecto (bg-muted) no se distingue del fondo del diálogo en oscuro. */
const CLASE_ITEM = "data-selected:bg-primary/12 data-selected:text-foreground"

interface MenuComandosProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

function ItemSeccion({
  item,
  onSeleccionar,
}: {
  item: ItemNavegacion
  onSeleccionar: () => void
}) {
  const Icono = item.icono
  return (
    <CommandItem
      value={item.titulo}
      keywords={[...item.palabrasClave, item.descripcion]}
      onSelect={onSeleccionar}
      className={cn(CLASE_ITEM, "gap-3 py-2")}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
        <Icono aria-hidden className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{item.titulo}</span>
        <span className="truncate text-xs text-muted-foreground">
          {item.descripcion}
        </span>
      </span>
    </CommandItem>
  )
}

/**
 * Menú de comandos (⌘K / Ctrl+K): salta a cualquier sección permitida y
 * ejecuta acciones rápidas (tema, cerrar sesión). Busca también por
 * sinónimos y descripciones del registro de navegación.
 */
export function MenuComandos({ abierto, onAbiertoChange }: MenuComandosProps) {
  const { navegacion } = useShell()
  const router = useRouter()
  const { cambiarTema } = useTransicionTema()
  const { cerrar } = useCerrarSesion()

  useEffect(() => {
    const alternar = (evento: KeyboardEvent) => {
      if (evento.key.toLowerCase() !== "k") return
      if (!(evento.metaKey || evento.ctrlKey) || evento.altKey) return
      evento.preventDefault()
      onAbiertoChange(!abierto)
    }
    window.addEventListener("keydown", alternar)
    return () => window.removeEventListener("keydown", alternar)
  }, [abierto, onAbiertoChange])

  const ejecutar = (accion: () => void) => {
    onAbiertoChange(false)
    accion()
  }

  return (
    <CommandDialog
      open={abierto}
      onOpenChange={onAbiertoChange}
      title="Menú de comandos"
      description="Busca una sección o una acción y pulsa Enter."
      className="sm:max-w-xl"
    >
      <Command loop filter={puntuarComando} className="p-1.5">
        <CommandInput placeholder="Busca una sección o una acción…" />
        <CommandList className="max-h-[min(60vh,26rem)] py-1">
          <CommandEmpty>
            No encontramos resultados para esa búsqueda.
          </CommandEmpty>

          {navegacion.map((grupo) => (
            <CommandGroup key={grupo.id} heading={grupo.titulo}>
              {grupo.items.map((item) => (
                <ItemSeccion
                  key={item.id}
                  item={item}
                  onSeleccionar={() => ejecutar(() => router.push(item.href))}
                />
              ))}
            </CommandGroup>
          ))}

          <CommandGroup heading="Apariencia">
            {OPCIONES_TEMA.map(({ valor, etiqueta, icono: Icono }) => (
              <CommandItem
                key={valor}
                value={`Tema ${etiqueta.toLowerCase()}`}
                keywords={["apariencia", "modo", "color"]}
                onSelect={() => ejecutar(() => cambiarTema(valor))}
                className={CLASE_ITEM}
              >
                <Icono aria-hidden />
                Tema {etiqueta.toLowerCase()}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Sesión">
            <CommandItem
              value="Cerrar sesión"
              keywords={["salir", "desconectar"]}
              onSelect={() => ejecutar(cerrar)}
              className="text-destructive data-selected:bg-destructive/10 data-selected:text-destructive"
            >
              <LogOut aria-hidden />
              Cerrar sesión
            </CommandItem>
          </CommandGroup>
        </CommandList>

        <div
          aria-hidden
          className="flex items-center gap-4 border-t px-3 pt-2 pb-1 text-xs text-muted-foreground"
        >
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            navegar
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>
              <CornerDownLeft />
            </Kbd>
            abrir
          </span>
          <CommandShortcut className="flex items-center gap-1.5 tracking-normal">
            <Kbd>Esc</Kbd>
            cerrar
          </CommandShortcut>
        </div>
      </Command>
    </CommandDialog>
  )
}
