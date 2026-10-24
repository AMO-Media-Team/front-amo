"use client"

import { CircleAlert, HandCoins, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { contar } from "@/features/operacion/formato"
import { formatearCOP } from "@/lib/format"

import { generarLiquidacion } from "../actions"
import {
  diaDeInstante,
  type ErroresPeriodo,
  erroresDePeriodo,
  erroresPeriodoDeAccion,
  type PeriodoCorte,
} from "../periodo"
import { diaLargo } from "../presentacion"
import { rutaLiquidacion } from "../rutas"
import { esquemaGenerarLiquidacion } from "../schemas"
import type { FilaPendiente } from "../tipos"
import { CamposPeriodo } from "./campos-periodo"

export interface DialogoLiquidarMedioProps {
  /** El medio elegido en «Por liquidar» (`null`: cerrado). */
  medio: FilaPendiente | null
  sugerido: PeriodoCorte
  hoy: string
  onCerrar: () => void
}

/**
 * «Liquidar» un medio (LIQ-001): el periodo (el último cerrado, editable) y lo
 * que entra. Genera la liquidación en borrador y abre su ficha.
 */
export function DialogoLiquidarMedio({
  medio,
  sugerido,
  hoy,
  onCerrar,
}: DialogoLiquidarMedioProps) {
  return (
    <Dialog
      open={medio !== null}
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar()
      }}
      disablePointerDismissal
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
      >
        {medio ? (
          <Formulario
            key={medio.medioId}
            medio={medio}
            sugerido={sugerido}
            hoy={hoy}
            onCerrar={onCerrar}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Formulario({
  medio,
  sugerido,
  hoy,
  onCerrar,
}: {
  medio: FilaPendiente
  sugerido: PeriodoCorte
  hoy: string
  onCerrar: () => void
}) {
  const router = useRouter()
  const [periodo, setPeriodo] = useState<PeriodoCorte>(sugerido)
  const [errores, setErrores] = useState<ErroresPeriodo>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  const primera = diaDeInstante(medio.primeraVerificada)
  const ultima = diaDeInstante(medio.ultimaVerificada)
  const noEntra = periodo.fin !== "" && primera > periodo.fin
  const parcial = !noEntra && periodo.fin !== "" && ultima > periodo.fin

  function liquidar() {
    const entrada = { medioId: medio.medioId, ...periodo }
    const validacion = esquemaGenerarLiquidacion(hoy).safeParse(entrada)
    if (!validacion.success) {
      setErrores(erroresDePeriodo(validacion.error.issues))
      return
    }
    setErrores({})
    setErrorGeneral(null)
    iniciar(async () => {
      const respuesta = await generarLiquidacion(entrada)
      if (!respuesta.ok) {
        const deCampo = erroresPeriodoDeAccion(respuesta.erroresCampo)
        if (deCampo.inicio || deCampo.fin) setErrores(deCampo)
        else setErrorGeneral(respuesta.error)
        return
      }
      toast.success("Liquidación generada", {
        description: `${medio.medio}: queda en borrador para que otra persona del equipo la apruebe.`,
      })
      onCerrar()
      router.push(rutaLiquidacion(respuesta.datos.liquidacionId))
    })
  }

  return (
    <>
      <DialogHeader className="flex-row items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
          <HandCoins className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle>Liquidar {medio.medio}</DialogTitle>
          <DialogDescription>
            Entran sus asignaciones verificadas hasta el último día del periodo
            ({contar(medio.asignaciones, "asignación", "asignaciones")} por{" "}
            {formatearCOP(medio.montoMedio)} en total, estimado antes de
            retenciones). Queda en borrador para que otra persona la apruebe.
          </DialogDescription>
        </div>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <CamposPeriodo
          valor={periodo}
          onCambiar={(valor) => {
            setPeriodo(valor)
            setErrores({})
            setErrorGeneral(null)
          }}
          errores={errores}
          hoy={hoy}
          deshabilitado={pendiente}
        />
        {noEntra ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-warning/45 bg-warning/10 px-3 py-2.5 text-sm text-pretty"
          >
            <TriangleAlert
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-warning"
            />
            Sus asignaciones se verificaron desde el {diaLargo(primera)}: con
            este periodo no entra ninguna. Liquídalo cuando cierre el periodo en
            curso.
          </p>
        ) : parcial ? (
          <p
            role="status"
            className="text-sm text-pretty text-muted-foreground"
          >
            Las verificadas después del {diaLargo(periodo.fin)} quedan para el
            corte siguiente.
          </p>
        ) : null}
        {errorGeneral ? (
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden />
            <AlertDescription>{errorGeneral}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" disabled={pendiente} />}>
          Cancelar
        </DialogClose>
        <Button onClick={liquidar} disabled={pendiente}>
          {pendiente ? (
            <Spinner aria-label="Liquidando" data-icon="inline-start" />
          ) : null}
          Generar la liquidación
        </Button>
      </DialogFooter>
    </>
  )
}
