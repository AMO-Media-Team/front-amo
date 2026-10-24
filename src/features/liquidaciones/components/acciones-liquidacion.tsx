"use client"

import { Ban, BadgeCheck, FileWarning } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useRef, useState } from "react"
import { toast } from "sonner"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import { exito, fallo, type ResultadoAccion } from "@/lib/result"

import { anularLiquidacion, aprobarLiquidaciones } from "../actions"
import { avisoEstadoLiquidacion, seccionDocumentoSoporte } from "../foco"
import { TEXTO_REQUIERE_NOTA_AJUSTE } from "../presentacion"
import { RUTA_LIQUIDACIONES } from "../rutas"

type Dialogo = "aprobar" | "anular" | "nota-ajuste"

const SUGERENCIAS_ANULACION: readonly string[] = [
  "Error en el corte: se generó con un periodo equivocado.",
  "Una asignación incluida entró en disputa y debe salir de la liquidación.",
  "El pago no procede: se corrige y se genera de nuevo.",
]

export interface AccionesLiquidacionProps {
  liquidacionId: string
  /** Para los avisos («Medio X · 1 – 15 oct 2026»). */
  titulo: string
  /** `liquidaciones.aprobar` y la liquidación en borrador. */
  ofreceAprobar: boolean
  /** Por qué no puede aprobarla quien mira (D17); `null` si puede. */
  bloqueoAprobar: string | null
  /** `liquidaciones.aprobar` y la liquidación en borrador o aprobada. */
  ofreceAnular: boolean
  /** «Ya está en el archivo de pagos del …» (advertencia al anular). */
  avisoAnular: string | null
  /** Documento soporte transmitido sin nota de ajuste (D38): no se anula aún. */
  requiereNotaAjuste: boolean
  /** Con la política BLOQUEAR y alerta de seguridad social, la BD puede rechazarla. */
  advertenciaSegSocial: string | null
}

/**
 * «Aprobar» y «Anular» de la ficha (LIQ-003, LIQ-007). Aprobar queda
 * deshabilitado con el porqué si la generó quien mira (D17). Anular pide
 * motivo y advierte si ya salió en un archivo de pagos; si su documento
 * soporte ya se transmitió, primero lleva a registrar la nota de ajuste.
 * Tras decidir, el foco va al aviso del estado, que anuncia el nuevo.
 */
export function AccionesLiquidacion({
  liquidacionId,
  titulo,
  ofreceAprobar,
  bloqueoAprobar,
  ofreceAnular,
  avisoAnular,
  requiereNotaAjuste,
  advertenciaSegSocial,
}: AccionesLiquidacionProps) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const cambio = useRef(false)
  const alDocumento = useRef(false)
  const idBloqueo = useId()

  if (!ofreceAprobar && !ofreceAnular) return null

  function abrir(siguiente: Dialogo) {
    cambio.current = false
    alDocumento.current = false
    setDialogo(siguiente)
  }

  function cerrar(abierto: boolean) {
    if (!abierto) setDialogo(null)
  }

  const focoAlCerrar = () => (cambio.current ? avisoEstadoLiquidacion() : null)

  async function aprobar(): Promise<ResultadoAccion> {
    const respuesta = await aprobarLiquidaciones({
      liquidacionIds: [liquidacionId],
    })
    if (!respuesta.ok) return respuesta
    const [resultado] = respuesta.datos
    if (!resultado?.ok) {
      router.refresh()
      return fallo(resultado?.error ?? "No se pudo aprobar la liquidación.")
    }
    cambio.current = true
    toast.success("Liquidación aprobada", { description: titulo })
    return exito()
  }

  async function anular(motivo: string): Promise<ResultadoAccion> {
    const respuesta = await anularLiquidacion({ liquidacionId, motivo })
    if (respuesta.ok) {
      cambio.current = true
      toast.success("Liquidación anulada", {
        description: `${titulo}: sus asignaciones volvieron a verificadas.`,
        action: {
          label: "Ver por liquidar",
          onClick: () => router.push(RUTA_LIQUIDACIONES),
        },
      })
    }
    return respuesta
  }

  return (
    <div className="flex flex-col gap-1.5 lg:items-end">
      <div className="flex flex-wrap gap-2 lg:justify-end">
        {ofreceAprobar ? (
          <Button
            disabled={bloqueoAprobar !== null}
            aria-describedby={bloqueoAprobar ? idBloqueo : undefined}
            onClick={() => abrir("aprobar")}
          >
            <BadgeCheck data-icon="inline-start" aria-hidden />
            Aprobar
          </Button>
        ) : null}
        {ofreceAnular ? (
          <Button
            variant="outline"
            onClick={() => abrir(requiereNotaAjuste ? "nota-ajuste" : "anular")}
          >
            <Ban data-icon="inline-start" aria-hidden />
            Anular
          </Button>
        ) : null}
      </div>
      {ofreceAprobar && bloqueoAprobar ? (
        <p
          id={idBloqueo}
          className="max-w-xs text-xs text-pretty text-muted-foreground lg:text-right"
        >
          {bloqueoAprobar}
        </p>
      ) : null}

      <DialogoConfirmacion
        abierto={dialogo === "aprobar"}
        onAbiertoChange={cerrar}
        titulo="¿Aprobar la liquidación?"
        descripcion={
          <>
            {titulo}. Queda lista para el documento soporte (o la factura del
            medio) y el pago. Al aprobar se vuelve a evaluar la seguridad social
            del medio.
            {advertenciaSegSocial ? (
              <span className="mt-2 block font-medium text-foreground">
                {advertenciaSegSocial}
              </span>
            ) : null}
          </>
        }
        textoConfirmar="Aprobar"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={aprobar}
      />
      <DialogoMotivo
        abierto={dialogo === "anular"}
        onAbiertoChange={cerrar}
        titulo="¿Anular la liquidación?"
        descripcion={
          <>
            {titulo}. Sus asignaciones vuelven a verificadas y entran en el
            próximo corte; su documento soporte se anula con ella.
            {avisoAnular ? (
              <span className="mt-2 block font-medium text-foreground">
                {avisoAnular}
              </span>
            ) : null}
          </>
        }
        textoConfirmar="Anular"
        destructivo
        sugerencias={SUGERENCIAS_ANULACION}
        placeholder="Ej.: error en el corte, una asignación entró en disputa…"
        focoAlCerrar={focoAlCerrar}
        onConfirmar={anular}
      />
      <AlertDialog open={dialogo === "nota-ajuste"} onOpenChange={cerrar}>
        <AlertDialogContent
          className="sm:max-w-md"
          finalFocus={() =>
            alDocumento.current ? seccionDocumentoSoporte() : null
          }
        >
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-warning/12 text-warning">
              <FileWarning aria-hidden />
            </AlertDialogMedia>
            <AlertDialogTitle>Primero, la nota de ajuste</AlertDialogTitle>
            <AlertDialogDescription>
              {TEXTO_REQUIERE_NOTA_AJUSTE}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cerrar</AlertDialogCancel>
            <Button
              onClick={() => {
                // Al cerrarse, el foco (y la vista) van a la sección del documento.
                alDocumento.current = true
                setDialogo(null)
              }}
            >
              Ir al documento soporte
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
