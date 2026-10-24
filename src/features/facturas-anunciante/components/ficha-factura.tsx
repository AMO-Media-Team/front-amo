import "server-only"

import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { Diferida } from "@/features/operacion/components/ficha"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { serializarFecha } from "@/lib/fechas"

import { agruparConceptos } from "../calculos"
import {
  conceptosDeFactura,
  notasCreditoDeFactura,
  obtenerFacturaAnunciante,
  pagosDeFactura,
} from "../queries"
import { CabeceraFactura } from "./cabecera-factura"
import { ConceptosFactura } from "./conceptos-factura"
import { DatosFactura } from "./datos-factura"
import { EsqueletoConceptos } from "./esqueletos"
import { NotasCreditoFactura } from "./notas-credito-factura"
import { PagosFactura } from "./pagos-factura"
import { TotalesFactura } from "./totales-factura"
import { SinPermisoConceptos } from "./sin-permiso-conceptos"

async function SeccionConceptos({
  facturaId,
  mandato,
  anulada,
  pagada,
  verCampanas,
}: {
  facturaId: string
  mandato: boolean
  anulada: boolean
  pagada: boolean
  verCampanas: boolean
}) {
  const conceptos = await conceptosDeFactura(facturaId)
  return (
    <ConceptosFactura
      grupos={agruparConceptos(conceptos)}
      mandato={mandato}
      anulada={anulada}
      pagada={pagada}
      verSeguimiento
      verCampanas={verCampanas}
    />
  )
}

/**
 * Ficha de una factura expedida de la empresa (ANU-013): cabecera con estado,
 * plazo y PDF; totales (subtotal, IVA, ingreso para terceros, total, pagado,
 * notas crédito y saldo) y datos con el CUFE; pagos con sus retenciones y
 * soporte; notas crédito con su PDF; y los conceptos por campaña, que llegan
 * en streaming. Una factura ajena, un borrador o un id inexistente responden
 * 404 (la RLS no los deja ver).
 */
export async function FichaFactura({
  usuario,
  anuncianteId,
  facturaId,
}: {
  usuario: UsuarioSesion
  anuncianteId: string
  facturaId: string
}) {
  const hoy = serializarFecha(new Date())
  const [factura, pagos, notas] = await Promise.all([
    obtenerFacturaAnunciante(anuncianteId, facturaId, hoy),
    pagosDeFactura(facturaId),
    notasCreditoDeFactura(facturaId),
  ])
  if (!factura) notFound()

  const retenciones = pagos.reduce((total, pago) => total + pago.retenciones, 0)
  const verCampanas = tieneAlgunPermiso(usuario, ["campanas.gestionar_propias"])
  const verConceptos = tieneAlgunPermiso(usuario, ["asignaciones.ver_propias"])

  return (
    <ContenedorPagina>
      <CabeceraFactura
        factura={factura}
        notaQueAnula={notas.find((nota) => nota.anulaFactura) ?? null}
        verCampanas={verCampanas}
      />

      <div className="grid gap-4 lg:grid-cols-5 lg:items-start">
        <TotalesFactura
          factura={factura}
          retenciones={retenciones}
          className="lg:col-span-3"
        />
        <DatosFactura factura={factura} className="lg:col-span-2" />
      </div>

      <PagosFactura
        pagos={pagos}
        conSaldo={factura.saldo > 0 && factura.estado !== "ANULADA"}
      />
      <NotasCreditoFactura notas={notas} />

      {verConceptos ? (
        <Diferida
          recurso="los conceptos de la factura"
          respaldo={<EsqueletoConceptos />}
        >
          <SeccionConceptos
            facturaId={factura.id}
            mandato={factura.esquema === "MANDATO"}
            anulada={factura.estado === "ANULADA"}
            pagada={factura.estado === "PAGADA"}
            verCampanas={verCampanas}
          />
        </Diferida>
      ) : (
        <SinPermisoConceptos />
      )}
    </ContenedorPagina>
  )
}
