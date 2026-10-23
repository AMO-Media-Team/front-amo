import { Handshake } from "lucide-react"

import {
  ID_EN_CURSO_SUSPENDIDO,
  resumirEnCurso,
  textoResumenEnCurso,
} from "../en-curso"
import type { AsignacionEnCurso } from "../tipos"
import { ListaEnCurso } from "./lista-en-curso"

/**
 * En la ficha de un medio SUSPENDIDO (ADM-002 c2): lo que conserva en curso,
 * para que el equipo AMO abra cada asignación y decida si la cancela con su
 * causa. El título es el destino del aviso «Ver la lista» tras suspender.
 */
export function EnCursoSuspendido({
  asignaciones,
  verDisputas,
}: {
  asignaciones: readonly AsignacionEnCurso[]
  verDisputas: boolean
}) {
  const vacia = asignaciones.length === 0
  return (
    <section
      aria-labelledby={ID_EN_CURSO_SUSPENDIDO}
      className="flex flex-col rounded-xl border border-warning/40 bg-card"
    >
      <header className="flex items-start gap-3 border-b px-5 py-4">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-warning/12 text-warning">
          <Handshake className="size-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            id={ID_EN_CURSO_SUSPENDIDO}
            tabIndex={-1}
            className="w-fit scroll-mt-24 rounded-sm text-[0.9375rem] font-semibold outline-none focus-visible:anillo-foco"
          >
            {vacia
              ? "Sin asignaciones en curso"
              : "Asignaciones en curso por revisar"}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {textoResumenEnCurso(resumirEnCurso(asignaciones))}
          </p>
        </div>
      </header>
      {vacia ? null : (
        <div className="p-5">
          <ListaEnCurso
            asignaciones={asignaciones}
            verDisputas={verDisputas}
            etiqueta="Asignaciones en curso por revisar"
            className="grid lg:grid-cols-2"
          />
        </div>
      )}
    </section>
  )
}
