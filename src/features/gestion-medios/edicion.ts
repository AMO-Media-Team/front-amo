/**
 * Qué columnas de `medios` cambia una edición (módulo puro). Solo se escribe
 * lo que cambió: guardar sin cambios no deja una fila vacía en la bitácora ni
 * mueve `updated_at` (que es la marca del bloqueo optimista).
 */
import type { Tables } from "@/types/database.types"

import type { DatosRegistrarMedio } from "./schemas"

export type ColumnasEditablesMedio = Pick<
  Tables<"medios">,
  "nombre" | "tipo" | "municipio_codigo" | "descripcion_audiencia"
>

/** Datos validados del formulario → columnas de `medios`. */
export function columnasMedio(
  datos: Pick<
    DatosRegistrarMedio,
    "nombre" | "tipo" | "municipioCodigo" | "descripcionAudiencia"
  >
): ColumnasEditablesMedio {
  return {
    nombre: datos.nombre,
    tipo: datos.tipo,
    municipio_codigo: datos.municipioCodigo,
    descripcion_audiencia: datos.descripcionAudiencia,
  }
}

export function cambiosMedio(
  actual: ColumnasEditablesMedio,
  nuevo: ColumnasEditablesMedio
): Partial<ColumnasEditablesMedio> {
  const cambios: Partial<ColumnasEditablesMedio> = {}
  if (nuevo.nombre !== actual.nombre) cambios.nombre = nuevo.nombre
  if (nuevo.tipo !== actual.tipo) cambios.tipo = nuevo.tipo
  if (nuevo.municipio_codigo !== actual.municipio_codigo) {
    cambios.municipio_codigo = nuevo.municipio_codigo
  }
  if (
    (nuevo.descripcion_audiencia ?? null) !==
    (actual.descripcion_audiencia ?? null)
  ) {
    cambios.descripcion_audiencia = nuevo.descripcion_audiencia
  }
  return cambios
}

export function hayCambiosMedio(
  cambios: Partial<ColumnasEditablesMedio>
): boolean {
  return Object.keys(cambios).length > 0
}

/**
 * Lo que se escribe en `medios` al guardar: las columnas que cambiaron o, si
 * solo cambian las categorías, el nombre vigente sin cambios. Esa escritura
 * renueva `updated_at` con la condición del bloqueo optimista, así que un
 * cambio de categorías tampoco pisa el de otra persona; la bitácora omite
 * `updated_at` y no deja una fila vacía.
 */
export function escrituraConVersion(
  actual: ColumnasEditablesMedio,
  cambios: Partial<ColumnasEditablesMedio>
): Partial<ColumnasEditablesMedio> {
  return hayCambiosMedio(cambios) ? cambios : { nombre: actual.nombre }
}
