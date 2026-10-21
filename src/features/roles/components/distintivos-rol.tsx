import { KeyRound, Lock, Shapes, TriangleAlert, UserRound } from "lucide-react"
import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

import { TIPOS_ROL_ETIQUETA } from "../presentacion"
import type { RolListado, TipoRol } from "../tipos"
import { ICONO_SUPERADMIN, ICONOS_TIPO } from "./iconos"

/** Variable CSS con el color del rol, para tintes con `color-mix`. */
export function estiloColorRol(color: string): CSSProperties {
  return { "--color-rol": color } as CSSProperties
}

const TAMANOS_ICONO = {
  sm: "size-8 rounded-lg [&_svg]:size-4",
  md: "size-10 rounded-xl [&_svg]:size-5",
  lg: "size-14 rounded-2xl [&_svg]:size-7 sm:size-16",
} as const

/**
 * Ícono del rol sobre un tinte de su color. El trazo mezcla el color con el
 * texto del tema para que conserve contraste en claro y en oscuro.
 */
export function IconoRol({
  rol,
  tamano = "md",
  className,
}: {
  rol: Pick<RolListado, "clave" | "tipo" | "color">
  tamano?: keyof typeof TAMANOS_ICONO
  className?: string
}) {
  const Icono =
    rol.clave === "SUPERADMIN" ? ICONO_SUPERADMIN : ICONOS_TIPO[rol.tipo]
  return (
    <span
      aria-hidden
      style={estiloColorRol(rol.color)}
      className={cn(
        "relative grid shrink-0 place-items-center bg-[color-mix(in_oklab,var(--color-rol)_16%,transparent)] text-[color-mix(in_oklab,var(--color-rol)_72%,var(--foreground))] ring-1 ring-[color-mix(in_oklab,var(--color-rol)_32%,transparent)] ring-inset",
        TAMANOS_ICONO[tamano],
        className
      )}
    >
      <Icono />
    </span>
  )
}

const PILDORA =
  "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap"

export function InsigniaTipo({
  tipo,
  className,
}: {
  tipo: TipoRol
  className?: string
}) {
  const Icono = ICONOS_TIPO[tipo]
  return (
    <span className={cn(PILDORA, "bg-muted text-muted-foreground", className)}>
      <Icono className="size-3.5" aria-hidden />
      {TIPOS_ROL_ETIQUETA[tipo]}
    </span>
  )
}

/** De sistema (candado: solo cambia por migración) o personalizado. */
export function InsigniaOrigen({
  esSistema,
  className,
}: {
  esSistema: boolean
  className?: string
}) {
  return esSistema ? (
    <span
      className={cn(
        PILDORA,
        "border border-border text-muted-foreground",
        className
      )}
      title="Rol de sistema: sus permisos solo cambian con una actualización de la plataforma"
    >
      <Lock className="size-3.5" aria-hidden />
      Sistema
    </span>
  ) : (
    <span className={cn(PILDORA, "bg-primary/10 text-primary", className)}>
      <Shapes className="size-3.5" aria-hidden />
      Personalizado
    </span>
  )
}

/** El rol del propio actor: nadie edita los permisos de su rol. */
export function InsigniaPropio({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        PILDORA,
        "bg-secondary text-secondary-foreground",
        className
      )}
      title="Es tu rol: sus permisos solo los puede cambiar otra persona"
    >
      <UserRound className="size-3.5" aria-hidden />
      Tu rol
    </span>
  )
}

export function InsigniaMfa({ className }: { className?: string }) {
  return (
    <span
      className={cn(PILDORA, "bg-success/10 text-success", className)}
      title="Exige verificación en dos pasos para ingresar"
    >
      <KeyRound className="size-3.5" aria-hidden />
      MFA
    </span>
  )
}

/** Rol externo con permisos del equipo interno (le abren datos de toda la plataforma). */
export function InsigniaRevisar({
  cantidad,
  className,
}: {
  cantidad: number
  className?: string
}) {
  return (
    <span
      className={cn(PILDORA, "bg-destructive/10 text-destructive", className)}
      title={`${cantidad} ${cantidad === 1 ? "permiso no corresponde" : "permisos no corresponden"} a su tipo de rol`}
    >
      <TriangleAlert className="size-3.5" aria-hidden />
      Revisar permisos
    </span>
  )
}

/** Proporción del catálogo que tiene el rol, en su color. */
export function BarraCobertura({
  cantidad,
  total,
  color,
  className,
}: {
  cantidad: number
  total: number
  color: string
  className?: string
}) {
  const porcentaje =
    total > 0 ? Math.min(100, Math.round((cantidad / total) * 100)) : 0
  return (
    <div
      role="presentation"
      style={estiloColorRol(color)}
      className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className="h-full rounded-full bg-(--color-rol) transition-[width] duration-700 ease-suave"
        style={{ width: `${porcentaje}%` }}
      />
    </div>
  )
}
