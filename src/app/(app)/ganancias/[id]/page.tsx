import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import {
  CabeceraLiquidacionMedio,
  DesgloseLiquidacion,
  DocumentoSoporteLiquidacion,
  PagoLiquidacion,
  PublicacionesLiquidacion,
} from "@/features/ganancias/components/detalle-liquidacion"
import { EsqueletoDesglose } from "@/features/ganancias/components/esqueletos"
import { SeccionFacturaMedio } from "@/features/ganancias/components/factura-medio"
import { AvisoSeguridadSocial } from "@/features/ganancias/components/secciones-ganancias"
import {
  documentoParaMedio,
  puedeCargarFactura,
  textoPeriodo,
} from "@/features/ganancias/presentacion"
import {
  miLiquidacion,
  publicacionesDeLiquidacion,
} from "@/features/ganancias/queries"
import type { LiquidacionMedio } from "@/features/ganancias/tipos"
import { LimiteErrorMiMedio } from "@/features/mi-medio/components/limite-error-mi-medio"
import { hoyBogota } from "@/features/mi-medio/queries"
import { UUID } from "@/features/operacion/components/ficha"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/ganancias/[id]">): Promise<Metadata> {
  await requerirPermiso("liquidaciones.ver_propias")
  const { id } = await params
  const liquidacion = UUID.test(id)
    ? await miLiquidacion(id).catch(() => null)
    : null
  return {
    title: liquidacion
      ? `Liquidación ${textoPeriodo(liquidacion.periodoInicio, liquidacion.periodoFin)}`
      : "Liquidación",
  }
}

/** Desglose y publicaciones: necesitan el detalle por publicación (otra RPC). */
async function DetallePublicaciones({
  liquidacion,
  enlazarCampanas,
}: {
  liquidacion: LiquidacionMedio
  enlazarCampanas: boolean
}) {
  const { lineas, retenciones } = await publicacionesDeLiquidacion(
    liquidacion.id
  )
  return (
    <>
      <DesgloseLiquidacion
        liquidacion={liquidacion}
        retenciones={retenciones}
      />
      <PublicacionesLiquidacion
        lineas={lineas}
        enlazarCampanas={enlazarCampanas}
      />
    </>
  )
}

/** Lo que respalda el pago: el documento soporte o la factura del medio. */
function Respaldo({ liquidacion }: { liquidacion: LiquidacionMedio }) {
  if (liquidacion.requiereDocumentoSoporte) {
    return <DocumentoSoporteLiquidacion liquidacion={liquidacion} />
  }
  return (
    <SeccionFacturaMedio
      liquidacionId={liquidacion.id}
      factura={liquidacion.factura}
      puedeCargar={puedeCargarFactura(liquidacion)}
      periodo={textoPeriodo(liquidacion.periodoInicio, liquidacion.periodoFin)}
    />
  )
}

/**
 * Una liquidación del medio (MED-015): el pago (fecha, referencia y soporte
 * descargable, c1) o cuándo se espera; el documento soporte (número, fecha y
 * CUDS o «Pendiente de transmisión a la DIAN») o, si factura, «Tu factura»
 * con el formulario para cargarla (D83); el desglose con cada retención y las
 * publicaciones liquidadas. Si falta la factura, ese bloque va primero.
 */
export default async function PaginaLiquidacionMedio({
  params,
}: PageProps<"/ganancias/[id]">) {
  const usuario = await requerirPermiso("liquidaciones.ver_propias")
  const { id } = await params
  if (!UUID.test(id) || !usuario.medioId) notFound()

  const liquidacion = await miLiquidacion(id)
  if (!liquidacion) notFound()
  const hoy = hoyBogota()
  const facturaPrimero =
    documentoParaMedio(liquidacion).tipo === "factura-pendiente"

  return (
    <ContenedorPagina>
      <CabeceraLiquidacionMedio liquidacion={liquidacion} hoy={hoy} />
      {liquidacion.alertaSegSocial ? (
        <AvisoSeguridadSocial
          bloquea={liquidacion.bloqueaSegSocial}
          enlaceDocumentos={tieneAlgunPermiso(usuario, [
            "medios.editar_propio",
          ])}
        />
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {facturaPrimero ? <Respaldo liquidacion={liquidacion} /> : null}
          <PagoLiquidacion liquidacion={liquidacion} hoy={hoy} />
          {facturaPrimero ? null : <Respaldo liquidacion={liquidacion} />}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <LimiteErrorMiMedio recurso="el desglose de la liquidación">
            <Suspense fallback={<EsqueletoDesglose />}>
              <DetallePublicaciones
                liquidacion={liquidacion}
                enlazarCampanas={tieneAlgunPermiso(usuario, [
                  "asignaciones.ver_propias",
                ])}
              />
            </Suspense>
          </LimiteErrorMiMedio>
        </div>
      </div>
    </ContenedorPagina>
  )
}
