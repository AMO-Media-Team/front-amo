import { ArrowDown, ArrowRight, ArrowUp, Info, Minus, Plus } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import type { Diferencia, ValorPresentado } from "../valores"

/** Valor antes y después de un cambio, lado a lado (apilados en móvil). */
export function ParAntesDespues({
  antes,
  despues,
}: {
  antes: ValorPresentado
  despues: ValorPresentado
}) {
  return (
    <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr]">
      <TarjetaValor etiqueta="Valor actual" valor={antes} />
      <span
        aria-hidden
        className="grid place-items-center text-muted-foreground max-sm:rotate-90"
      >
        <ArrowRight className="size-4" />
      </span>
      <TarjetaValor etiqueta="Nuevo valor" valor={despues} destacado />
    </div>
  )
}

function TarjetaValor({
  etiqueta,
  valor,
  destacado = false,
}: {
  etiqueta: string
  valor: ValorPresentado
  destacado?: boolean
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-lg border px-3 py-2.5",
        destacado ? "border-primary/40 bg-primary/8" : "bg-muted/40"
      )}
    >
      <span className="text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {etiqueta}
      </span>
      <span
        className={cn(
          "text-[0.9375rem] font-semibold cifras text-pretty",
          !destacado && "text-muted-foreground"
        )}
      >
        {valor.texto}
      </span>
      {valor.equivalencia ? (
        <span className="text-xs text-muted-foreground">
          {valor.equivalencia}
        </span>
      ) : null}
    </div>
  )
}

function Ficha({
  icono,
  tono,
  children,
}: {
  icono: ReactNode
  tono: "mas" | "menos" | "neutro"
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium cifras",
        tono === "mas" && "bg-success/12 text-success",
        tono === "menos" && "bg-destructive/10 text-destructive",
        tono === "neutro" && "bg-muted text-foreground"
      )}
    >
      {icono}
      {children}
    </span>
  )
}

/** Qué cambia, en palabras: variación numérica, opciones que entran y salen o valores de un mapa. */
export function DetalleDiferencia({ diferencia }: { diferencia: Diferencia }) {
  switch (diferencia.tipo) {
    case "numero": {
      const Flecha = diferencia.direccion === "sube" ? ArrowUp : ArrowDown
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Variación</span>
          <Ficha
            tono="neutro"
            icono={<Flecha aria-hidden className="size-3" />}
          >
            <span className="sr-only">
              {diferencia.direccion === "sube" ? "Sube" : "Baja"}
            </span>
            {diferencia.delta}
          </Ficha>
          {diferencia.relativa ? (
            <span className="text-xs cifras text-muted-foreground">
              ({diferencia.relativa})
            </span>
          ) : null}
        </div>
      )
    }
    case "lista":
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          {diferencia.agregados.map((x) => (
            <Ficha
              key={`+${x}`}
              tono="mas"
              icono={<Plus aria-hidden className="size-3" />}
            >
              <span className="sr-only">Se agrega:</span>
              {x}
            </Ficha>
          ))}
          {diferencia.quitados.map((x) => (
            <Ficha
              key={`-${x}`}
              tono="menos"
              icono={<Minus aria-hidden className="size-3" />}
            >
              <span className="sr-only">Se quita:</span>
              {x}
            </Ficha>
          ))}
        </div>
      )
    case "mapa":
      return diferencia.cambios.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {diferencia.cambios.map((cambio) => (
            <li
              key={cambio.etiqueta}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="font-medium">{cambio.etiqueta}</span>
              <span className="flex items-center gap-2 cifras">
                <span className="text-muted-foreground line-through decoration-muted-foreground/50">
                  {cambio.antes}
                </span>
                <ArrowRight
                  aria-hidden
                  className="size-3.5 text-muted-foreground"
                />
                <span className="font-semibold">{cambio.despues}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null
    case "simple":
      return null
  }
}

/** Qué pasa al aplicar el cambio (se muestra en la confirmación). */
export function NotaImpacto({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg bg-info/8 px-3 py-2.5 text-sm text-pretty">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
      <span>{children}</span>
    </p>
  )
}
