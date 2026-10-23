import type { Metadata } from "next"
import { Suspense } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { calidadDeCuentas } from "@/features/calidad-medio/calidad"
import { CalidadCuentas } from "@/features/calidad-medio/components/calidad-cuentas"
import { EsqueletoCalidadCuentas } from "@/features/calidad-medio/components/esqueleto-calidad"
import {
  cuentasCalidad,
  parametrosCalidad,
} from "@/features/calidad-medio/queries"
import { EsqueletoCuentas } from "@/features/cuentas-medio/components/esqueleto-cuentas"
import { PanelCuentas } from "@/features/cuentas-medio/components/panel-cuentas"
import { panelCuentas } from "@/features/cuentas-medio/queries"
import { EncabezadoSeccionMiMedio } from "@/features/mi-medio/components/encabezado-seccion"
import { LimiteErrorMiMedio } from "@/features/mi-medio/components/limite-error-mi-medio"
import { SinMedio } from "@/features/mi-medio/components/sin-medio"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Cuentas sociales" }

async function SeccionCuentas({ medioId }: { medioId: string }) {
  const panel = await panelCuentas(medioId)
  const ahora = new Date()
  return <PanelCuentas panel={panel} ahoraServidor={ahora.getTime()} />
}

/** PRC-003/PRC-004: multiplicador de calidad de cada cuenta y su explicación (destino del aviso de cambio). */
async function SeccionCalidad({ medioId }: { medioId: string }) {
  const [cuentas, parametros] = await Promise.all([
    cuentasCalidad(medioId),
    parametrosCalidad(),
  ])
  return (
    <CalidadCuentas
      calidades={calidadDeCuentas(cuentas, parametros)}
      parametros={parametros}
      ahora={new Date()}
    />
  )
}

/**
 * «Mi medio › Cuentas sociales» (MED-005, MED-006): alta y edición de las
 * cuentas del medio y su verificación por código en una historia o por
 * captura de estadísticas, con vigencia y reverificación.
 */
export default async function PaginaCuentasMedio() {
  const usuario = await requerirPermiso("medios.editar_propio")

  return (
    <ContenedorPagina>
      <EncabezadoSeccionMiMedio
        titulo="Cuentas sociales"
        descripcion="Registra las cuentas donde publicas y verifica que son tuyas. Solo las cuentas verificadas reciben ofertas, según sus seguidores."
      />
      {usuario.medioId ? (
        <>
          <LimiteErrorMiMedio recurso="tus cuentas sociales">
            <Suspense fallback={<EsqueletoCuentas />}>
              <SeccionCuentas medioId={usuario.medioId} />
            </Suspense>
          </LimiteErrorMiMedio>
          {/* Su propio límite: si falla la calidad, la gestión de cuentas sigue. */}
          <LimiteErrorMiMedio recurso="la calidad de tus cuentas">
            <Suspense fallback={<EsqueletoCalidadCuentas />}>
              <SeccionCalidad medioId={usuario.medioId} />
            </Suspense>
          </LimiteErrorMiMedio>
        </>
      ) : (
        <SinMedio />
      )}
    </ContenedorPagina>
  )
}
