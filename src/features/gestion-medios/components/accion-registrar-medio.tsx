import "server-only"

import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"

import { categoriasParaRegistro } from "../queries"
import { BotonRegistrarMedio } from "./botones-medio"

/**
 * Botón «Registrar medio» con las categorías ya cargadas. Va dentro de un
 * `Suspense` en el encabezado: la consulta no retrasa el resto de la página.
 */
export async function AccionRegistrarMedio({
  invitarTrasRegistro,
}: {
  invitarTrasRegistro: boolean
}) {
  const categorias = await categoriasParaRegistro()
  return (
    <BotonRegistrarMedio
      categorias={categorias}
      invitarTrasRegistro={invitarTrasRegistro}
    />
  )
}

/** Mientras llegan las categorías: el mismo botón, inactivo. */
export function AccionRegistrarMedioCargando() {
  return (
    <Button disabled aria-busy="true">
      <Plus data-icon="inline-start" aria-hidden />
      Registrar medio
    </Button>
  )
}
