import "server-only"

import type { AnuncianteDetalle } from "@/features/operacion/tipos"

import type { AccionDecision } from "../decision"
import { expedienteAnunciante } from "../queries"
import { DatosEmpresa } from "./datos-empresa"
import { DecisionAnunciante } from "./decision-anunciante"
import { DocumentosExpediente } from "./documentos-expediente"

/**
 * Pestaña «Verificación» de la ficha del anunciante (ADM-003): decisión,
 * documentos con su visor firmado y los datos registrados para compararlos.
 * Quien la ve tiene `anunciantes.verificar` (la RLS de los documentos lo
 * exige); cargar por cuenta de la empresa exige además `anunciantes.editar`.
 */
export async function SeccionVerificacionAnunciante({
  anunciante,
  acciones,
  puedeCargar,
}: {
  anunciante: AnuncianteDetalle
  acciones: readonly AccionDecision[]
  puedeCargar: boolean
}) {
  const expediente = await expedienteAnunciante(anunciante)
  const empresa = {
    nombreComercial: anunciante.nombreComercial,
    razonSocial: anunciante.razonSocial,
    identificacion: anunciante.identificacion,
    colombiana: anunciante.paisIso2 === "CO",
  }
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-3">
        <DecisionAnunciante expediente={expediente} acciones={acciones} />
        <DocumentosExpediente
          expediente={expediente}
          empresa={empresa}
          puedeCargar={puedeCargar}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
        <DatosEmpresa anunciante={expediente.anunciante} />
      </div>
    </div>
  )
}
