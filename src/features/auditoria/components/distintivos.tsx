import {
  Activity,
  ArrowRightLeft,
  Ban,
  CirclePlus,
  Cpu,
  Download,
  Eye,
  FileKey,
  Link2,
  LogOut,
  type LucideIcon,
  MailPlus,
  PencilLine,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  UserCog,
  UserX,
} from "lucide-react"
import type { CSSProperties, ReactNode } from "react"

import { iniciales } from "@/components/layout/iniciales"
import { cn } from "@/lib/utils"

import {
  type AccionBitacora,
  esAccionBitacora,
  ORIGENES,
  type OrigenBitacora,
  type TonoEvento,
} from "../catalogo"
import type { ActorEvento } from "../tipos"

/** Tinte y texto por tono (AA en ambos temas: el texto usa el token sólido). */
export const CLASES_TONO: Readonly<
  Record<TonoEvento, { suave: string; punto: string }>
> = {
  marca: { suave: "bg-primary/12 text-primary", punto: "bg-primary" },
  exito: { suave: "bg-success/12 text-success", punto: "bg-success" },
  info: { suave: "bg-info/12 text-info", punto: "bg-info" },
  // 10 %: con más tinte, el ámbar del tema claro baja de 4.5:1 en texto de 11–12 px.
  aviso: { suave: "bg-warning/10 text-warning", punto: "bg-warning" },
  peligro: {
    suave: "bg-destructive/12 text-destructive",
    punto: "bg-destructive",
  },
  neutro: {
    suave: "bg-muted text-muted-foreground",
    punto: "bg-muted-foreground",
  },
}

export const ICONOS_ACCION: Readonly<Record<AccionBitacora, LucideIcon>> = {
  INSERT: CirclePlus,
  UPDATE: PencilLine,
  DELETE: Trash2,
  TRANSICION: ArrowRightLeft,
  EXPORTAR: Download,
  REVELAR_DATO: Eye,
  URL_FIRMADA: FileKey,
  INVITAR: MailPlus,
  GENERAR_ENLACE: Link2,
  SUSPENDER: Ban,
  REACTIVAR: RotateCcw,
  CERRAR_SESIONES: LogOut,
  CAMBIAR_ROL: UserCog,
  BORRADO_DEFINITIVO: UserX,
  CONFIGURAR: SlidersHorizontal,
  OTRO: Activity,
}

const TAMANOS_ICONO = {
  sm: "size-7 rounded-lg [&_svg]:size-3.5",
  md: "size-8 rounded-full [&_svg]:size-4",
  lg: "size-10 rounded-xl [&_svg]:size-5",
} as const

/** Icono de la acción sobre su tinte (tabla, línea de tiempo y panel). */
export function IconoAccion({
  accion,
  tono,
  tamano = "md",
  className,
}: {
  accion: string
  tono: TonoEvento
  tamano?: keyof typeof TAMANOS_ICONO
  className?: string
}) {
  const Icono = esAccionBitacora(accion) ? ICONOS_ACCION[accion] : Activity
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center",
        TAMANOS_ICONO[tamano],
        CLASES_TONO[tono].suave,
        className
      )}
    >
      <Icono />
    </span>
  )
}

const INSIGNIA =
  "inline-flex h-5.5 w-fit shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap"

/** Distintivo con punto de color y texto; el tono nunca es el único canal. */
export function InsigniaTono({
  tono,
  children,
  className,
}: {
  tono: TonoEvento
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn(INSIGNIA, CLASES_TONO[tono].suave, className)}>
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", CLASES_TONO[tono].punto)}
      />
      {children}
    </span>
  )
}

const TONO_ORIGEN: Readonly<Record<OrigenBitacora, TonoEvento>> = {
  APP: "neutro",
  DB: "info",
  API_DIRECTA: "peligro",
  DEMO: "neutro",
}

export function InsigniaOrigen({
  origen,
  className,
}: {
  origen: OrigenBitacora
  className?: string
}) {
  return (
    <span title={ORIGENES[origen].descripcion} className="inline-flex">
      <InsigniaTono tono={TONO_ORIGEN[origen]} className={className}>
        {ORIGENES[origen].etiqueta}
      </InsigniaTono>
    </span>
  )
}

const TAMANOS_AVATAR = {
  xs: "size-5 text-[0.5625rem] [&_svg]:size-3",
  sm: "size-7 text-[0.6875rem] [&_svg]:size-3.5",
  md: "size-9 text-xs [&_svg]:size-4",
} as const

/**
 * Avatar del actor: iniciales sobre el color de su rol (o el primario) y, para
 * el sistema, un chip de procesador. El color es decorativo: el nombre siempre
 * acompaña al avatar.
 */
export function AvatarActor({
  actor,
  tamano = "sm",
  className,
}: {
  actor: Pick<ActorEvento, "nombre" | "color" | "esSistema">
  tamano?: keyof typeof TAMANOS_AVATAR
  className?: string
}) {
  if (actor.esSistema) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-border",
          TAMANOS_AVATAR[tamano],
          className
        )}
      >
        <Cpu />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      style={
        { "--color-actor": actor.color ?? "var(--primary)" } as CSSProperties
      }
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--color-actor)_20%,var(--card))] font-semibold text-foreground ring-1 ring-[color-mix(in_oklab,var(--color-actor)_45%,transparent)]",
        TAMANOS_AVATAR[tamano],
        className
      )}
    >
      {iniciales(actor.nombre)}
    </span>
  )
}
