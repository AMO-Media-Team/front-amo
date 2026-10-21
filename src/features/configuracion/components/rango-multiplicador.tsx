import { formatearNumero } from "@/lib/format"

/** Límites de la escala dibujada (los de `fn_validar_configuracion` para piso y techo). */
const ESCALA = { minimo: 0.5, maximo: 2 } as const

function posicion(valor: number): number {
  const acotado = Math.min(ESCALA.maximo, Math.max(ESCALA.minimo, valor))
  return ((acotado - ESCALA.minimo) / (ESCALA.maximo - ESCALA.minimo)) * 100
}

function multiplicador(valor: number): string {
  return `${formatearNumero(valor, 2)}×`
}

/**
 * Escala del multiplicador de calidad: la franja entre piso y techo es lo que
 * puede recibir una cuenta; 1× es la tarifa base sin ajuste.
 */
export function RangoMultiplicador({
  piso,
  techo,
}: {
  piso: number
  techo: number
}) {
  const inicio = posicion(piso)
  const fin = posicion(techo)
  const base = posicion(1)
  return (
    <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-4 sm:px-5">
      <p className="text-xs text-muted-foreground">
        Una cuenta con desempeño bajo cobra hasta{" "}
        <span className="font-medium cifras text-foreground">
          {multiplicador(piso)}
        </span>{" "}
        la tarifa base; una destacada, hasta{" "}
        <span className="font-medium cifras text-foreground">
          {multiplicador(techo)}
        </span>
        .
      </p>
      <div
        role="img"
        aria-label={`Rango del multiplicador: de ${multiplicador(piso)} a ${multiplicador(techo)}`}
        className="relative mx-2 mt-5 mb-6 h-2 rounded-full bg-muted"
      >
        <span
          aria-hidden
          className="absolute inset-y-0 rounded-full bg-linear-to-r from-warning/70 via-primary/70 to-success/70"
          style={{ left: `${inicio}%`, width: `${Math.max(1, fin - inicio)}%` }}
        />
        {[
          { valor: piso, izquierda: inicio, arriba: true },
          { valor: 1, izquierda: base, arriba: false },
          { valor: techo, izquierda: fin, arriba: true },
        ].map(({ valor, izquierda, arriba }) => (
          <span
            key={`${valor}-${arriba}`}
            aria-hidden
            className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${izquierda}%` }}
          >
            <span
              className={
                arriba
                  ? "size-3.5 rounded-full border-2 border-background bg-foreground shadow-sm"
                  : "h-4 w-0.5 rounded-full bg-muted-foreground"
              }
            />
            <span
              className={`absolute text-[0.6875rem] font-medium cifras whitespace-nowrap ${
                arriba ? "-top-5" : "top-4 text-muted-foreground"
              }`}
            >
              {valor === 1 && !arriba ? "1× base" : multiplicador(valor)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
