import {
  FileCheck2,
  type LucideIcon,
  MailPlus,
  RadioTower,
  UsersRound,
} from "lucide-react"
import Link from "next/link"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  type AccesoColas,
  type Cola,
  COLAS,
  COLAS_VERIFICACION,
  rutaCola,
} from "../colas"
import { contadoresColas } from "../queries"

const ICONOS: Readonly<Record<Cola, LucideIcon>> = {
  medios: RadioTower,
  cuentas: UsersRound,
  documentos: FileCheck2,
  solicitudes: MailPlus,
}

function textoPendientes(cantidad: number | null): string {
  if (cantidad === null) return "sin acceso"
  if (cantidad === 0) return "nada pendiente"
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? "pendiente" : "pendientes"}`
}

function EnlaceCola({
  cola,
  activa,
  cantidad,
}: {
  cola: Cola
  activa: boolean
  cantidad: number | null
}) {
  const Icono = ICONOS[cola]
  const { titulo, descripcion } = COLAS_VERIFICACION[cola]
  const pendiente = cantidad !== null && cantidad > 0
  return (
    <Link
      href={rutaCola(cola)}
      scroll={false}
      aria-current={activa ? "page" : undefined}
      aria-label={`${titulo}: ${textoPendientes(cantidad)}`}
      title={descripcion}
      className={cn(
        "group flex min-h-16 items-center gap-3 rounded-xl border bg-card px-3.5 py-3 transition-colors outline-none hover:bg-muted/60 focus-visible:anillo-foco sm:min-h-20 sm:flex-col sm:items-start sm:gap-2 sm:px-4",
        activa &&
          "border-primary/50 bg-primary/6 ring-1 ring-primary/30 hover:bg-primary/10"
      )}
    >
      {/* En el teléfono el número va a la derecha: el título cede espacio
          (se recorta) y la cifra nunca se corta, tenga las que tenga. */}
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:w-full sm:flex-none">
        <span
          className={cn(
            "flex min-w-0 items-center gap-2 text-sm font-medium",
            activa ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <Icono
            aria-hidden
            className={cn("size-4 shrink-0", activa && "text-primary")}
          />
          <span className="truncate">{titulo}</span>
        </span>
        {pendiente ? (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-warning sm:hidden"
          />
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "ml-auto shrink-0 text-2xl leading-none font-semibold cifras sm:ml-0 sm:text-[1.75rem]",
          cantidad === null || cantidad === 0
            ? "text-muted-foreground"
            : "text-foreground"
        )}
      >
        {cantidad === null ? "—" : formatearNumero(cantidad)}
      </span>
    </Link>
  )
}

/**
 * Colas de la verificación con lo pendiente en cada una. Son enlaces (la cola
 * activa va en la URL y la marca `aria-current`): se comparten, sobreviven al
 * recargar y funcionan sin JavaScript.
 */
export async function NavegacionColas({
  activa,
  acceso,
}: {
  activa: Cola
  acceso: AccesoColas
}) {
  const contadores = await contadoresColas(acceso)
  return (
    <nav aria-label="Colas de verificación">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {COLAS.map((cola) => (
          <li key={cola} className="min-w-0">
            <EnlaceCola
              cola={cola}
              activa={cola === activa}
              cantidad={contadores[cola]}
            />
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function EsqueletoNavegacionColas() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
    >
      <span className="sr-only">Cargando las colas…</span>
      {COLAS.map((cola) => (
        <Esqueleto key={cola} className="h-16 rounded-xl sm:h-20" />
      ))}
    </div>
  )
}
