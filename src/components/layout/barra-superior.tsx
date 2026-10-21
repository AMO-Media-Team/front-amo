"use client"

import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

import { CampanaNotificacionesEnVivo } from "@/features/notificaciones/components/campana-en-vivo"

import { useShell } from "./contexto-shell"
import { MenuUsuario } from "./menu-usuario"
import { MigasPan } from "./migas-pan"
import { SelectorTema } from "./selector-tema"
import { useEsApple } from "./use-plataforma"

function BotonBusqueda() {
  const { abrirComandos } = useShell()
  const esApple = useEsApple()

  return (
    <>
      <Button
        variant="outline"
        onClick={abrirComandos}
        aria-keyshortcuts={esApple ? "Meta+K" : "Control+K"}
        className="hidden h-8 w-52 justify-start gap-2 rounded-lg bg-muted/40 px-2.5 font-normal text-muted-foreground shadow-none hover:text-foreground md:flex lg:w-64 dark:bg-muted/40"
      >
        <Search aria-hidden className="size-4" />
        <span className="flex-1 text-left">Buscar…</span>
        <KbdGroup aria-hidden>
          <Kbd>{esApple ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={abrirComandos}
        aria-label="Buscar"
        className="md:hidden"
      >
        <Search aria-hidden className="size-[1.1rem]" />
      </Button>
    </>
  )
}

/**
 * Barra superior fija del AppShell: menú lateral, migas, búsqueda (⌘K),
 * notificaciones, tema y cuenta. Tiene su propio `view-transition-name` para
 * no deslizarse con el contenido al navegar (ver globals.css).
 */
export function BarraSuperior() {
  return (
    <header
      style={{ viewTransitionName: "amo-barra-superior" }}
      className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 sm:px-4 md:rounded-t-xl"
    >
      <SidebarTrigger
        aria-label="Mostrar u ocultar el menú lateral"
        className="-ml-1 size-8"
      />
      <Separator
        orientation="vertical"
        className="mx-1 my-auto h-5 data-vertical:self-center"
      />
      <MigasPan className="flex-1" />
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <BotonBusqueda />
        <CampanaNotificacionesEnVivo />
        <SelectorTema />
        <MenuUsuario />
      </div>
    </header>
  )
}
