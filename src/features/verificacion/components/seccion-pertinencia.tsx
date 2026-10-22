import "server-only"

import type { MedioDetalle } from "@/features/operacion/tipos"

import { pertinenciaDelMedio } from "../queries"
import { PertinenciaMedio } from "./pertinencia-medio"

/** Pestaña «Pertinencia» de la ficha del medio (ADM-006). */
export async function SeccionPertinenciaMedio({
  medio,
  puedeEditar,
}: {
  medio: Pick<MedioDetalle, "id" | "nombre">
  puedeEditar: boolean
}) {
  const filas = await pertinenciaDelMedio(medio.id)
  return (
    <PertinenciaMedio
      medio={{ id: medio.id, nombre: medio.nombre }}
      filas={filas}
      puedeEditar={puedeEditar}
    />
  )
}
