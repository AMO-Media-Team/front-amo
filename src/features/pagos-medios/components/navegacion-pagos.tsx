import { Banknote, FileSpreadsheet, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { contadoresPagos } from "../queries"
import {
  rutaVistaPagosMedios,
  VISTAS_PAGOS_MEDIOS,
  type VistaPagosMedios,
} from "../rutas"
import { VISTAS } from "../vistas"

const ICONOS: Readonly<Record<VistaPagosMedios, LucideIcon>> = {
  "por-pagar": Banknote,
  dispersiones: FileSpreadsheet,
}

function Pestana({
  vista,
  activa,
  cantidad,
}: {
  vista: VistaPagosMedios
  activa: boolean
  cantidad: number | null
}) {
  const Icono = ICONOS[vista]
  const { titulo } = VISTAS[vista]
  return (
    <Link
      href={rutaVistaPagosMedios(vista)}
      scroll={false}
      aria-current={activa ? "page" : undefined}
      aria-label={
        cantidad === null ? titulo : `${titulo}: ${formatearNumero(cantidad)}`
      }
      className={cn(
        "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors outline-none focus-visible:anillo-foco",
        activa
          ? "bg-card text-foreground shadow-xs ring-1 ring-border"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <Icono
        aria-hidden
        className={cn("size-4 shrink-0", activa && "text-primary")}
      />
      <span className="truncate font-medium">{titulo}</span>
      {cantidad === null ? null : (
        <span
          aria-hidden
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold cifras",
            activa
              ? "bg-primary/12 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          {formatearNumero(cantidad)}
        </span>
      )}
    </Link>
  )
}

function clasesLista(): string {
  return "grid grid-cols-2 gap-1 rounded-2xl border bg-muted/30 p-1 sm:inline-grid sm:w-auto sm:min-w-md"
}

/**
 * Vistas de Pagos a medios con lo que hay en cada una. Son enlaces (la vista
 * va en la URL y la activa lleva `aria-current`): se comparten, sobreviven al
 * recargar y funcionan sin JavaScript.
 */
export async function NavegacionPagos({
  activa,
}: {
  activa: VistaPagosMedios
}) {
  const { porPagar, dispersiones } = await contadoresPagos()
  const cantidades: Readonly<Record<VistaPagosMedios, number>> = {
    "por-pagar": porPagar,
    dispersiones,
  }
  return (
    <nav aria-label="Vistas de pagos a medios" className="min-w-0">
      <ul className={clasesLista()}>
        {VISTAS_PAGOS_MEDIOS.map((vista) => (
          <li key={vista} className="min-w-0">
            <Pestana
              vista={vista}
              activa={vista === activa}
              cantidad={cantidades[vista]}
            />
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Mientras llegan los contadores: las mismas pestañas, sin cifras. */
export function EsqueletoNavegacionPagos({
  activa,
}: {
  activa?: VistaPagosMedios
}) {
  if (!activa) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Cargando las vistas…</span>
        <Esqueleto
          aria-hidden
          className="h-[3.25rem] w-full rounded-2xl sm:w-md"
        />
      </div>
    )
  }
  return (
    <nav aria-label="Vistas de pagos a medios" className="min-w-0">
      <ul className={clasesLista()}>
        {VISTAS_PAGOS_MEDIOS.map((vista) => (
          <li key={vista} className="min-w-0">
            <Pestana vista={vista} activa={vista === activa} cantidad={null} />
          </li>
        ))}
      </ul>
    </nav>
  )
}
