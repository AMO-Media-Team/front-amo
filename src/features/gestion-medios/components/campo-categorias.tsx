"use client"

import { useId } from "react"
import { Controller, useFormContext } from "react-hook-form"

import { Checkbox } from "@/components/ui/checkbox"
import {
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { cn } from "@/lib/utils"

import { opcionesVisibles } from "../categorias"
import { type EntradaRegistrarMedio, LIMITES_MEDIO } from "../schemas"
import type { OpcionCategoria } from "../tipos"

function alternar(
  elegidas: readonly string[],
  id: string,
  marcar: boolean
): string[] {
  if (marcar) return elegidas.includes(id) ? [...elegidas] : [...elegidas, id]
  return elegidas.filter((actual) => actual !== id)
}

function FichaCategoria({
  categoria,
  marcada,
  deshabilitada,
  onCambio,
}: {
  categoria: OpcionCategoria
  marcada: boolean
  deshabilitada: boolean
  onCambio: (marcada: boolean) => void
}) {
  return (
    <label
      className={cn(
        "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border bg-background px-3 text-sm transition-colors select-none hover:bg-muted/60 sm:h-8",
        "has-data-checked:border-primary/40 has-data-checked:bg-primary/10 dark:has-data-checked:bg-primary/15",
        deshabilitada && "cursor-not-allowed opacity-60 hover:bg-background"
      )}
    >
      <Checkbox
        checked={marcada}
        disabled={deshabilitada}
        onCheckedChange={(valor) => onCambio(valor === true)}
      />
      <span>{categoria.nombre}</span>
      {categoria.retirada ? (
        <span className="text-xs font-medium text-warning">
          (ya no disponible)
        </span>
      ) : categoria.archivada ? (
        <span className="text-xs text-muted-foreground">(archivada)</span>
      ) : null}
    </label>
  )
}

/**
 * Categorías temáticas como fichas marcables (son pocas: no hace falta
 * buscador). Al llegar al máximo, las no elegidas se deshabilitan. Una elegida
 * que ya no está entre las opciones sigue a la vista para poder desmarcarla.
 */
export function CampoCategorias({
  opciones,
  deshabilitado,
}: {
  /** `null`: no se pudieron cargar (se pueden agregar después). */
  opciones: readonly OpcionCategoria[] | null
  deshabilitado?: boolean
}) {
  const { control } = useFormContext<EntradaRegistrarMedio>()
  const idAyuda = useId()

  return (
    <Controller
      control={control}
      name="categoriaIds"
      render={({ field, fieldState }) => {
        const elegidas = field.value
        const lleno = elegidas.length >= LIMITES_MEDIO.categoriasMax
        const visibles = opcionesVisibles(opciones ?? [], elegidas)
        return (
          <FieldSet aria-describedby={idAyuda} className="gap-3">
            <FieldLegend variant="label" className="mb-0">
              Categorías temáticas{" "}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
            </FieldLegend>
            <FieldDescription id={idAyuda}>
              {lleno
                ? `Llegaste al máximo de ${LIMITES_MEDIO.categoriasMax}. Desmarca una para elegir otra.`
                : "Los temas de su contenido: ayudan a mostrarle ofertas afines a su audiencia."}
            </FieldDescription>
            {visibles.length === 0 && opciones === null ? (
              <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
                No pudimos cargar las categorías. Puedes registrar el medio y
                agregarlas después desde «Editar datos».
              </p>
            ) : visibles.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
                Aún no hay categorías activas. Se crean en Configuración ›
                Catálogos.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {visibles.map((categoria) => {
                  const marcada = elegidas.includes(categoria.id)
                  return (
                    <FichaCategoria
                      key={categoria.id}
                      categoria={categoria}
                      marcada={marcada}
                      deshabilitada={!!deshabilitado || (lleno && !marcada)}
                      onCambio={(marcar) => {
                        field.onChange(alternar(elegidas, categoria.id, marcar))
                        field.onBlur()
                      }}
                    />
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
