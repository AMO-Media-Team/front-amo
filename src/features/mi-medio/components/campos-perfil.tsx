"use client"

import { Globe, Lock, Plus, Trash2 } from "lucide-react"
import { useId, useMemo } from "react"
import {
  Controller,
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
} from "react-hook-form"

import { ComboTerritorio } from "@/components/territorio/combo-territorio"
import { SelectorTerritorio } from "@/components/territorio/selector-territorio"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { textoANumero } from "@/features/configuracion/numeros"
import { opcionesVisibles } from "@/features/gestion-medios/categorias"
import {
  LIMITES_MEDIO,
  normalizarParrafos,
} from "@/features/gestion-medios/schemas"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { LIMITES_AUDIENCIA, sumaPorcentajes } from "../audiencia"
import type { EntradaPerfilMedio } from "../schemas"
import type { FilaAudienciaPerfil, OpcionCategoria, OpcionPais } from "../tipos"

// ── Municipio ───────────────────────────────────────────────────────────────

/** Departamento → municipio, solo los habilitados en AMO. */
export function CampoMunicipioMedio({
  deshabilitado,
}: {
  deshabilitado?: boolean
}) {
  const { control } = useFormContext<EntradaPerfilMedio>()
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  return (
    <Controller
      control={control}
      name="municipioCodigo"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <SelectorTerritorio
            modo="municipio"
            id={id}
            valor={field.value}
            invalido={fieldState.invalid}
            deshabilitado={deshabilitado}
            describedBy={fieldState.invalid ? `${idAyuda} ${idError}` : idAyuda}
            onCambio={(municipio) => {
              field.onChange(municipio?.codigo ?? "")
              field.onBlur()
            }}
          />
          <FieldDescription id={idAyuda}>
            Donde está la mayor parte de tu audiencia. Define a qué ofertas
            locales puedes llegar.
          </FieldDescription>
          <FieldError id={idError} errors={[fieldState.error]} />
        </Field>
      )}
    />
  )
}

// ── Categorías ──────────────────────────────────────────────────────────────

function alternar(elegidas: readonly string[], id: string, marcar: boolean) {
  if (marcar) return elegidas.includes(id) ? [...elegidas] : [...elegidas, id]
  return elegidas.filter((actual) => actual !== id)
}

/** Temas del contenido como fichas marcables (son pocos: sin buscador). */
export function CampoCategoriasMedio({
  opciones,
  deshabilitado,
}: {
  opciones: readonly OpcionCategoria[]
  deshabilitado?: boolean
}) {
  const { control } = useFormContext<EntradaPerfilMedio>()
  const idAyuda = useId()
  return (
    <Controller
      control={control}
      name="categoriaIds"
      render={({ field, fieldState }) => {
        const elegidas = field.value
        const lleno = elegidas.length >= LIMITES_MEDIO.categoriasMax
        const visibles = opcionesVisibles(opciones, elegidas)
        return (
          <FieldSet
            aria-describedby={idAyuda}
            data-invalid={fieldState.invalid || undefined}
            className="gap-3"
          >
            <FieldLegend variant="label" className="mb-0">
              Temas de tu contenido
            </FieldLegend>
            <FieldDescription id={idAyuda}>
              {lleno
                ? `Llegaste al máximo de ${LIMITES_MEDIO.categoriasMax}. Desmarca uno para elegir otro.`
                : "Elige los que mejor te describen: te mostramos ofertas afines a tu audiencia."}
            </FieldDescription>
            {visibles.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
                Aún no hay temas disponibles. Podrás elegirlos más adelante.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {visibles.map((categoria) => {
                  const marcada = elegidas.includes(categoria.id)
                  const bloqueada = !!deshabilitado || (lleno && !marcada)
                  return (
                    <label
                      key={categoria.id}
                      className={cn(
                        "inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border bg-background px-3.5 text-sm transition-colors select-none hover:bg-muted/60 sm:h-9",
                        "has-data-checked:border-primary/40 has-data-checked:bg-primary/10 dark:has-data-checked:bg-primary/15",
                        "has-focus-visible:anillo-foco",
                        bloqueada &&
                          "cursor-not-allowed opacity-60 hover:bg-background"
                      )}
                    >
                      <Checkbox
                        checked={marcada}
                        disabled={bloqueada}
                        onCheckedChange={(valor) => {
                          field.onChange(
                            alternar(elegidas, categoria.id, valor === true)
                          )
                          field.onBlur()
                        }}
                      />
                      <span>{categoria.nombre}</span>
                      {categoria.retirada ? (
                        <span className="text-xs font-medium text-warning">
                          (ya no disponible)
                        </span>
                      ) : categoria.archivada ? (
                        <span className="text-xs text-muted-foreground">
                          (ya no se ofrece)
                        </span>
                      ) : null}
                    </label>
                  )
                })}
              </div>
            )}
            <FieldError errors={[fieldState.error]} />
          </FieldSet>
        )
      }}
    />
  )
}

// ── Descripción ─────────────────────────────────────────────────────────────

/** Ayuda con el conteo de lo que se guardaría (avisa cerca del límite). */
export function AyudaDescripcionAudiencia() {
  const { control } = useFormContext<EntradaPerfilMedio>()
  const texto = useWatch({ control, name: "descripcionAudiencia" }) ?? ""
  const usados = normalizarParrafos(texto).length
  const maximo = LIMITES_MEDIO.descripcionMax
  return (
    <span className="flex items-start justify-between gap-3">
      <span>
        Quién te sigue: edades, barrios o municipios, intereses. Lo leen el
        equipo de AMO y los anunciantes.
      </span>
      <span
        className={cn(
          "shrink-0 cifras",
          usados > maximo * 0.9 && "font-medium text-warning",
          usados > maximo && "text-destructive"
        )}
      >
        {formatearNumero(usados)}
        <span aria-hidden>/</span>
        <span className="sr-only"> de </span>
        {formatearNumero(maximo)}
        <span className="sr-only"> caracteres</span>
      </span>
    </span>
  )
}

// ── Origen de la audiencia por país ─────────────────────────────────────────

const SIN_CONSULTA = {
  isPending: false,
  isError: false,
  error: null,
  refetch: () => undefined,
}

const nombresPais = (pais: OpcionPais) => [pais.nombre]

function FilaPais({
  indice,
  opciones,
  ocupados,
  onQuitar,
  deshabilitado,
}: {
  indice: number
  opciones: readonly OpcionPais[]
  /** Países ya elegidos en otras filas o verificados por AMO. */
  ocupados: ReadonlySet<string>
  onQuitar: () => void
  deshabilitado?: boolean
}) {
  const { control, register } = useFormContext<EntradaPerfilMedio>()
  const { errors } = useFormState({ control, name: `audiencia.${indice}` })
  const errorFila = errors.audiencia?.[indice]
  const idPais = idFilaPais(indice)
  const idPorcentaje = `${idPais}-porcentaje`
  const idErrores = `${idPais}-errores`
  const disponibles = useMemo(
    () => ({ ...SIN_CONSULTA, data: opciones }),
    [opciones]
  )
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <Controller
          control={control}
          name={`audiencia.${indice}.paisIso2`}
          render={({ field, fieldState }) => {
            const elegido = opciones.find((p) => p.codigo === field.value)
            return (
              <div className="min-w-0 flex-1">
                <label htmlFor={idPais} className="sr-only">
                  País {indice + 1}
                </label>
                <ComboTerritorio
                  id={idPais}
                  valor={field.value || null}
                  etiquetaValor={elegido?.nombre ?? field.value}
                  placeholder="Elige el país"
                  placeholderBusqueda="Buscar país…"
                  textoVacio="No hay países para mostrar."
                  icono={Globe}
                  consulta={{
                    ...disponibles,
                    data: opciones.filter(
                      (p) => p.codigo === field.value || !ocupados.has(p.codigo)
                    ),
                  }}
                  nombres={nombresPais}
                  contenido={(pais) => pais.nombre}
                  onElegir={(pais) => {
                    field.onChange(pais.codigo)
                    field.onBlur()
                  }}
                  invalido={fieldState.invalid}
                  describedBy={fieldState.invalid ? idErrores : undefined}
                  deshabilitado={deshabilitado}
                />
              </div>
            )
          }}
        />
        <div className="w-28 shrink-0">
          <label htmlFor={idPorcentaje} className="sr-only">
            Porcentaje de la audiencia en el país {indice + 1}
          </label>
          <InputGroup className="h-9">
            <InputGroupInput
              id={idPorcentaje}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              disabled={deshabilitado}
              aria-invalid={Boolean(errorFila?.porcentaje) || undefined}
              aria-describedby={errorFila?.porcentaje ? idErrores : undefined}
              className="text-right cifras"
              {...register(`audiencia.${indice}.porcentaje`)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>%</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onQuitar}
          disabled={deshabilitado}
          aria-label={`Quitar el país ${indice + 1}`}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      <FieldError
        id={idErrores}
        errors={[errorFila?.paisIso2, errorFila?.porcentaje]}
      />
    </li>
  )
}

function idFilaPais(indice: number) {
  return `audiencia-pais-${indice}`
}

/** Suma declarada + verificada, como la calcula la BD (centésimas). */
function useSumaAudiencia(fija: number): number {
  const { control } = useFormContext<EntradaPerfilMedio>()
  const filas = useWatch({ control, name: "audiencia" }) ?? []
  const declaradas = filas
    .map((fila) => textoANumero(fila?.porcentaje ?? ""))
    .filter((valor): valor is number => valor !== null && valor > 0)
  return sumaPorcentajes([fija, ...declaradas])
}

function BarraSuma({ suma }: { suma: number }) {
  const excede = suma > 100
  return (
    <div className="flex flex-col gap-1.5">
      <p
        className={cn(
          "flex items-baseline justify-between gap-3 text-sm",
          excede ? "text-destructive" : "text-muted-foreground"
        )}
        aria-live="polite"
      >
        <span>
          Suma:{" "}
          <span className="font-semibold cifras">
            {formatearNumero(suma, Number.isInteger(suma) ? 0 : 2)} %
          </span>{" "}
          de 100 %
        </span>
        <span className="text-xs">
          {excede
            ? "Baja algún porcentaje."
            : suma < 100
              ? `${formatearNumero(100 - suma, Number.isInteger(100 - suma) ? 0 : 2)} % sin asignar`
              : "Completo"}
        </span>
      </p>
      <span
        aria-hidden
        className="block h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <span
          className={cn(
            "block h-full rounded-full transition-[width] duration-500 ease-suave motion-reduce:transition-none",
            excede ? "bg-destructive" : "bg-primary"
          )}
          style={{ width: `${Math.min(100, suma)}%` }}
        />
      </span>
    </div>
  )
}

/**
 * Origen de la audiencia por país (declarado por el medio): filas país +
 * porcentaje, con la suma a la vista. Lo verificado por AMO se muestra sin
 * editar y cuenta en la suma. No hace falta llegar al 100 %.
 */
export function CampoAudienciaPaises({
  paises,
  verificadas,
  porcentajeFijo,
  deshabilitado,
}: {
  paises: readonly OpcionPais[]
  verificadas: readonly (FilaAudienciaPerfil & { nombre: string })[]
  porcentajeFijo: number
  deshabilitado?: boolean
}) {
  const { control, formState } = useFormContext<EntradaPerfilMedio>()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "audiencia",
  })
  const filas = useWatch({ control, name: "audiencia" }) ?? []
  const suma = useSumaAudiencia(porcentajeFijo)
  const idAyuda = useId()
  const errorSuma =
    formState.errors.audiencia?.root?.message ??
    formState.errors.audiencia?.message
  const lleno =
    fields.length + verificadas.length >= LIMITES_AUDIENCIA.paisesMax

  function ocupadosPara(indice: number): ReadonlySet<string> {
    return new Set([
      ...verificadas.map((fila) => fila.paisIso2),
      ...filas
        .filter((_, i) => i !== indice)
        .map((fila) => fila?.paisIso2)
        .filter((codigo): codigo is string => Boolean(codigo)),
    ])
  }

  function agregar() {
    const sugerido = fields.length === 0 && verificadas.length === 0 ? "CO" : ""
    append({ paisIso2: sugerido, porcentaje: "" }, { shouldFocus: false })
    const indice = fields.length
    requestAnimationFrame(() => {
      const destino = sugerido
        ? `${idFilaPais(indice)}-porcentaje`
        : idFilaPais(indice)
      document.getElementById(destino)?.focus()
    })
  }

  return (
    <FieldSet aria-describedby={idAyuda} className="gap-3">
      <FieldLegend variant="label" className="mb-0">
        De dónde es tu audiencia{" "}
        <span className="font-normal text-muted-foreground">(opcional)</span>
      </FieldLegend>
      <FieldDescription id={idAyuda}>
        El porcentaje aproximado de tus seguidores por país, como lo ves en las
        estadísticas de tus redes. No tiene que sumar 100 %.
      </FieldDescription>

      {verificadas.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {verificadas.map((fila) => (
            <li
              key={fila.paisIso2}
              className="flex items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Lock aria-hidden className="size-3.5 text-muted-foreground" />
                <span className="truncate">{fila.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  verificado por AMO
                </span>
              </span>
              <span className="font-medium cifras">
                {formatearNumero(fila.porcentaje, 2)} %
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {fields.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {fields.map((campo, indice) => (
            <FilaPais
              key={campo.id}
              indice={indice}
              opciones={paises}
              ocupados={ocupadosPara(indice)}
              onQuitar={() => remove(indice)}
              deshabilitado={deshabilitado}
            />
          ))}
        </ul>
      ) : null}

      {fields.length > 0 || verificadas.length > 0 ? (
        <BarraSuma suma={suma} />
      ) : null}
      <FieldError errors={errorSuma ? [{ message: errorSuma }] : []} />

      <Button
        type="button"
        variant="outline"
        onClick={agregar}
        disabled={deshabilitado || lleno}
        className="w-full sm:w-fit"
      >
        <Plus data-icon="inline-start" aria-hidden />
        {fields.length === 0 ? "Agregar un país" : "Agregar otro país"}
      </Button>
      {lleno ? (
        <p className="text-xs text-muted-foreground">
          Llegaste al máximo de {LIMITES_AUDIENCIA.paisesMax} países.
        </p>
      ) : null}
    </FieldSet>
  )
}
