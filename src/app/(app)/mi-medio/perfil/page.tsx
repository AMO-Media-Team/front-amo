import type { Metadata } from "next"
import { Suspense } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoSeccionMiMedio } from "@/features/mi-medio/components/encabezado-seccion"
import { EsqueletoFormulario } from "@/features/mi-medio/components/esqueletos"
import { FormularioPerfilMedio } from "@/features/mi-medio/components/formulario-perfil"
import { LimiteErrorMiMedio } from "@/features/mi-medio/components/limite-error-mi-medio"
import { SinMedio } from "@/features/mi-medio/components/sin-medio"
import { perfilEditable } from "@/features/mi-medio/queries"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Perfil del medio" }

async function SeccionPerfil({ medioId }: { medioId: string }) {
  const perfil = await perfilEditable(medioId)
  if (!perfil) return <SinMedio />
  // La versión del registro como `key`: al guardar (o al cargar lo vigente)
  // el formulario se rehace con lo que quedó en la BD.
  return (
    <FormularioPerfilMedio key={perfil.medio.actualizadoAt} perfil={perfil} />
  )
}

/**
 * Perfil del medio (MED-002): nombre, tipo, municipio, temas, descripción y
 * origen de la audiencia. Lo escribe el propio medio con su sesión (RLS).
 */
export default async function PaginaPerfilMedio() {
  const usuario = await requerirPermiso("medios.editar_propio")
  return (
    <ContenedorPagina ancho="estrecho">
      <EncabezadoSeccionMiMedio
        titulo="Perfil del medio"
        descripcion="Lo que ven el equipo de AMO y las marcas: quién eres, de dónde eres y a quién le llega tu contenido."
      />
      {usuario.medioId ? (
        <LimiteErrorMiMedio recurso="tu perfil">
          <Suspense
            fallback={
              <EsqueletoFormulario
                secciones={3}
                etiqueta="Cargando tu perfil…"
              />
            }
          >
            <SeccionPerfil medioId={usuario.medioId} />
          </Suspense>
        </LimiteErrorMiMedio>
      ) : (
        <SinMedio />
      )}
    </ContenedorPagina>
  )
}
