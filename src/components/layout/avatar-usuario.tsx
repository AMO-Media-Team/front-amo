import type { CSSProperties } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { cn } from "@/lib/utils"

import { iniciales } from "./iniciales"

interface AvatarUsuarioProps {
  usuario: Pick<UsuarioSesion, "nombre" | "avatarUrl" | "rol">
  size?: "sm" | "default" | "lg"
  className?: string
}

/** Avatar con foto o iniciales; el anillo usa el color del rol. */
export function AvatarUsuario({
  usuario,
  size = "default",
  className,
}: AvatarUsuarioProps) {
  return (
    <Avatar
      size={size}
      className={cn("ring-2", className)}
      // Anillo del color del rol al 40 % (#RRGGBBAA).
      style={{ "--tw-ring-color": `${usuario.rol.color}66` } as CSSProperties}
    >
      {usuario.avatarUrl ? (
        <AvatarImage src={usuario.avatarUrl} alt="" />
      ) : null}
      <AvatarFallback className="bg-primary/12 text-xs font-semibold text-lila-700 dark:text-primary">
        {iniciales(usuario.nombre)}
      </AvatarFallback>
    </Avatar>
  )
}

/** Punto + nombre del rol, en el color que la administración le asignó. */
export function DistintivoRol({
  rol,
  className,
}: {
  rol: UsuarioSesion["rol"]
  className?: string
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: rol.color }}
      />
      <span className="truncate">{rol.nombre}</span>
    </span>
  )
}
