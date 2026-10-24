"use client"

import { Banknote, CircleAlert } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { useShell } from "@/components/layout/contexto-shell"
import { Button } from "@/components/ui/button"
import { tieneAlgunPermiso } from "@/lib/auth/autorizacion"
import { formatearCOP } from "@/lib/format"
import { exito } from "@/lib/result"

import { registrarPagoArchivo } from "../actions"
import { MENSAJES_PAGOS } from "../errores"
import { sumarNeto } from "../preparacion"
import { avisoPagosArchivo, plural } from "../textos"
import type { LiquidacionDeDispersion } from "../tipos"
import {
  type DatosPago,
  DialogoRegistrarPago,
  type ResultadoRegistroPago,
} from "./dialogo-registrar-pago"

/**
 * «Registrar el pago del archivo»: cuando el banco paga todo el archivo de una
 * vez, un solo comprobante para las liquidaciones que siguen por registrar
 * (las que tienen documento soporte o factura). Cada una se registra por
 * separado: si alguna no se puede, se dice cuál y por qué, y las demás quedan
 * pagadas.
 */
export function RegistrarPagoArchivo({
  dispersionId,
  pendientes,
}: {
  dispersionId: string
  /** Las del archivo que siguen aprobadas. */
  pendientes: readonly LiquidacionDeDispersion[]
}) {
  const { usuario } = useShell()
  const [abierto, setAbierto] = useState(false)
  const idBloqueo = useId()
  if (
    pendientes.length === 0 ||
    !tieneAlgunPermiso(usuario, ["liquidaciones.registrar_pago"])
  ) {
    return null
  }

  const incluidas = pendientes.filter((fila) => fila.documentoListo)
  const porFuera = pendientes.length - incluidas.length
  const primera = incluidas[0]
  // La más reciente de las fechas mínimas: vale para todas.
  const fechaMinima = incluidas.reduce(
    (maxima, fila) =>
      fila.fechaMinimaPago > maxima ? fila.fechaMinimaPago : maxima,
    ""
  )
  const total = sumarNeto(incluidas)

  async function registrar(datos: DatosPago): Promise<ResultadoRegistroPago> {
    const resultado = await registrarPagoArchivo({
      dispersionId,
      liquidacionIds: incluidas.map((fila) => fila.id),
      ...datos,
    })
    if (!resultado.ok) return resultado
    const { registradas } = resultado.datos
    if (registradas.length > 0) {
      toast.success(
        registradas.length === 1 ? "Pago registrado" : "Pagos registrados",
        {
          description: `${plural(registradas.length, "liquidación pagada", "liquidaciones pagadas")}. Le avisamos a cada medio.`,
        }
      )
    }
    return exito({ aviso: avisoPagosArchivo(resultado.datos) })
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5 sm:items-end">
      <Button
        type="button"
        variant="outline"
        disabled={!primera}
        focusableWhenDisabled
        aria-describedby={primera ? undefined : idBloqueo}
        className="data-disabled:cursor-not-allowed data-disabled:opacity-50"
        onClick={() => setAbierto(true)}
      >
        <Banknote data-icon="inline-start" aria-hidden />
        Registrar el pago del archivo
      </Button>
      {primera ? null : (
        <p
          id={idBloqueo}
          className="flex items-start gap-1.5 text-xs font-medium text-pretty text-warning"
        >
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {MENSAJES_PAGOS.documentoRequerido}
        </p>
      )}
      {primera ? (
        <DialogoRegistrarPago
          abierto={abierto}
          onAbiertoChange={setAbierto}
          liquidacionSoporteId={primera.id}
          titulo="Registrar el pago del archivo"
          descripcion={`Un solo comprobante para ${plural(incluidas.length, "liquidación", "liquidaciones")} por ${formatearCOP(total)}: cada una queda pagada y le avisamos a su medio.${porFuera > 0 ? ` Quedan por fuera ${plural(porFuera, "liquidación", "liquidaciones")} sin documento soporte ni factura.` : ""}`}
          fechaMinima={fechaMinima}
          textoConfirmar={
            incluidas.length === 1 ? "Registrar pago" : "Registrar pagos"
          }
          registrar={registrar}
        />
      ) : null}
    </div>
  )
}
