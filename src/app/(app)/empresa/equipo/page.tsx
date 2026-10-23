import type { Metadata } from "next"
import { Suspense } from "react"

import { TransicionPagina } from "@/components/motion/transicion-vista"
import { EsqueletoEquipo } from "@/features/empresa/components/esqueletos"
import { LimiteErrorEmpresa } from "@/features/empresa/components/limite-error-empresa"
import { ListaEquipo } from "@/features/empresa/components/lista-equipo"
import { SinEmpresa } from "@/features/empresa/components/sin-empresa"
import type { RolPropio } from "@/features/empresa/equipo"
import { miembrosEquipo } from "@/features/empresa/queries"
import { requerirTipoRol } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Equipo de la empresa" }

async function SeccionEquipo({
  yoId,
  rolPropio,
}: {
  yoId: string
  rolPropio: RolPropio
}) {
  const miembros = await miembrosEquipo()
  return <ListaEquipo miembros={miembros} yoId={yoId} rolPropio={rolPropio} />
}

/**
 * «Mi empresa › Equipo» (ANU-002): las personas de la empresa, con su rol,
 * estado y último acceso. Comparten las campañas; las cuentas nuevas las crea
 * el equipo AMO. La ve cualquier usuario de la empresa, aunque su rol no edite
 * sus datos (`anunciantes.editar_propio` solo protege Datos y Documentos):
 * `miembros_organizacion()` ya limita la lista a su propia organización.
 */
export default async function PaginaEquipoEmpresa() {
  const usuario = await requerirTipoRol("ANUNCIANTE")
  return (
    <TransicionPagina>
      {usuario.anuncianteId ? (
        <LimiteErrorEmpresa recurso="tu equipo">
          <Suspense fallback={<EsqueletoEquipo />}>
            <SeccionEquipo
              yoId={usuario.id}
              rolPropio={{
                clave: usuario.rol.clave,
                nombre: usuario.rol.nombre,
                color: usuario.rol.color,
              }}
            />
          </Suspense>
        </LimiteErrorEmpresa>
      ) : (
        <SinEmpresa />
      )}
    </TransicionPagina>
  )
}
