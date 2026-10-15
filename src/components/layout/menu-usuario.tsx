"use client"

import { LockKeyhole, LogOut, UserRound } from "lucide-react"
import Link from "next/link"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { RUTA_PERFIL, RUTA_SEGURIDAD } from "@/lib/auth/navegacion"

import { AvatarUsuario } from "./avatar-usuario"
import { useCerrarSesion } from "./boton-cerrar-sesion"
import { useShell } from "./contexto-shell"
import { OpcionesTemaMenu } from "./selector-tema"

/**
 * Opciones de la cuenta (las comparten la tarjeta de la barra lateral y el
 * avatar de la barra superior): identidad, cuenta, tema y cierre de sesión.
 */
export function ContenidoMenuUsuario() {
  const { usuario } = useShell()
  const { cerrar, cerrando } = useCerrarSesion()

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="flex items-center gap-2.5 px-2 py-2 font-normal text-foreground">
          <AvatarUsuario usuario={usuario} />
          <span className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-sm font-medium">
              {usuario.nombre}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {usuario.email}
            </span>
          </span>
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem render={<Link href={RUTA_PERFIL} />}>
          <UserRound aria-hidden />
          Mi cuenta
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={RUTA_SEGURIDAD} />}>
          <LockKeyhole aria-hidden />
          Seguridad
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <OpcionesTemaMenu />
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled={cerrando}
        closeOnClick={false}
        onClick={cerrar}
      >
        <LogOut aria-hidden />
        {cerrando ? "Cerrando sesión…" : "Cerrar sesión"}
      </DropdownMenuItem>
    </>
  )
}

/** Avatar con el menú de la cuenta, para la barra superior. */
export function MenuUsuario() {
  const { usuario } = useShell()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label={`Cuenta de ${usuario.nombre}`}
          />
        }
      >
        <AvatarUsuario usuario={usuario} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <ContenidoMenuUsuario />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
