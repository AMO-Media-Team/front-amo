import { History } from "lucide-react"
import type { Metadata, Route } from "next"
import { Suspense } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { ContenidoSeccion } from "@/features/configuracion/components/contenido-seccion"
import { ProveedorConfiguracion } from "@/features/configuracion/components/contexto-configuracion"
import { EncabezadoSeccion } from "@/features/configuracion/components/encabezado-seccion"
import { EsqueletoSeccion } from "@/features/configuracion/components/esqueleto-seccion"
import { LimiteErrorSeccion } from "@/features/configuracion/components/limite-error-seccion"
import { MarcoConfiguracion } from "@/features/configuracion/components/marco-configuracion"
import {
  permisosConfiguracion,
  seccionEditable,
} from "@/features/configuracion/permisos"
import {
  cargarSeccion,
  INFO_SECCIONES,
} from "@/features/configuracion/secciones"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Configuración" }

/** Bitácora filtrada por los cambios de configuración (grupo «Configuración»). */
const RUTA_HISTORIAL = "/administracion/auditoria?grupo=CONFIGURACION" as Route

/**
 * Configuración del sistema. `requerirPermiso` (DAL) antes de cualquier
 * consulta; la sección activa vive en `?seccion=` y solo se piden sus datos.
 * El encabezado y la navegación se pintan de inmediato y el contenido llega
 * en streaming. El `Suspense` no lleva `key`: al cambiar de sección la
 * anterior sigue visible (atenuada por el marco) hasta que llega la nueva.
 */
export default async function PaginaConfiguracion({
  searchParams,
}: PageProps<"/administracion/configuracion">) {
  const usuario = await requerirPermiso("configuracion.ver")
  const { seccion } = await cargarSeccion(searchParams)
  const permisos = permisosConfiguracion(usuario.permisos)

  return (
    <ProveedorConfiguracion permisos={permisos}>
      <ContenedorPagina>
        <EncabezadoPagina
          titulo="Configuración"
          descripcion="Parámetros, tarifas, comisiones y catálogos de la plataforma. Cada cambio se valida en la base de datos y queda en la bitácora."
          acciones={
            permisos.verAuditoria ? (
              <EnlaceBoton variant="outline" href={RUTA_HISTORIAL}>
                <History data-icon="inline-start" aria-hidden />
                Historial de cambios
              </EnlaceBoton>
            ) : null
          }
        />
        <MarcoConfiguracion>
          <EncabezadoSeccion
            seccion={seccion}
            soloLectura={!seccionEditable(seccion, permisos)}
          />
          <Suspense fallback={<EsqueletoSeccion />}>
            <LimiteErrorSeccion
              key={seccion}
              seccion={INFO_SECCIONES[seccion].titulo}
            >
              <ContenidoSeccion
                seccion={seccion}
                contarAceptaciones={tieneAlgunPermiso(usuario, [
                  "usuarios.ver",
                ])}
              />
            </LimiteErrorSeccion>
          </Suspense>
        </MarcoConfiguracion>
      </ContenedorPagina>
    </ProveedorConfiguracion>
  )
}
