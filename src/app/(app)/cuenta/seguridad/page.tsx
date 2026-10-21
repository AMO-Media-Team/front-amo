import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { TransicionPagina } from "@/components/motion/transicion-vista"
import { EsqueletoSeccion } from "@/features/cuenta/components/esqueletos-cuenta"
import { TarjetaActividad } from "@/features/cuenta/components/tarjeta-actividad"
import { TarjetaSesiones } from "@/features/cuenta/components/tarjeta-sesiones"
import {
  TarjetaContrasena,
  TarjetaMfa,
} from "@/features/cuenta/components/tarjetas-acceso"
import { seguridadPropia } from "@/features/cuenta/queries"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Seguridad" }

/**
 * Seguridad de la cuenta: contraseña y verificación en dos pasos llegan con
 * la página; sesiones y actividad se transmiten, cada una con su esqueleto y
 * su propio límite de error.
 */
export default async function PaginaSeguridad() {
  const usuario = await requerirPermiso("cuenta.gestionar")
  const seguridad = await seguridadPropia(usuario)

  return (
    <TransicionPagina>
      <div className="flex flex-col gap-6">
        <TarjetaContrasena seguridad={seguridad} />
        <TarjetaMfa seguridad={seguridad} />

        <LimiteErrorTabla recurso="tus sesiones">
          <Suspense fallback={<EsqueletoSeccion filas={2} conPie />}>
            <TarjetaSesiones usuario={usuario} />
          </Suspense>
        </LimiteErrorTabla>

        <LimiteErrorTabla recurso="tu actividad">
          <Suspense fallback={<EsqueletoSeccion filas={4} />}>
            <TarjetaActividad usuarioId={usuario.id} />
          </Suspense>
        </LimiteErrorTabla>
      </div>
    </TransicionPagina>
  )
}
