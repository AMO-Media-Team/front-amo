"use client"

import { type ReactNode, useState } from "react"

import { evaluarNivel } from "../decision"
import { nivelPropuesto } from "../requisitos"
import type { ExpedienteMedio } from "../tipos"
import { CuentasExpediente } from "./cuentas-expediente"
import { DecisionMedio } from "./decision-medio"
import { DocumentosExpediente } from "./documentos-expediente"

/**
 * Pestaña «Verificación» de la ficha del medio: la decisión y los documentos
 * comparten el nivel que se evalúa; a la derecha, las cuentas, los datos de
 * pago (protegidos) y el perfil declarado, que llegan ya pintados del
 * servidor.
 */
export function ExpedienteVerificacion({
  expediente,
  pago,
  perfil,
}: {
  expediente: ExpedienteMedio
  pago: ReactNode
  perfil: ReactNode
}) {
  const { medio, niveles, documentos, cuentas, hoy } = expediente
  const [valor, setValor] = useState(() =>
    nivelPropuesto(niveles, documentos ?? [], hoy, medio.nivel)
  )
  const nivel = niveles.find((opcion) => opcion.nivel === valor) ?? niveles[0]
  if (!nivel) return null
  const evaluacion = evaluarNivel({
    nivel,
    documentos,
    cuentas,
    estado: medio.estado,
    hoy,
  })

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-3">
        <DecisionMedio
          expediente={expediente}
          nivel={nivel}
          onNivel={setValor}
          evaluacion={evaluacion}
        />
        <DocumentosExpediente expediente={expediente} nivel={nivel} />
      </div>
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
        <CuentasExpediente expediente={expediente} />
        {pago}
        {perfil}
      </div>
    </div>
  )
}
