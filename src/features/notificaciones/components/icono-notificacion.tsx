import {
  Bell,
  CalendarClock,
  ChartColumnBig,
  type LucideIcon,
  Megaphone,
  Scale,
  ShieldAlert,
  UserRoundCheck,
  Wallet,
} from "lucide-react"

import { cn } from "@/lib/utils"

import { type Categoria, categoriaDe } from "../presentacion"

/** Mapa estático (no se crean componentes en render): icono y tono por categoría. */
export const ESTILOS_CATEGORIA: Readonly<
  Record<Categoria, { icono: LucideIcon; clase: string }>
> = {
  ofertas: { icono: Megaphone, clase: "bg-primary/12 text-primary" },
  asignaciones: { icono: CalendarClock, clase: "bg-info/12 text-info" },
  ejecucion: { icono: ChartColumnBig, clase: "bg-warning/14 text-warning" },
  pagos: { icono: Wallet, clase: "bg-success/12 text-success" },
  cuentas: { icono: UserRoundCheck, clase: "bg-info/12 text-info" },
  disputas: { icono: Scale, clase: "bg-destructive/12 text-destructive" },
  seguridad: {
    icono: ShieldAlert,
    clase: "bg-destructive/12 text-destructive",
  },
  otras: { icono: Bell, clase: "bg-muted text-muted-foreground" },
}

/**
 * Icono de la notificación según su categoría, con un punto cuando está sin
 * leer (el texto accesible lo aporta la fila).
 */
export function IconoNotificacion({
  tipo,
  leida,
  className,
}: {
  tipo: string
  leida: boolean
  className?: string
}) {
  const { icono: Icono, clase } = ESTILOS_CATEGORIA[categoriaDe(tipo)]
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-xl transition-opacity",
        clase,
        leida && "opacity-70",
        className
      )}
    >
      <Icono className="size-[1.125rem]" />
      {leida ? null : (
        <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-card" />
      )}
    </span>
  )
}
