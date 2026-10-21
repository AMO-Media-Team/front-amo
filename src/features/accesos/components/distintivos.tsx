import {
  Ban,
  CircleHelp,
  KeyRound,
  LogIn,
  LogOut,
  type LucideIcon,
  MailQuestionMark,
  Monitor,
  RotateCcwKey,
  ShieldCheck,
  ShieldX,
  Smartphone,
  Tablet,
  TimerOff,
  Unplug,
  UserX,
} from "lucide-react"

import {
  CLASES_TONO,
  InsigniaTono,
} from "@/features/auditoria/components/distintivos"
import { cn } from "@/lib/utils"

import {
  type DispositivoAcceso,
  ETIQUETAS_DISPOSITIVO,
  etiquetaMotivoSospecha,
  type EventoAcceso,
  RESULTADOS,
  type ResultadoAcceso,
} from "../catalogo"

export const ICONOS_EVENTO: Readonly<Record<EventoAcceso, LucideIcon>> = {
  LOGIN_EXITOSO: LogIn,
  LOGIN_FALLIDO: KeyRound,
  LOGIN_BLOQUEADO: Ban,
  MFA_EXITOSO: ShieldCheck,
  MFA_FALLIDO: ShieldX,
  CIERRE_SESION: LogOut,
  SESION_EXPIRADA: TimerOff,
  SESION_REVOCADA: Unplug,
  USUARIO_SUSPENDIDO: UserX,
  RECUPERACION_SOLICITADA: MailQuestionMark,
  CONTRASENA_CAMBIADA: RotateCcwKey,
}

export const ICONOS_DISPOSITIVO: Readonly<
  Record<DispositivoAcceso, LucideIcon>
> = {
  ESCRITORIO: Monitor,
  MOVIL: Smartphone,
  TABLETA: Tablet,
  OTRO: CircleHelp,
}

/** Icono del evento sobre el tinte de su resultado (verde, rojo, ámbar o neutro). */
export function IconoEvento({
  evento,
  resultado,
  className,
}: {
  evento: EventoAcceso
  resultado: ResultadoAcceso
  className?: string
}) {
  const Icono = ICONOS_EVENTO[evento]
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-lg [&_svg]:size-3.5",
        CLASES_TONO[RESULTADOS[resultado].tono].suave,
        className
      )}
    >
      <Icono />
    </span>
  )
}

export function InsigniaResultado({
  resultado,
}: {
  resultado: ResultadoAcceso
}) {
  const { etiqueta, tono } = RESULTADOS[resultado]
  return <InsigniaTono tono={tono}>{etiqueta}</InsigniaTono>
}

export function InsigniaSospecha({ motivo }: { motivo: string | null }) {
  return (
    <InsigniaTono tono="aviso" className="font-semibold">
      {etiquetaMotivoSospecha(motivo)}
    </InsigniaTono>
  )
}

/** Bandera emoji (o el código, si el sistema no la dibuja) de un país. */
export function Bandera({
  bandera,
  iso2,
  className,
}: {
  bandera: string | null
  iso2: string | null
  className?: string
}) {
  if (!bandera || !iso2) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid h-5 w-6 shrink-0 place-items-center rounded-[4px] bg-muted text-[0.625rem] text-muted-foreground",
          className
        )}
      >
        —
      </span>
    )
  }
  return (
    <span
      role="img"
      aria-label={`Bandera ${iso2}`}
      className={cn(
        "inline-block w-6 shrink-0 text-center text-lg leading-none",
        className
      )}
    >
      {bandera}
    </span>
  )
}

export function Dispositivo({
  dispositivo,
  className,
}: {
  dispositivo: DispositivoAcceso | null
  className?: string
}) {
  const Icono = ICONOS_DISPOSITIVO[dispositivo ?? "OTRO"]
  return (
    <Icono
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
      aria-label={
        dispositivo
          ? ETIQUETAS_DISPOSITIVO[dispositivo]
          : "Dispositivo desconocido"
      }
    />
  )
}
