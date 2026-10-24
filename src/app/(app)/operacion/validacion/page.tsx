import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import {
  accesoValidacion,
  cargarColaPedida,
  cargarParametrosValidacion,
  colaPorDefecto,
  descripcionValidacion,
} from "@/features/validacion/colas"
import { ColaValidacionActiva } from "@/features/validacion/components/cola-activa"
import {
  EsqueletoNavegacionValidacion,
  NavegacionValidacion,
} from "@/features/validacion/components/navegacion-validacion"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Validación" }

/**
 * Validación del equipo AMO (ADM-007, ADM-008, ADM-009): evidencias de
 * publicación, métricas por corte (las que tienen alerta primero, con su
 * porqué junto a la captura) y asignaciones por verificar, la puerta a la
 * liquidación. La cola va en la URL (`?cola=evidencias|metricas|verificar`,
 * con `pagina` y, en métricas, `alertas`); sin ella se abre la de evidencias,
 * o la de métricas para un rol que solo valida métricas. La BD decide qué ve
 * cada rol; aquí no se consulta lo que no puede ver.
 */
export default async function PaginaValidacion({
  searchParams,
}: PageProps<"/operacion/validacion">) {
  const usuario = await requerirPermiso([
    "evidencias.validar",
    "metricas.validar",
  ])
  const acceso = accesoValidacion(usuario.permisos)
  const [{ pagina, alertas }, { cola: pedida }] = await Promise.all([
    cargarParametrosValidacion(searchParams),
    cargarColaPedida(searchParams),
  ])
  const cola = pedida ?? colaPorDefecto(acceso)

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Validación"
        descripcion={descripcionValidacion(acceso)}
      />
      <LimiteErrorTabla recurso="los pendientes de cada cola">
        <Suspense fallback={<EsqueletoNavegacionValidacion acceso={acceso} />}>
          <NavegacionValidacion activa={cola} acceso={acceso} />
        </Suspense>
      </LimiteErrorTabla>
      <ColaValidacionActiva
        cola={cola}
        pagina={pagina}
        soloAlertas={cola === "metricas" && alertas}
        acceso={acceso}
      />
    </ContenedorPagina>
  )
}
