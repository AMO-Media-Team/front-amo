"use client"

import { FileX } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"

import { anularBorradorFactura } from "../actions"
import { avisoEstadoFactura } from "../foco"
import { contarAsignaciones } from "../presentacion"

const SUGERENCIAS = [
  "Una asignación entró en disputa o se canceló: hay que generar el borrador de nuevo.",
  "El anunciante pidió facturar por campaña y no consolidado.",
  "Se generó con una fecha de corte equivocada.",
] as const

/**
 * «Anular borrador» con su motivo (queda en la bitácora). Sus asignaciones
 * quedan libres para otro borrador; el foco pasa al aviso del estado.
 */
export function AnularBorrador({
  facturaId,
  anunciante,
  asignaciones,
}: {
  facturaId: string
  anunciante: string
  asignaciones: number
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => setAbierto(true)}
      >
        <FileX data-icon="inline-start" aria-hidden />
        Anular borrador
      </Button>
      <DialogoMotivo
        abierto={abierto}
        onAbiertoChange={setAbierto}
        titulo="¿Anular el borrador?"
        descripcion={`El borrador de ${anunciante} se anula y sus ${contarAsignaciones(asignaciones)} quedan libres para facturarse en otro. Úsalo antes de expedir la factura; después se corrige con una nota crédito.`}
        textoConfirmar="Anular borrador"
        textoCancelar="Volver"
        destructivo
        sugerencias={SUGERENCIAS}
        placeholder="Ej.: se generó con una fecha de corte equivocada."
        focoAlCerrar={avisoEstadoFactura}
        onConfirmar={async (motivo) => {
          const resultado = await anularBorradorFactura({ facturaId, motivo })
          if (resultado.ok) {
            toast.success("Borrador anulado", {
              description:
                "Sus asignaciones quedaron libres para otro borrador.",
            })
          }
          return resultado
        }}
      />
    </>
  )
}
