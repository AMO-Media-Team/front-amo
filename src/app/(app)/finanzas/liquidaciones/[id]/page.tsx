import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import {
  documentoSoporteDeLiquidacion,
  numeracionDocumentoSoporte,
} from "@/features/documento-soporte/queries"
import { FichaLiquidacion } from "@/features/liquidaciones/components/ficha-liquidacion"
import { periodoCompacto } from "@/features/liquidaciones/presentacion"
import {
  obtenerLiquidacion,
  politicaSegSocial,
} from "@/features/liquidaciones/queries"
import { accesoLiquidaciones } from "@/features/liquidaciones/vistas"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso } from "@/lib/auth/dal"

interface PropsFicha {
  params: Promise<{ id: string }>
}

export async function generateMetadata({
  params,
}: PropsFicha): Promise<Metadata> {
  const usuario = await requerirPermiso("liquidaciones.ver")
  const { id } = await params
  const liquidacion = UUID.test(id)
    ? await obtenerLiquidacion(id, usuario.id)
    : null
  if (!liquidacion) return { title: "Liquidación" }
  const periodo = periodoCompacto(
    liquidacion.periodoInicio,
    liquidacion.periodoFin
  )
  return {
    title: liquidacion.medio
      ? `Liquidación · ${liquidacion.medio} · ${periodo}`
      : `Liquidación · ${periodo}`,
  }
}

/**
 * Ficha de una liquidación (LIQ-002, LIQ-003, LIQ-004, LIQ-007): montos con
 * cada retención, seguridad social, documento soporte (si el medio no
 * factura) o factura del medio, pago y asignaciones; «Aprobar» (quien la
 * generó no puede, D17) y «Anular» con motivo. La BD vuelve a comprobarlo
 * todo.
 */
export default async function PaginaLiquidacion({ params }: PropsFicha) {
  const usuario = await requerirPermiso("liquidaciones.ver")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const liquidacion = await obtenerLiquidacion(id, usuario.id)
  if (!liquidacion) notFound()

  const [politica, documentoSoporte, numeracion] = await Promise.all([
    politicaSegSocial(),
    liquidacion.requiereDocumentoSoporte
      ? documentoSoporteDeLiquidacion(id)
      : null,
    liquidacion.requiereDocumentoSoporte
      ? numeracionDocumentoSoporte()
      : ("PLATAFORMA" as const),
  ])

  return (
    <ContenedorPagina>
      <FichaLiquidacion
        liquidacion={liquidacion}
        acceso={accesoLiquidaciones(usuario)}
        politica={politica}
        documentoSoporte={documentoSoporte}
        numeracion={numeracion}
      />
    </ContenedorPagina>
  )
}
