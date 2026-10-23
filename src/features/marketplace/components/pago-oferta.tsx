"use client"

import { CircleAlert } from "lucide-react"
import { useId } from "react"

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  formatearHandle,
  formatearMultiplicador,
} from "@/features/operacion/formato"
import {
  formatearCOP,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  FUERA_DE_TOPE,
  MULTIPLICADORES,
  textoCupos,
  textoPublicaciones,
  type Tope,
} from "../presentacion"
import type { Cotizacion, CuentaCotizada } from "../tipos"

function datosCuenta(cuenta: CuentaCotizada): string {
  const partes = [`Franja ${cuenta.franjaClave}`]
  if (cuenta.cotizacion) {
    partes.push(`${formatearNumero(cuenta.cotizacion.seguidores)} seguidores`)
  }
  partes.push(textoCupos(cuenta.cuposRestantes))
  return partes.join(" · ")
}

/** Lo que recibe con una cuenta (o por qué no se puede usar). */
function ContenidoCuenta({
  cuenta,
  fueraDeTope = null,
}: {
  cuenta: CuentaCotizada
  /** El tope que superaría con esta cuenta (anual o de la campaña). */
  fueraDeTope?: Tope | null
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="min-w-0 truncate font-medium">
          {formatearHandle(cuenta.handle)}
        </span>
        {cuenta.cotizacion ? (
          <span className="text-lg leading-tight font-bold cifras">
            {formatearCOP(cuenta.cotizacion.montoMedio)}
          </span>
        ) : null}
      </span>
      <span className="text-xs text-muted-foreground">
        {datosCuenta(cuenta)}
      </span>
      {cuenta.aviso ? (
        <span className="flex items-start gap-1.5 text-xs text-warning">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {cuenta.aviso}
        </span>
      ) : fueraDeTope ? (
        <span className="flex items-start gap-1.5 text-xs text-warning">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {FUERA_DE_TOPE[fueraDeTope]}
        </span>
      ) : null}
    </span>
  )
}

/** ¿Esta cuenta se puede elegir ahora? (cupo en su franja y pago calculado). */
export function cuentaUsable(cuenta: CuentaCotizada): boolean {
  return cuenta.cuposRestantes > 0 && cuenta.cotizacion !== null
}

/**
 * Sus cuentas que caben en la oferta, con lo que recibe con cada una
 * (MED-009). Con más de una usable se elige con qué cuenta publica; las que
 * no tienen cupo o pago calculado se muestran sin poder elegirse. Entre
 * varias, las que superarían un tope (el anual del nivel o la participación
 * máxima en la campaña) se pueden elegir, pero dicen cuál.
 */
export function SeleccionCuenta({
  cuentas,
  elegida,
  onElegir,
  deshabilitado,
  idEtiqueta,
  fueraDeTope,
}: {
  cuentas: readonly CuentaCotizada[]
  elegida: string | null
  onElegir: (cuentaSocialId: string) => void
  deshabilitado?: boolean
  /** Título que nombra el grupo de opciones. */
  idEtiqueta: string
  /** El tope que superaría con esta cuenta, o `null` (sin dato: no se marca). */
  fueraDeTope?: (cuenta: CuentaCotizada) => Tope | null
}) {
  const usables = cuentas.filter(cuentaUsable)
  const otras = cuentas.filter((cuenta) => !cuentaUsable(cuenta))
  const elegible = usables.length > 1

  return (
    <div className="flex flex-col gap-2">
      {elegible ? (
        <RadioGroup
          value={elegida ?? undefined}
          onValueChange={(valor) => onElegir(String(valor))}
          disabled={deshabilitado}
          aria-labelledby={idEtiqueta}
          className="gap-2"
        >
          {usables.map((cuenta) => (
            <label
              key={cuenta.cuentaSocialId}
              className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background/60 p-3 transition-colors select-none hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/6 has-data-disabled:cursor-not-allowed has-data-disabled:opacity-60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20"
            >
              <RadioGroupItem value={cuenta.cuentaSocialId} className="mt-1" />
              <ContenidoCuenta
                cuenta={cuenta}
                fueraDeTope={fueraDeTope?.(cuenta)}
              />
            </label>
          ))}
        </RadioGroup>
      ) : (
        usables.map((cuenta) => (
          <div
            key={cuenta.cuentaSocialId}
            className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3"
          >
            {/* Una sola cuenta: el aviso del tope, debajo, ya lo explica. */}
            <ContenidoCuenta cuenta={cuenta} />
          </div>
        ))
      )}
      {otras.length > 0 ? (
        <ul
          aria-label="Cuentas que no puedes usar en esta oferta"
          className="flex flex-col gap-2"
        >
          {otras.map((cuenta) => (
            <li
              key={cuenta.cuentaSocialId}
              className="flex items-start gap-3 rounded-xl border border-dashed p-3 text-muted-foreground"
            >
              <ContenidoCuenta cuenta={cuenta} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Fila({
  etiqueta,
  valor,
  ayuda,
  destacada,
}: {
  etiqueta: string
  valor: string
  ayuda?: string
  destacada?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 py-2",
        destacada && "pt-3"
      )}
    >
      <dt className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("text-sm", destacada && "font-semibold")}>
          {etiqueta}
        </span>
        {ayuda ? (
          <span className="text-xs text-muted-foreground">{ayuda}</span>
        ) : null}
      </dt>
      <dd
        className={cn(
          "shrink-0 text-right text-sm cifras",
          destacada && "text-base font-bold"
        )}
      >
        {valor}
      </dd>
    </div>
  )
}

/**
 * Cómo se calcula el pago con la cuenta elegida: tarifa base de su franja,
 * multiplicadores (calidad, pertinencia geográfica y exclusividad) y, si la
 * plataforma lo muestra, el valor bruto y la comisión (MED-009 c1). El valor
 * final es antes de retenciones.
 */
export function DetallePago({
  cotizacion,
  handle,
}: {
  cotizacion: Cotizacion
  handle: string
}) {
  const idTitulo = useId()
  const valores = {
    calidad: cotizacion.multiplicadorCalidad,
    geografico: cotizacion.multiplicadorGeografico,
    exclusividad: cotizacion.multiplicadorExclusividad,
  } as const
  const multiplicadores = MULTIPLICADORES.filter(
    (multiplicador) =>
      multiplicador.clave !== "exclusividad" || valores.exclusividad !== 1
  )
  const { desglose } = cotizacion

  return (
    <section
      aria-labelledby={idTitulo}
      className="rounded-xl border bg-muted/30 px-4 py-3"
    >
      <h3 id={idTitulo} className="text-sm font-semibold">
        Cómo se calcula tu pago con {formatearHandle(handle)}
      </h3>
      <dl className="mt-1 flex flex-col divide-y divide-border/60">
        {desglose?.tarifaBase != null ? (
          <Fila
            etiqueta={`Tarifa base de tu franja (${cotizacion.franjaClave})`}
            valor={formatearCOP(desglose.tarifaBase)}
            ayuda="Por publicación, según el formato y tus seguidores."
          />
        ) : null}
        {multiplicadores.map((multiplicador) => (
          <Fila
            key={multiplicador.clave}
            etiqueta={multiplicador.etiqueta}
            valor={formatearMultiplicador(valores[multiplicador.clave])}
            ayuda={multiplicador.ayuda}
          />
        ))}
        {cotizacion.publicaciones > 1 ? (
          <Fila
            etiqueta="Publicaciones"
            valor={`× ${formatearNumero(cotizacion.publicaciones)}`}
            ayuda={`La oferta pide ${textoPublicaciones(cotizacion.publicaciones)}.`}
          />
        ) : null}
        {desglose ? (
          <>
            <Fila
              etiqueta="Valor bruto"
              valor={formatearCOP(desglose.montoBruto)}
              ayuda="Lo que paga el anunciante por tu cupo."
            />
            <Fila
              etiqueta={`Comisión AMO (${formatearPorcentaje(desglose.porcentajeComision, 0)})`}
              valor={`− ${formatearCOP(desglose.montoComision)}`}
            />
          </>
        ) : null}
        <Fila
          etiqueta="Recibes"
          valor={formatearCOP(cotizacion.montoMedio)}
          ayuda="Antes de retenciones. Queda congelado al aceptar."
          destacada
        />
      </dl>
    </section>
  )
}
