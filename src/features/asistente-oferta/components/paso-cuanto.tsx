"use client"

import { CircleAlert, Info, RotateCw, Wallet } from "lucide-react"
import { useEffect, useEffectEvent, useId } from "react"
import { useFormContext, useFormState, useWatch } from "react-hook-form"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CampoCifra } from "@/features/configuracion/components/campos"
import { textoANumero } from "@/features/configuracion/numeros"
import { formatearCOP, formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  avisosEstimacion,
  cantidadDe,
  cifraEstimada,
  cifraMedios,
  cuposPedidos,
  ESCALON_SEGUIDORES_ESTIMACION,
  inversionFranja,
  parametrosEstimacion,
  porcentajeRecargo,
  SIN_ESTIMACION,
  totalesEstimacion,
} from "../estimador"
import { nombreFormato } from "../formatos"
import type { ValoresOferta } from "../schemas"
import type {
  CampanaAsistente,
  ConfiguracionAsistente,
  EstimacionFranja,
  FormatoAsistente,
  FranjaAsistente,
  OfertaEnCurso,
} from "../tipos"
import { useEstimacion } from "./consultas"

export interface PropsPasoCuanto {
  campana: Pick<CampanaAsistente, "presupuestoTotal" | "disponible">
  configuracion: Pick<
    ConfiguracionAsistente,
    "minimoMedios" | "estimadorMinimo" | "recargoExclusividad"
  >
  formatos: readonly FormatoAsistente[]
  franjas: readonly FranjaAsistente[]
  ofertas: readonly OfertaEnCurso[]
}

function presupuestoDe(texto: string | undefined): number | null {
  const valor = textoANumero(texto ?? "")
  return valor !== null && valor > 0 ? valor : null
}

/**
 * Paso 4 · Cuánto (ANU-007): el anunciante no fija precios. Define el
 * presupuesto máximo y los cupos por franja de cada oferta, y el tope por
 * medio; el estimador muestra por franja los medios elegibles, el precio
 * mediano, la inversión y el alcance mediano («Menos de 5» y «Sin
 * estimación» cuando hay pocos medios). Los avisos orientan (también si el
 * precio mediano supera el tope por medio); la BD decide al enviar.
 */
export function PasoCuanto({
  campana,
  configuracion,
  formatos,
  franjas,
  ofertas,
}: PropsPasoCuanto) {
  const { control, trigger } = useFormContext<ValoresOferta>()
  const [elegidos, tope, exclusividad] = useWatch({
    control,
    name: ["cuanto.formatos", "cuanto.topePorcentaje", "cuando.exclusividad"],
  })
  const { errors } = useFormState({ control, name: "cuanto" })
  const hayErrores = Boolean(errors.cuanto)
  const claveMontos = JSON.stringify(
    elegidos.map((f) => [f.presupuestoMaximo, f.cupos.map((c) => c.cantidad)])
  )
  // Tras un intento fallido, las reglas entre ofertas (suma del presupuesto,
  // cupos mínimos) se vuelven a comprobar mientras se corrigen.
  const revalidar = useEffectEvent(() => {
    if (hayErrores) void trigger("cuanto")
  })
  useEffect(() => revalidar(), [claveMontos])

  // Lo ya enviado está descontado del disponible: no vuelve a sumar.
  const enviados = new Set(
    ofertas
      .filter((oferta) => !["BORRADOR", "DEVUELTA"].includes(oferta.estado))
      .map((oferta) => oferta.formatoId)
  )
  const suma = elegidos
    .filter((formato) => !enviados.has(formato.formatoId))
    .reduce(
      (total, formato) =>
        total + (presupuestoDe(formato.presupuestoMaximo) ?? 0),
      0
    )
  const topeNumero = textoANumero(tope ?? "")
  const topeMonto =
    topeNumero !== null && topeNumero > 0
      ? (campana.presupuestoTotal * topeNumero) / 100
      : null
  const excede = campana.disponible !== null && suma > campana.disponible

  return (
    <div className="flex flex-col gap-7">
      <section
        aria-label="Presupuesto de la campaña"
        className="grid gap-3 rounded-xl border bg-muted/25 p-4 sm:grid-cols-2"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Wallet aria-hidden className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <p className="text-xs text-muted-foreground">
              Disponible en la campaña
            </p>
            <p className="text-lg font-semibold cifras">
              {campana.disponible === null
                ? "No disponible"
                : formatearCOP(campana.disponible)}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col sm:items-end sm:text-right">
          <p className="text-xs text-muted-foreground">
            {elegidos.length > 1
              ? "Suma de los presupuestos de estas ofertas"
              : "Presupuesto de esta oferta"}
          </p>
          {/* Cifra y exceso en la misma región viva: se anuncian juntos. */}
          <div aria-live="polite" className="flex flex-col sm:items-end">
            <p
              className={cn(
                "text-lg font-semibold cifras",
                excede && "text-destructive"
              )}
            >
              {formatearCOP(suma)}
            </p>
            {excede ? (
              <p className="text-xs text-destructive">
                Supera lo disponible: baja algún presupuesto.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <CampoCifra
        nombre="cuanto.topePorcentaje"
        etiqueta="Tope por medio"
        sufijo="%"
        decimal
        className="max-w-xs"
        descripcion={
          topeMonto !== null
            ? `Ningún medio recibirá más de ${formatearCOP(topeMonto)} de esta campaña (sobre su presupuesto total de ${formatearCOP(campana.presupuestoTotal)}).`
            : "Porcentaje máximo del presupuesto total de la campaña que puede recibir un medio."
        }
      />

      {exclusividad ? (
        <p className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/8 px-3 py-2.5 text-sm">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
          Los precios estimados incluyen el recargo de exclusividad (
          {porcentajeRecargo(configuracion.recargoExclusividad)} más).
        </p>
      ) : null}

      {elegidos.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
          Elige al menos un formato en el paso 1 para definir su presupuesto.
        </p>
      ) : (
        elegidos.map((elegido, indice) => {
          const formato = formatos.find((f) => f.id === elegido.formatoId)
          if (!formato) return null
          const oferta = ofertas.find((o) => o.formatoId === formato.id)
          return (
            <TarjetaPresupuesto
              key={formato.id}
              indice={indice}
              formato={formato}
              franjas={franjas}
              minimoCupos={configuracion.minimoMedios}
              minimoEstimador={configuracion.estimadorMinimo}
              topeMonto={topeMonto}
              bloqueada={Boolean(
                oferta && !["BORRADOR", "DEVUELTA"].includes(oferta.estado)
              )}
            />
          )
        })
      )}
    </div>
  )
}

function TarjetaPresupuesto({
  indice,
  formato,
  franjas,
  minimoCupos,
  minimoEstimador,
  topeMonto,
  bloqueada,
}: {
  indice: number
  formato: FormatoAsistente
  franjas: readonly FranjaAsistente[]
  minimoCupos: number
  minimoEstimador: number
  /** Lo máximo que puede recibir un medio de la campaña; null si no se entiende el tope. */
  topeMonto: number | null
  bloqueada: boolean
}) {
  const idTitulo = useId()
  const { control, register, getFieldState } = useFormContext<ValoresOferta>()
  const formState = useFormState({ control, name: "cuanto" })
  const [que, quien, cuando, elegido] = useWatch({
    control,
    name: ["que", "quien", "cuando", `cuanto.formatos.${indice}`],
  })
  const consulta = useEstimacion(
    parametrosEstimacion({ que, quien, cuando }, formato.id, franjas)
  )
  const filas: readonly EstimacionFranja[] = consulta.data ?? []
  const cupos = cuposPedidos(elegido?.cupos ?? [])
  const totales = totalesEstimacion(filas, cupos)
  const presupuesto = presupuestoDe(elegido?.presupuestoMaximo)
  const avisos = consulta.data
    ? avisosEstimacion({
        filas,
        cupos,
        franjas,
        presupuesto,
        topeMonto,
        minimoCupos,
        minimoEstimador,
      })
    : []

  return (
    <section
      aria-labelledby={idTitulo}
      className="flex flex-col gap-5 rounded-2xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={idTitulo} className="text-base font-semibold">
          {nombreFormato(formato)}
        </h3>
        {bloqueada ? (
          <p className="text-xs text-muted-foreground">
            Ya enviada: no se modifica aquí.
          </p>
        ) : null}
      </div>

      <CampoCifra
        nombre={`cuanto.formatos.${indice}.presupuestoMaximo`}
        etiqueta="Presupuesto máximo"
        prefijo="$"
        className="max-w-sm"
        deshabilitado={bloqueada}
        descripcion="Lo máximo que se invertirá en esta oferta; el precio de cada medio lo calcula AMO."
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold">Cupos por franja</h4>
          <p className="text-xs text-muted-foreground">
            Un cupo = un medio de esa franja de seguidores.
          </p>
        </div>
        <div
          aria-hidden
          className="hidden grid-cols-[minmax(0,1.3fr)_6.5rem_repeat(4,minmax(0,1fr))] gap-x-3 border-b px-2 pb-2 text-xs text-muted-foreground md:grid"
        >
          <span>Franja</span>
          <span>Cupos</span>
          <span>Medios elegibles</span>
          <span>Precio mediano</span>
          <span>Inversión estimada</span>
          <span>Alcance mediano</span>
        </div>
        <ul className="flex flex-col gap-2 md:gap-0">
          {franjas.map((franja, j) => {
            const ruta =
              `cuanto.formatos.${indice}.cupos.${j}.cantidad` as const
            const { error, invalid } = getFieldState(ruta, formState)
            const fila = filas.find((f) => f.franjaId === franja.id)
            const cantidad = cantidadDe(elegido?.cupos[j]?.cantidad ?? "")
            const idCampo = `${idTitulo}-cupos-${j}`
            return (
              <li
                key={franja.id}
                className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-start gap-x-3 gap-y-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1.3fr)_6.5rem_repeat(4,minmax(0,1fr))] md:items-center md:rounded-none md:border-0 md:border-b md:px-2 md:py-2.5"
              >
                <p className="pt-1 text-sm font-medium md:pt-0">
                  {franja.nombre}
                  <span className="block text-xs font-normal text-muted-foreground">
                    seguidores
                  </span>
                </p>
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor={idCampo}
                    className="text-xs font-normal text-muted-foreground md:sr-only"
                  >
                    Cupos{" "}
                    <span className="sr-only">
                      en la franja {franja.nombre}
                    </span>
                  </Label>
                  <Input
                    id={idCampo}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    disabled={bloqueada}
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? `${idCampo}-error` : undefined}
                    className="cifras"
                    {...register(ruta)}
                  />
                </div>
                <dl className="col-span-2 grid grid-cols-2 gap-x-3 gap-y-1.5 md:col-span-4 md:grid-cols-4">
                  <Metrica
                    etiqueta="Medios elegibles"
                    cargando={consulta.isPending}
                    valor={
                      fila
                        ? cifraMedios(fila.mediosElegibles, minimoEstimador)
                        : "—"
                    }
                    atenuado={fila?.mediosElegibles === null}
                  />
                  <Metrica
                    etiqueta="Precio mediano"
                    cargando={consulta.isPending}
                    valor={
                      fila ? cifraEstimada(fila.precioMediano, "cop") : "—"
                    }
                  />
                  <Metrica
                    etiqueta="Inversión estimada"
                    cargando={consulta.isPending}
                    valor={
                      !fila
                        ? "—"
                        : cantidad === 0
                          ? formatearCOP(0)
                          : cifraEstimada(
                              inversionFranja(fila, cantidad),
                              "cop"
                            )
                    }
                  />
                  <Metrica
                    etiqueta="Alcance mediano"
                    cargando={consulta.isPending}
                    valor={
                      fila ? cifraEstimada(fila.alcanceMediano, "numero") : "—"
                    }
                  />
                </dl>
                {error ? (
                  <FieldError
                    id={`${idCampo}-error`}
                    className="col-span-2 md:col-span-6"
                    errors={[error]}
                  />
                ) : null}
              </li>
            )
          })}
        </ul>
        {consulta.isError ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <CircleAlert aria-hidden className="size-4" />
            <span>{consulta.error.message}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void consulta.refetch()}
            >
              <RotateCw data-icon="inline-start" aria-hidden />
              Reintentar
            </Button>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          «Menos de {formatearNumero(minimoEstimador)}» y «{SIN_ESTIMACION}»:
          con menos de {formatearNumero(minimoEstimador)} medios (o
          publicaciones medidas) en una franja no damos cifras, para no revelar
          las de un medio en particular. Por lo mismo, excluir menos de{" "}
          {formatearNumero(minimoEstimador)} medios de una franja no cambia la
          estimación, y el mínimo de seguidores se aproxima hacia abajo a
          múltiplos de {formatearNumero(ESCALON_SEGUIDORES_ESTIMACION)} para
          estimar.
        </p>
      </div>

      <div
        aria-live="polite"
        className="flex flex-col gap-1 rounded-lg bg-muted/40 px-3 py-2.5 text-sm"
      >
        <p>
          <span className="text-muted-foreground">Cupos: </span>
          <strong className="cifras">{formatearNumero(totales.cupos)}</strong>
          <span className="text-muted-foreground"> · Inversión estimada: </span>
          <strong className="cifras">
            {totales.inversion === null
              ? totales.cupos > 0
                ? SIN_ESTIMACION
                : formatearCOP(0)
              : formatearCOP(totales.inversion)}
          </strong>
          {totales.parcial && totales.inversion !== null ? (
            <span className="text-muted-foreground">
              {" "}
              (sin contar franjas sin estimación)
            </span>
          ) : null}
        </p>
        {consulta.isFetching && !consulta.isPending ? (
          <p className="text-xs text-muted-foreground">Actualizando…</p>
        ) : null}
      </div>

      {avisos.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {avisos.map((aviso) => (
            <li
              key={aviso.mensaje}
              className="flex items-start gap-2 rounded-lg border border-warning/35 bg-warning/8 px-3 py-2.5 text-sm"
            >
              <CircleAlert
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-warning"
              />
              {aviso.mensaje}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function Metrica({
  etiqueta,
  valor,
  cargando,
  atenuado = valor === SIN_ESTIMACION,
}: {
  etiqueta: string
  valor: string
  cargando: boolean
  /** Sin cifra («Menos de 5», «Sin estimación»). */
  atenuado?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground md:sr-only">{etiqueta}</dt>
      <dd className={cn("text-sm cifras", atenuado && "text-muted-foreground")}>
        {cargando ? (
          <>
            <Esqueleto className="h-4 w-16" />
            <span className="sr-only">Calculando…</span>
          </>
        ) : (
          valor
        )}
      </dd>
    </div>
  )
}
