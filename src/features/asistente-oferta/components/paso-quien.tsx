"use client"

import { RotateCw, UsersRound } from "lucide-react"
import { useId } from "react"
import { Controller, useFormContext, useWatch } from "react-hook-form"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { SelectorTerritorio } from "@/components/territorio/selector-territorio"
import { CampoCifra } from "@/features/configuracion/components/campos"
import { textoANumero } from "@/features/configuracion/numeros"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  ESCALON_SEGUIDORES_ESTIMACION,
  parametrosEstimacion,
  resumenElegibles,
  seguidoresEfectivos,
  seguidoresParaEstimar,
  textoElegibles,
} from "../estimador"
import { nombreFormato } from "../formatos"
import type { ValoresOferta } from "../schemas"
import type {
  CategoriaAsistente,
  FormatoAsistente,
  FranjaAsistente,
} from "../tipos"
import { BuscadorExclusiones } from "./buscador-exclusiones"
import { useEstimacion } from "./consultas"

export interface PropsPasoQuien {
  categorias: readonly CategoriaAsistente[]
  formatos: readonly FormatoAsistente[]
  franjas: readonly FranjaAsistente[]
  umbralSeguidores: number
  /** Medios por franja por debajo de los cuales el estimador no da cifras. */
  estimadorMinimo: number
}

function alternar(
  elegidas: readonly string[],
  id: string,
  marcar: boolean
): string[] {
  if (marcar) return elegidas.includes(id) ? [...elegidas] : [...elegidas, id]
  return elegidas.filter((actual) => actual !== id)
}

/**
 * Paso 2 · A quién le llega (ANU-005): zonas, categorías, mínimo de
 * seguidores (nunca por debajo del umbral de AMO) y exclusiones por nombre.
 * Cuántos medios cumplen la segmentación se recalcula mientras se ajusta,
 * sin dejar conocer a un medio: con pocos medios en una franja no se dice
 * cuántos son, las exclusiones de pocos medios no cambian la estimación y el
 * mínimo de seguidores se aproxima a múltiplos de 5.000 para estimar.
 */
export function PasoQuien({
  categorias,
  formatos,
  franjas,
  umbralSeguidores,
  estimadorMinimo,
}: PropsPasoQuien) {
  const { control } = useFormContext<ValoresOferta>()
  const idZonas = useId()
  const idCategorias = useId()
  const idExclusiones = useId()

  return (
    <div className="flex flex-col gap-7">
      <Controller
        control={control}
        name="quien.segmentacion"
        render={({ field, fieldState }) => (
          <FieldSet
            aria-describedby={`${idZonas}-ayuda`}
            data-invalid={fieldState.invalid || undefined}
            className="gap-2"
          >
            <FieldLegend variant="label" className="mb-0">
              Zonas
            </FieldLegend>
            <FieldDescription id={`${idZonas}-ayuda`}>
              Departamentos completos o municipios sueltos donde está el medio.
              Sin elegir, la oferta llega a todo el país.
            </FieldDescription>
            <SelectorTerritorio
              modo="segmentacion"
              id={`${idZonas}-agregar`}
              valor={field.value}
              onCambio={(valor) => {
                field.onChange({
                  departamentos: [...valor.departamentos],
                  municipios: [...valor.municipios],
                })
                field.onBlur()
              }}
              invalido={fieldState.invalid}
              describedBy={fieldState.invalid ? `${idZonas}-error` : undefined}
            />
            <FieldError id={`${idZonas}-error`} errors={[fieldState.error]} />
          </FieldSet>
        )}
      />

      <Controller
        control={control}
        name="quien.categorias"
        render={({ field, fieldState }) => (
          <FieldSet
            aria-describedby={`${idCategorias}-ayuda`}
            data-invalid={fieldState.invalid || undefined}
            className="gap-2"
          >
            <FieldLegend variant="label" className="mb-0">
              Categorías de medio{" "}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
            </FieldLegend>
            <FieldDescription id={`${idCategorias}-ayuda`}>
              Los temas de su contenido. Sin elegir, llega a medios de todas las
              categorías.
            </FieldDescription>
            {categorias.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
                Aún no hay categorías disponibles: la oferta llegará a medios de
                todas.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categorias.map((categoria) => (
                  <label
                    key={categoria.id}
                    className={cn(
                      "inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border bg-background px-3.5 text-sm transition-colors select-none hover:bg-muted/60 sm:h-9",
                      "has-data-checked:border-primary/40 has-data-checked:bg-primary/10 dark:has-data-checked:bg-primary/15",
                      "has-focus-visible:anillo-foco"
                    )}
                  >
                    <Checkbox
                      checked={field.value.includes(categoria.id)}
                      aria-invalid={fieldState.invalid || undefined}
                      aria-describedby={
                        fieldState.invalid ? `${idCategorias}-error` : undefined
                      }
                      onCheckedChange={(valor) => {
                        field.onChange(
                          alternar(field.value, categoria.id, valor === true)
                        )
                        field.onBlur()
                      }}
                    />
                    <span>{categoria.nombre}</span>
                  </label>
                ))}
              </div>
            )}
            <FieldError
              id={`${idCategorias}-error`}
              errors={[fieldState.error]}
            />
          </FieldSet>
        )}
      />

      <CampoSeguidores umbral={umbralSeguidores} />

      <Controller
        control={control}
        name="quien.mediosExcluidos"
        render={({ field, fieldState }) => (
          <FieldSet
            aria-describedby={`${idExclusiones}-ayuda`}
            data-invalid={fieldState.invalid || undefined}
            className="gap-2"
          >
            <FieldLegend variant="label" className="mb-0">
              Medios excluidos{" "}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
            </FieldLegend>
            <FieldDescription id={`${idExclusiones}-ayuda`}>
              Si no quieres que un medio en particular tome esta oferta, búscalo
              por su nombre público y exclúyelo. La oferta no le llegará, pero
              si excluyes menos de {formatearNumero(estimadorMinimo)} medios de
              una franja, la estimación no cambia: así nadie deduce las cifras
              de un medio.
            </FieldDescription>
            <BuscadorExclusiones
              valor={field.value}
              onCambio={(valor) => {
                field.onChange(valor)
                field.onBlur()
              }}
              describedBy={
                fieldState.invalid ? `${idExclusiones}-error` : undefined
              }
            />
            <FieldError
              id={`${idExclusiones}-error`}
              errors={[fieldState.error]}
            />
          </FieldSet>
        )}
      />

      <ResumenElegibles
        formatos={formatos}
        franjas={franjas}
        estimadorMinimo={estimadorMinimo}
      />
    </div>
  )
}

/** Mínimo de seguidores con el mínimo efectivo que aplicará la BD. */
function CampoSeguidores({ umbral }: { umbral: number }) {
  const { control } = useFormContext<ValoresOferta>()
  const texto = useWatch({ control, name: "quien.seguidoresMinimos" })
  const minimo = textoANumero(texto ?? "")
  const efectivo = seguidoresEfectivos(
    minimo !== null && minimo >= 0 ? Math.trunc(minimo) : null,
    umbral
  )
  const porDebajo = minimo !== null && minimo < umbral
  // El estimador usa el mínimo aproximado hacia abajo a múltiplos de 5.000.
  const paraEstimar = seguidoresParaEstimar(efectivo, umbral)
  return (
    <div className="flex flex-col gap-2">
      <CampoCifra
        nombre="quien.seguidoresMinimos"
        etiqueta="Mínimo de seguidores"
        opcional
        sufijo="seguidores"
        placeholder={formatearNumero(umbral)}
        className="max-w-sm"
        descripcion={`Nunca por debajo de ${formatearNumero(umbral)}, el mínimo de AMO para trabajar con un medio. Para estimar se aproxima hacia abajo a múltiplos de ${formatearNumero(ESCALON_SEGUIDORES_ESTIMACION)}.`}
      />
      <p
        aria-live="polite"
        className={cn(
          "flex items-center gap-1.5 text-sm",
          porDebajo ? "text-warning" : "text-muted-foreground"
        )}
      >
        <UsersRound aria-hidden className="size-4" />
        <span>
          <strong className="font-semibold text-foreground">
            Mínimo efectivo: {formatearNumero(efectivo)} seguidores
          </strong>
          {porDebajo ? " (se aplica el mínimo de AMO)." : null}
        </span>
      </p>
      {paraEstimar !== efectivo ? (
        <p className="text-xs text-muted-foreground">
          Para estimar se usa {formatearNumero(paraEstimar)} (el mínimo se
          aproxima a múltiplos de{" "}
          {formatearNumero(ESCALON_SEGUIDORES_ESTIMACION)}); la oferta aplica tu
          cifra exacta.
        </p>
      ) : null}
    </div>
  )
}

/** Medios que hoy cumplen la segmentación, por formato elegido. */
function ResumenElegibles({
  formatos,
  franjas,
  estimadorMinimo,
}: {
  formatos: readonly FormatoAsistente[]
  franjas: readonly FranjaAsistente[]
  estimadorMinimo: number
}) {
  const { control } = useFormContext<ValoresOferta>()
  const formatoIds = useWatch({ control, name: "que.formatoIds" })
  const elegidos = formatoIds
    .map((formatoId) => formatos.find((f) => f.id === formatoId))
    .filter((formato) => formato !== undefined)
  if (elegidos.length === 0 || franjas.length === 0) return null
  return (
    <section
      aria-labelledby="asistente-elegibles"
      className="flex flex-col gap-3 rounded-xl border bg-muted/25 p-4"
    >
      <div className="flex flex-col gap-0.5">
        <h3 id="asistente-elegibles" className="text-sm font-semibold">
          Medios que cumplen tu segmentación
        </h3>
        <p className="text-xs text-muted-foreground">
          Medios verificados que hoy podrían tomar la oferta. No mostramos
          nombres ni cifras de medios individuales: si una franja tiene menos de{" "}
          {formatearNumero(estimadorMinimo)}, no decimos cuántos son.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {elegidos.map((formato) => (
          <ConteoFormato
            key={formato.id}
            formato={formato}
            franjas={franjas}
            estimadorMinimo={estimadorMinimo}
          />
        ))}
      </ul>
    </section>
  )
}

function ConteoFormato({
  formato,
  franjas,
  estimadorMinimo,
}: {
  formato: FormatoAsistente
  franjas: readonly FranjaAsistente[]
  estimadorMinimo: number
}) {
  const { control } = useFormContext<ValoresOferta>()
  const [que, quien, cuando] = useWatch({
    control,
    name: ["que", "quien", "cuando"],
  })
  const consulta = useEstimacion(
    parametrosEstimacion({ que, quien, cuando }, formato.id, franjas)
  )
  const resumen = consulta.data ? resumenElegibles(consulta.data) : null
  return (
    <li className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
      <span className="font-medium">{nombreFormato(formato)}</span>
      <span aria-live="polite" className="flex items-center gap-2">
        {consulta.isPending ? (
          <>
            <Esqueleto className="h-4 w-24" />
            <span className="sr-only">Calculando…</span>
          </>
        ) : consulta.isError ? (
          <>
            <span className="text-destructive">{consulta.error.message}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void consulta.refetch()}
            >
              <RotateCw data-icon="inline-start" aria-hidden />
              Reintentar
            </Button>
          </>
        ) : (
          <span
            className={cn(
              "cifras",
              // Ninguna franja llega al mínimo: pueden ser muy pocos o ninguno.
              !resumen || resumen.conocidos === 0
                ? "font-semibold text-warning"
                : "text-foreground"
            )}
          >
            {textoElegibles(
              resumen ?? { conocidos: 0, pocos: 0 },
              estimadorMinimo
            )}
            {consulta.isFetching ? (
              <span className="text-muted-foreground"> · actualizando…</span>
            ) : null}
          </span>
        )}
      </span>
    </li>
  )
}
