"use client"

import { Banknote, CircleAlert } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { useShell } from "@/components/layout/contexto-shell"
import { Button } from "@/components/ui/button"
import { tieneAlgunPermiso } from "@/lib/auth/autorizacion"
import { formatearCOP } from "@/lib/format"
import { exito } from "@/lib/result"
import { cn } from "@/lib/utils"

import { registrarPagoLiquidacion } from "../actions"
import { MENSAJES_PAGOS } from "../errores"
import {
  type DatosPago,
  DialogoRegistrarPago,
  type ResultadoRegistroPago,
} from "./dialogo-registrar-pago"

/**
 * «Registrar pago» de una liquidación aprobada (LIQ-006; contrato de la fase 5).
 * Lo montan la lista de pagos y la ficha de la liquidación.
 */
export interface RegistrarPagoLiquidacionProps {
  liquidacionId: string
  medio: string
  montoNeto: number
  /** Fecha mínima del pago (día de generación de la liquidación, `AAAA-MM-DD`). */
  fechaMinima: string
  /** Documento soporte emitido o factura del medio registrada; si no, el botón explica qué falta. */
  documentoListo: boolean
  /** Lo que muestra el botón: completo en la ficha, compacto en una fila. */
  variante?: "completo" | "fila"
}

/** Texto visible bajo el botón en una fila (el completo va en la descripción accesible). */
const ROTULO_BLOQUEO = "Documento soporte requerido"

/**
 * Botón «Registrar pago» y su diálogo (fecha, referencia y soporte). Sin el
 * permiso `liquidaciones.registrar_pago` no se ofrece. Sin documento soporte
 * ni factura del medio queda deshabilitado pero enfocable, con «Documento
 * soporte requerido: …» como descripción (la BD lo exige igual).
 */
export function RegistrarPagoLiquidacion({
  liquidacionId,
  medio,
  montoNeto,
  fechaMinima,
  documentoListo,
  variante = "completo",
}: RegistrarPagoLiquidacionProps) {
  const { usuario } = useShell()
  const [abierto, setAbierto] = useState(false)
  const idBloqueo = useId()
  if (!tieneAlgunPermiso(usuario, ["liquidaciones.registrar_pago"])) return null

  const enFila = variante === "fila"
  const bloqueado = !documentoListo

  async function registrar(datos: DatosPago): Promise<ResultadoRegistroPago> {
    const resultado = await registrarPagoLiquidacion({
      liquidacionId,
      ...datos,
    })
    if (!resultado.ok) return resultado
    toast.success("Pago registrado", {
      description: `${medio} · ${formatearCOP(montoNeto)}. Le avisamos al medio.`,
    })
    return exito({ aviso: null })
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5",
        enFila ? "items-end" : "items-start"
      )}
    >
      <Button
        type="button"
        variant={enFila ? "outline" : "default"}
        size={enFila ? "sm" : "default"}
        disabled={bloqueado}
        focusableWhenDisabled
        aria-describedby={bloqueado ? idBloqueo : undefined}
        // Enfocable aunque esté deshabilitado: no hay `:disabled` que lo atenúe.
        className="data-disabled:cursor-not-allowed data-disabled:opacity-50"
        onClick={() => setAbierto(true)}
      >
        <Banknote data-icon="inline-start" aria-hidden />
        Registrar pago
        {enFila ? (
          <>
            {" "}
            <span className="sr-only">de {medio}</span>
          </>
        ) : null}
      </Button>
      {bloqueado ? (
        <p
          id={idBloqueo}
          className={cn(
            "flex items-start gap-1.5 text-xs font-medium text-pretty text-warning",
            enFila && "text-right"
          )}
        >
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {enFila ? (
            <>
              <span aria-hidden>{ROTULO_BLOQUEO}</span>
              <span className="sr-only">
                {MENSAJES_PAGOS.documentoRequerido}
              </span>
            </>
          ) : (
            MENSAJES_PAGOS.documentoRequerido
          )}
        </p>
      ) : null}
      {bloqueado ? null : (
        <DialogoRegistrarPago
          abierto={abierto}
          onAbiertoChange={setAbierto}
          liquidacionSoporteId={liquidacionId}
          titulo="Registrar el pago"
          descripcion={
            <>
              <span className="font-medium text-foreground">{medio}</span> ·{" "}
              <span className="cifras">{formatearCOP(montoNeto)}</span>. Al
              registrarlo, la liquidación y sus publicaciones quedan pagadas y
              le avisamos al medio.
            </>
          }
          fechaMinima={fechaMinima}
          registrar={registrar}
        />
      )}
    </div>
  )
}
