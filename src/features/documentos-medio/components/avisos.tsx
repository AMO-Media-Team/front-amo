import {
  CircleAlert,
  Info,
  LockKeyhole,
  type LucideIcon,
  ShieldCheck,
} from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const TONOS = {
  info: "border-info/30 bg-info/6 [&>svg]:text-info",
  aviso: "border-warning/35 bg-warning/8 [&>svg]:text-warning",
  peligro: "border-destructive/30 bg-destructive/6 [&>svg]:text-destructive",
  neutro: "border-border bg-muted/40 [&>svg]:text-muted-foreground",
} as const

/**
 * Nota fija dentro de una tarjeta u hoja (no es una alerta que se anuncie:
 * su contenido está ahí desde que se pinta la página).
 */
export function Nota({
  tono = "neutro",
  icono: Icono = Info,
  titulo,
  children,
  className,
}: {
  tono?: keyof typeof TONOS
  icono?: LucideIcon
  titulo?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
        TONOS[tono],
        className
      )}
    >
      <Icono aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-col gap-0.5 text-pretty">
        {titulo ? <p className="font-medium">{titulo}</p> : null}
        <div className="text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
          {children}
        </div>
      </div>
    </div>
  )
}

/** Motivo con que el equipo AMO rechazó una carga. */
export function NotaRechazo({
  observaciones,
  titulo = "Motivo del rechazo",
  className,
}: {
  observaciones: string | null
  titulo?: string
  className?: string
}) {
  return (
    <Nota
      tono="peligro"
      icono={CircleAlert}
      titulo={titulo}
      className={className}
    >
      {observaciones ??
        "El equipo AMO no dejó observaciones. Revisa los consejos y cárgalo de nuevo."}
    </Nota>
  )
}

/**
 * La prueba de vida es un dato biométrico (Ley 1581 de 2012, art. 5): su
 * entrega es facultativa y hay una alternativa asistida sin imagen (RF MED-003).
 * Para el medio la videollamada es informativa: la agenda el equipo AMO.
 */
export function AvisoPruebaVida({
  compacto = false,
  className,
}: {
  compacto?: boolean
  className?: string
}) {
  if (compacto) {
    return (
      <Nota tono="info" icono={ShieldCheck} className={className}>
        Es <strong>voluntaria</strong>. Si prefieres no enviar tu foto, el
        equipo AMO puede verificar tu identidad en una videollamada corta.
      </Nota>
    )
  }
  return (
    <Nota
      tono="info"
      icono={ShieldCheck}
      titulo="Enviarla es voluntario"
      className={className}
    >
      <p>
        Tu cara es un dato biométrico, así que decides si la envías. La usamos
        solo para confirmar que eres el titular del documento y solo la ve el
        equipo de verificación de AMO.
      </p>
      <p className="mt-1.5">
        <strong>¿Prefieres no enviarla?</strong> Deja este documento sin cargar
        y envía tu perfil a verificación: te contactaremos al correo o al
        celular de tu cuenta para agendar una videollamada corta. De la
        videollamada no guardamos imágenes de tu cara.
      </p>
    </Nota>
  )
}

/** Por qué se piden los documentos y cómo se protegen. */
export function NotaPrivacidad({ className }: { className?: string }) {
  return (
    <Nota
      icono={LockKeyhole}
      titulo="Tus documentos están protegidos"
      className={className}
    >
      Se guardan en un almacenamiento privado: solo tú y el equipo de
      verificación de AMO pueden abrirlos, con enlaces que caducan en minutos, y
      cada vez que el equipo abre uno queda registrado. Los pedimos para
      confirmar tu identidad y pagarte a tu nombre.
    </Nota>
  )
}
