"use client"

import { type ReactNode, useMemo, useState } from "react"

import { ID_CONTENIDO } from "@/components/feedback/salto-contenido"
import { SidebarProvider } from "@/components/ui/sidebar"
import { filtrarNavegacion } from "@/lib/auth/navegacion"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { cn } from "@/lib/utils"

import { BarraInferior, RESERVA_BARRA_INFERIOR } from "./barra-inferior"
import { BarraLateral } from "./barra-lateral"
import { BarraSuperior } from "./barra-superior"
import { ProveedorShell } from "./contexto-shell"
import { MenuComandos } from "./menu-comandos"
import { ProveedorTituloMiga } from "./titulo-miga"
import { useEstadoBarraLateral } from "./use-estado-barra-lateral"

interface ShellAplicacionProps {
  usuario: UsuarioSesion
  /** Cookie `sidebar_state` leída en el layout; `null` si nunca se eligió. */
  barraLateralAbierta: boolean | null
  /** Pista de la visita anterior (`COOKIE_VISTA_TABLET`): ancho de tablet. */
  vistaTablet: boolean
  children: ReactNode
}

/**
 * AppShell: barra lateral, barra superior, menú de comandos y el `<main>`
 * del contenido; para el rol MEDIO, además, la barra inferior del teléfono
 * en todas sus secciones. No autoriza nada: cada página llama al DAL.
 */
export function ShellAplicacion({
  usuario,
  barraLateralAbierta,
  vistaTablet,
  children,
}: ShellAplicacionProps) {
  const { abierta, setAbierta, asentada } = useEstadoBarraLateral(
    barraLateralAbierta,
    vistaTablet
  )
  const [comandosAbierto, setComandosAbierto] = useState(false)
  const conBarraInferior = usuario.rol.tipo === "MEDIO"

  const valor = useMemo(
    () => ({
      usuario,
      navegacion: filtrarNavegacion(usuario),
      abrirComandos: () => setComandosAbierto(true),
    }),
    [usuario]
  )

  return (
    <ProveedorShell valor={valor}>
      <SidebarProvider
        open={abierta}
        onOpenChange={setAbierta}
        // Hasta el primer pintado la barra no se anima: si el servidor no
        // acertó el ancho (primera visita en tablet), se corrige de golpe.
        className={cn(!asentada && "[&_[data-slot^=sidebar]]:transition-none!")}
      >
        <BarraLateral />
        {/*
         * Contenedor con los estilos de SidebarInset (variante inset) pero sin
         * ser <main>: así la barra superior queda fuera del landmark principal
         * y el salto al contenido llega directo a la página.
         */}
        <div className="relative flex min-w-0 flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:ring-1 md:peer-data-[variant=inset]:ring-border/60 md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2">
          {/* Las fichas nombran la última miga de la barra con <TituloMiga>. */}
          <ProveedorTituloMiga>
            <BarraSuperior />
            <main
              id={ID_CONTENIDO}
              tabIndex={-1}
              className={cn(
                "flex flex-1 flex-col outline-none",
                conBarraInferior && RESERVA_BARRA_INFERIOR
              )}
            >
              {children}
            </main>
          </ProveedorTituloMiga>
        </div>
        {conBarraInferior ? <BarraInferior /> : null}
        <MenuComandos
          abierto={comandosAbierto}
          onAbiertoChange={setComandosAbierto}
        />
      </SidebarProvider>
    </ProveedorShell>
  )
}
