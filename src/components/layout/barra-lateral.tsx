"use client"

import { ChevronsUpDown } from "lucide-react"
import * as m from "motion/react-m"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Isotipo } from "@/components/brand/isotipo"
import { Logotipo } from "@/components/brand/logotipo"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  type ItemNavegacion,
  perteneceA,
  RUTA_INICIO,
} from "@/lib/auth/navegacion"

import { AvatarUsuario, DistintivoRol } from "./avatar-usuario"
import { useShell } from "./contexto-shell"
import { ContenidoMenuUsuario } from "./menu-usuario"

const RESORTE_INDICADOR = {
  type: "spring",
  stiffness: 520,
  damping: 42,
} as const

function EnlaceNavegacion({
  item,
  activo,
}: {
  item: ItemNavegacion
  activo: boolean
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const Icono = item.icono

  return (
    <SidebarMenuItem>
      {/* Indicador compartido: se desliza de un enlace a otro (layoutId). */}
      {activo ? (
        <m.span
          layoutId="indicador-navegacion"
          transition={RESORTE_INDICADOR}
          aria-hidden
          className="absolute inset-0 rounded-md bg-sidebar-accent shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--sidebar-primary)_16%,transparent)] before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary group-data-[collapsible=icon]:before:hidden"
        />
      ) : null}
      <SidebarMenuButton
        isActive={activo}
        tooltip={item.titulo}
        className="relative h-9 gap-3 px-2.5 data-active:bg-transparent data-active:text-sidebar-accent-foreground [&>svg]:text-sidebar-foreground/70 data-active:[&>svg]:text-sidebar-primary"
        render={
          <Link
            href={item.href}
            aria-current={activo ? "page" : undefined}
            onClick={() => {
              if (isMobile) setOpenMobile(false)
            }}
          />
        }
      >
        <Icono aria-hidden />
        <span>{item.titulo}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function TarjetaUsuario() {
  const { usuario } = useShell()
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="gap-2.5 rounded-lg group-data-[collapsible=icon]:justify-center data-popup-open:bg-sidebar-accent"
              />
            }
          >
            <AvatarUsuario usuario={usuario} size="sm" className="size-7" />
            <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium">
                {usuario.nombre}
              </span>
              <DistintivoRol
                rol={usuario.rol}
                className="text-xs text-sidebar-foreground/65"
              />
            </span>
            <ChevronsUpDown
              aria-hidden
              className="ml-auto size-4 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "top" : "right"}
            align="end"
            sideOffset={8}
            className="w-64"
          >
            <ContenidoMenuUsuario />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/**
 * Barra lateral colapsable a iconos (⌘/Ctrl + B), con grupos filtrados por
 * permisos. En móvil se abre como panel deslizante.
 */
export function BarraLateral() {
  const { navegacion } = useShell()
  const rutaActual = usePathname()
  const grupos = navegacion.filter((grupo) => grupo.enBarraLateral)

  return (
    <Sidebar
      collapsible="icon"
      variant="inset"
      style={{ viewTransitionName: "amo-barra-lateral" }}
    >
      {/*
       * Un solo landmark de navegación para toda la barra: el logo (ir al
       * inicio) y la tarjeta de la cuenta quedaban fuera de toda región.
       */}
      <nav aria-label="Principal" className="flex min-h-0 flex-1 flex-col">
        <SidebarHeader className="h-14 justify-center px-3 group-data-[collapsible=icon]:px-2">
          <Link
            href={RUTA_INICIO}
            aria-label="AMO, ir al inicio"
            className="flex items-center rounded-md group-data-[collapsible=icon]:justify-center focus-visible:anillo-foco"
          >
            <Logotipo
              alto={26}
              aria-hidden
              className="group-data-[collapsible=icon]:hidden"
            />
            <Isotipo
              size={24}
              decorativo
              className="hidden group-data-[collapsible=icon]:block"
            />
          </Link>
        </SidebarHeader>

        <SidebarContent>
          {grupos.map((grupo) => (
            <SidebarGroup key={grupo.id}>
              <SidebarGroupLabel className="text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
                {grupo.titulo}
              </SidebarGroupLabel>
              <SidebarMenu className="gap-0.5">
                {grupo.items.map((item) => (
                  <EnlaceNavegacion
                    key={item.id}
                    item={item}
                    activo={perteneceA(rutaActual, item.href)}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <TarjetaUsuario />
        </SidebarFooter>
      </nav>
      <SidebarRail
        aria-label="Mostrar u ocultar el menú lateral"
        title="Mostrar u ocultar el menú lateral"
      />
    </Sidebar>
  )
}
