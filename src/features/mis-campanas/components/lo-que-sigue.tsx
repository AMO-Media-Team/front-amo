import { formatearFechaHora } from "@/lib/format"

import type { PasoMedio } from "../tipos"
import { ID_LO_QUE_SIGUE } from "./ids"
import { PasoSiguiente } from "./paso-siguiente"

/**
 * «Lo que sigue» en la ficha: la acción con su explicación y su plazo (el
 * botón va en el pie fijo), la espera, el reclamo o cómo terminó. Su título
 * recibe el foco cuando la acción que lo cambió hace desaparecer el botón.
 */
export function LoQueSigue({
  paso,
  ahoraServidor,
  puedeEjecutar,
  conBotonEnPie,
  desistirHasta,
}: {
  paso: PasoMedio
  ahoraServidor: number
  puedeEjecutar: boolean
  /** La acción ya está en el pie fijo: aquí no se repite el botón. */
  conBotonEnPie: boolean
  /** Hasta cuándo puede desistir, si todavía puede. */
  desistirHasta: string | null
}) {
  return (
    <section
      aria-labelledby={ID_LO_QUE_SIGUE}
      className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-card p-4 sm:p-5"
    >
      <h2
        id={ID_LO_QUE_SIGUE}
        tabIndex={-1}
        className="w-fit rounded text-[0.6875rem] font-semibold tracking-[0.08em] text-primary uppercase outline-none focus-visible:anillo-foco"
      >
        Lo que sigue
      </h2>
      <PasoSiguiente
        paso={paso}
        ahoraServidor={ahoraServidor}
        puedeEjecutar={puedeEjecutar}
        variante="ficha"
        sinBoton={conBotonEnPie}
      />
      {desistirHasta ? (
        <p className="border-t pt-3 text-xs text-pretty text-muted-foreground">
          ¿Ya no puedes cumplir? Puedes desistir hasta el{" "}
          {formatearFechaHora(desistirHasta)}, antes de descargar el contenido:
          el cupo queda libre para otro medio.
        </p>
      ) : null}
    </section>
  )
}
