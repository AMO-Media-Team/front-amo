import {
  BadgeCheck,
  CalendarClock,
  CircleAlert,
  Hourglass,
  ImageUp,
  TimerOff,
} from "lucide-react"
import type { ReactNode } from "react"

import type { Tono } from "@/features/operacion/estados"
import { cn } from "@/lib/utils"

import type { AvisoCuenta as DatosAviso, IconoAviso } from "../presentacion"
import { VencimientoCodigo } from "./codigo-verificacion"

const TONOS: Readonly<Record<Tono, string>> = {
  exito: "border-success/30 bg-success/6 [&>svg]:text-success",
  info: "border-info/30 bg-info/6 [&>svg]:text-info",
  aviso: "border-warning/35 bg-warning/8 [&>svg]:text-warning",
  peligro: "border-destructive/30 bg-destructive/6 [&>svg]:text-destructive",
  neutro: "border-border bg-muted/40 [&>svg]:text-muted-foreground",
}

/** Mapa estático (no se crean componentes en el render). */
function Icono({ icono }: { icono: IconoAviso }) {
  const clase = "mt-0.5 size-4 shrink-0"
  switch (icono) {
    case "revision":
      return <Hourglass aria-hidden className={clase} />
    case "captura":
      return <ImageUp aria-hidden className={clase} />
    case "vencido":
      return <TimerOff aria-hidden className={clase} />
    case "rechazo":
      return <CircleAlert aria-hidden className={clase} />
    case "verificar":
      return <BadgeCheck aria-hidden className={clase} />
    case "plazo":
      return <CalendarClock aria-hidden className={clase} />
  }
}

/** Nota fija con su tono (no se anuncia: está ahí desde que se pinta). */
export function NotaCuenta({
  tono,
  icono,
  titulo,
  children,
  className,
}: {
  tono: Tono
  icono: IconoAviso
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
      <Icono icono={icono} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-pretty">
        {titulo ? <p className="font-medium">{titulo}</p> : null}
        <div className="text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
          {children}
        </div>
      </div>
    </div>
  )
}

/** Lo más importante que debe saber el medio de esta cuenta ahora. */
export function AvisoCuenta({
  aviso,
  ahoraServidor,
}: {
  aviso: DatosAviso
  ahoraServidor: number
}) {
  return (
    <NotaCuenta tono={aviso.tono} icono={aviso.icono} titulo={aviso.titulo}>
      <p>{aviso.descripcion}</p>
      {aviso.venceAt ? (
        <p className="mt-1.5">
          <VencimientoCodigo
            expiraAt={aviso.venceAt}
            ahoraServidor={ahoraServidor}
          />
        </p>
      ) : null}
    </NotaCuenta>
  )
}
