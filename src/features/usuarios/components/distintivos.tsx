import {
  ShieldAlert,
  ShieldCheck,
  ShieldEllipsis,
  ShieldOff,
} from "lucide-react"
import type { CSSProperties } from "react"

import { iniciales } from "@/components/layout/iniciales"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

import { ESTADOS_CUENTA, type EstadoMfa, type Tono } from "../presentacion"
import type { EstadoPerfil, RolResumen } from "../tipos"

/** Clases por tono semántico (texto AA sobre su propio tinte en ambos temas). */
export const CLASES_TONO: Readonly<
  Record<Tono, { insignia: string; punto: string }>
> = {
  exito: { insignia: "bg-success/10 text-success", punto: "bg-success" },
  info: { insignia: "bg-info/10 text-info", punto: "bg-info" },
  aviso: { insignia: "bg-warning/12 text-warning", punto: "bg-warning" },
  peligro: {
    insignia: "bg-destructive/10 text-destructive",
    punto: "bg-destructive",
  },
  neutro: {
    insignia: "bg-muted text-muted-foreground",
    punto: "bg-muted-foreground",
  },
}

const INSIGNIA =
  "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap"

export function InsigniaEstado({
  estado,
  className,
}: {
  estado: EstadoPerfil
  className?: string
}) {
  const { etiqueta, tono } = ESTADOS_CUENTA[estado]
  const clases = CLASES_TONO[tono]
  return (
    <span className={cn(INSIGNIA, clases.insignia, className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", clases.punto)} />
      {etiqueta}
    </span>
  )
}

/** Rol con el color que le asignó la administración (tinte y punto; el texto conserva contraste). */
export function InsigniaRol({
  rol,
  className,
}: {
  rol: Pick<RolResumen, "nombre" | "color"> | null
  className?: string
}) {
  if (!rol) {
    return (
      <span
        className={cn(
          INSIGNIA,
          "border border-dashed text-muted-foreground",
          className
        )}
      >
        Sin rol
      </span>
    )
  }
  return (
    <span
      style={{ "--color-rol": rol.color } as CSSProperties}
      className={cn(
        INSIGNIA,
        "border border-[color-mix(in_oklab,var(--color-rol)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-rol)_12%,transparent)] text-foreground",
        className
      )}
    >
      <span aria-hidden className="size-2 rounded-full bg-(--color-rol)" />
      {rol.nombre}
    </span>
  )
}

const MFA: Readonly<
  Record<EstadoMfa, { Icono: typeof ShieldCheck; texto: string; clase: string }>
> = {
  activa: { Icono: ShieldCheck, texto: "Activa", clase: "text-success" },
  pendiente: { Icono: ShieldAlert, texto: "Pendiente", clase: "text-warning" },
  al_activar: {
    Icono: ShieldEllipsis,
    texto: "Al activar",
    clase: "text-muted-foreground",
  },
  no_usa: { Icono: ShieldOff, texto: "No usa", clase: "text-muted-foreground" },
}

/** Verificación en dos pasos (ver `estadoMfa`). */
export function IndicadorMfa({
  estado,
  compacto = false,
}: {
  estado: EstadoMfa
  /** Solo el ícono (texto para lectores de pantalla); "bajo-lg" solo en pantallas < 1024 px. */
  compacto?: boolean | "bajo-lg"
}) {
  const { Icono, texto, clase } = MFA[estado]
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-sm", clase)}
      title={`Verificación en dos pasos: ${texto.toLocaleLowerCase("es-CO")}`}
    >
      <Icono className="size-4 shrink-0" aria-hidden />
      <span
        className={cn(
          compacto === true && "sr-only",
          compacto === "bajo-lg" && "max-lg:sr-only"
        )}
      >
        {texto}
      </span>
    </span>
  )
}

/** Avatar con iniciales; el anillo usa el color del rol. */
export function AvatarPersona({
  nombre,
  color,
  tamano = "default",
  className,
}: {
  nombre: string
  color: string | null
  tamano?: "sm" | "default" | "lg"
  className?: string
}) {
  return (
    <Avatar
      size={tamano}
      className={cn("ring-2 ring-offset-2 ring-offset-background", className)}
      style={{ "--tw-ring-color": `${color ?? "#8C66EE"}80` } as CSSProperties}
    >
      <AvatarFallback className="bg-primary/12 text-xs font-semibold text-lila-700 group-data-[size=lg]/avatar:text-base dark:text-primary">
        {iniciales(nombre)}
      </AvatarFallback>
    </Avatar>
  )
}
