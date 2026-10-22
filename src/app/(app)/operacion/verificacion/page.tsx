import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import {
  accesoColas,
  cargarParametrosVerificacion,
} from "@/features/verificacion/colas"
import { ColaActiva } from "@/features/verificacion/components/cola-activa"
import {
  EsqueletoNavegacionColas,
  NavegacionColas,
} from "@/features/verificacion/components/navegacion-colas"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Verificación" }

/**
 * Colas de verificación del equipo AMO (ADM-001): medios enviados, cuentas
 * sociales, documentos y solicitudes de vinculación, con lo pendiente en
 * cada una. La cola va en la URL (`?cola=…&pagina=…`), que es contrato con
 * los enlaces de las notificaciones (`/ir/[entidad]/[id]`). La BD (RLS)
 * decide qué ve cada rol; aquí no se consulta lo que no puede ver.
 */
export default async function PaginaVerificacion({
  searchParams,
}: PageProps<"/operacion/verificacion">) {
  const usuario = await requerirPermiso([
    "medios.verificar",
    "anunciantes.verificar",
  ])
  const acceso = accesoColas(usuario.permisos)
  const { cola, pagina } = await cargarParametrosVerificacion(searchParams)

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Verificación"
        descripcion="Lo que espera la revisión del equipo AMO: medios que enviaron su perfil, cuentas sociales, documentos y solicitudes para unirse."
      />
      <LimiteErrorTabla recurso="los pendientes de cada cola">
        <Suspense fallback={<EsqueletoNavegacionColas />}>
          <NavegacionColas activa={cola} acceso={acceso} />
        </Suspense>
      </LimiteErrorTabla>
      <ColaActiva cola={cola} pagina={pagina} acceso={acceso} />
    </ContenedorPagina>
  )
}
