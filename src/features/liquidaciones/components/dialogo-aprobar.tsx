"use client"

import {
  BadgeCheck,
  CircleAlert,
  CircleCheck,
  CircleX,
  ShieldAlert,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState, useTransition } from "react"
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

import { aprobarLiquidaciones } from "../actions"
import {
  periodoCompacto,
  resumirAprobacion,
  textoSegSocial,
} from "../presentacion"
import { rutaLiquidacion } from "../rutas"
import type {
  FilaLiquidacion,
  PoliticaSegSocial,
  ResultadoAprobacion,
} from "../tipos"
import { ID_TITULO_VISTA } from "../vistas"

export interface DialogoAprobarProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  /** Las marcadas al abrir (se conservan aunque la tabla se actualice). */
  filas: readonly FilaLiquidacion[]
  politica: PoliticaSegSocial
  /** Tras aprobar (p. ej. limpiar la selección). */
  onAprobadas: () => void
}

/**
 * Aprobación en lote (LIQ-003): confirma lo elegido y muestra el resultado
 * por liquidación, porque la BD puede rechazar algunas (segregación D17,
 * seguridad social con la política BLOQUEAR, un cambio de estado). Al cerrar
 * tras aprobar, el foco va al título de la vista: las filas aprobadas y la
 * barra de selección ya no están. Si se cancela (o falla sin resultados), la
 * selección sigue y el foco vuelve al botón «Aprobar» que abrió el diálogo.
 */
export function DialogoAprobar({
  abierto,
  onAbiertoChange,
  filas,
  politica,
  onAprobadas,
}: DialogoAprobarProps) {
  const [elegidas, setElegidas] = useState<readonly FilaLiquidacion[]>(filas)
  const [resultados, setResultados] = useState<ResultadoAprobacion[] | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const tituloResultado = useRef<HTMLHeadingElement>(null)

  // Al abrir se toma la selección del momento.
  const [abiertoAntes, setAbiertoAntes] = useState(abierto)
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto)
    if (abierto) {
      setElegidas(filas)
      setResultados(null)
      setError(null)
    }
  }

  useEffect(() => {
    if (resultados) tituloResultado.current?.focus()
  }, [resultados])

  const conAlerta = elegidas.filter((fila) => fila.alertaSegSocial).length
  const segSocial = textoSegSocial(politica)

  function cambiarAbierto(valor: boolean) {
    if (pendiente) return
    onAbiertoChange(valor)
  }

  function aprobar() {
    setError(null)
    iniciar(async () => {
      const respuesta = await aprobarLiquidaciones({
        liquidacionIds: elegidas.map((fila) => fila.id),
      })
      if (!respuesta.ok) {
        setError(respuesta.error)
        return
      }
      const resumen = resumirAprobacion(respuesta.datos)
      if (resumen.correctas > 0) toast.success(resumen.texto)
      setResultados(respuesta.datos)
      onAprobadas()
    })
  }

  const porId = new Map(elegidas.map((fila) => [fila.id, fila]))

  return (
    <Dialog open={abierto} onOpenChange={cambiarAbierto}>
      <DialogContent
        showCloseButton={false}
        // `null`: el comportamiento por defecto (volver a quien lo abrió).
        finalFocus={() =>
          resultados ? document.getElementById(ID_TITULO_VISTA) : null
        }
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
      >
        {resultados ? (
          <>
            <DialogHeader>
              <DialogTitle
                ref={tituloResultado}
                tabIndex={-1}
                className="outline-none focus-visible:anillo-foco"
              >
                Resultado de la aprobación
              </DialogTitle>
              <DialogDescription role="status">
                {resumirAprobacion(resultados).texto}
              </DialogDescription>
            </DialogHeader>
            <ul
              aria-label="Resultado por liquidación"
              className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-lg border"
            >
              {resultados.map((resultado) => {
                const fila = porId.get(resultado.liquidacionId)
                const nombre = fila?.medio ?? "Liquidación"
                return (
                  <li
                    key={resultado.liquidacionId}
                    className="flex items-start gap-2.5 px-3 py-2.5 text-sm"
                  >
                    {resultado.ok ? (
                      <CircleCheck
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-success"
                      />
                    ) : (
                      <CircleX
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-destructive"
                      />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <Link
                        href={rutaLiquidacion(resultado.liquidacionId)}
                        className="w-fit font-medium underline-offset-4 hover:underline focus-visible:underline"
                      >
                        {nombre}
                        {fila
                          ? ` · ${periodoCompacto(fila.periodoInicio, fila.periodoFin)}`
                          : ""}
                      </Link>
                      <span className="text-xs text-pretty text-muted-foreground">
                        {resultado.ok ? (
                          "Aprobada"
                        ) : (
                          <>
                            <span className="sr-only">No se aprobó: </span>
                            {resultado.error}
                          </>
                        )}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
            <DialogFooter>
              <DialogClose render={<Button />}>Listo</DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="flex-row items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                <BadgeCheck className="size-5" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <DialogTitle>
                  ¿Aprobar{" "}
                  {contar(elegidas.length, "liquidación", "liquidaciones")}?
                </DialogTitle>
                <DialogDescription>
                  Quedan listas para su documento soporte (o la factura del
                  medio) y el pago. Al aprobar se vuelve a evaluar la seguridad
                  social de cada medio.
                </DialogDescription>
              </div>
            </DialogHeader>
            <ul
              aria-label="Liquidaciones elegidas"
              className="flex max-h-56 flex-col divide-y overflow-y-auto rounded-lg border text-sm"
            >
              {elegidas.map((fila) => (
                <li
                  key={fila.id}
                  className="flex items-baseline justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0 truncate">
                    {fila.medio ?? "Medio no visible"}
                    <span className="text-muted-foreground">
                      {" "}
                      · {periodoCompacto(fila.periodoInicio, fila.periodoFin)}
                    </span>
                  </span>
                  <span className="shrink-0 cifras">
                    {formatearCOP(fila.montoNeto)}
                  </span>
                </li>
              ))}
            </ul>
            {conAlerta > 0 ? (
              <p className="flex items-start gap-2 rounded-lg border border-warning/45 bg-warning/10 px-3 py-2.5 text-sm text-pretty">
                <ShieldAlert
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-warning"
                />
                <span>
                  {contar(conAlerta, "tiene", "tienen")} «Seguridad social
                  pendiente».{" "}
                  {segSocial.bloquea
                    ? "Con la política vigente no se aprobarán hasta que el medio cargue su seguridad social."
                    : "La política vigente solo alerta: se aprueban igual."}
                </span>
              </p>
            ) : null}
            {error ? (
              <Alert variant="destructive" role="alert">
                <CircleAlert aria-hidden />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <DialogClose
                render={<Button variant="outline" disabled={pendiente} />}
              >
                Cancelar
              </DialogClose>
              <Button onClick={aprobar} disabled={pendiente}>
                {pendiente ? (
                  <Spinner aria-label="Aprobando" data-icon="inline-start" />
                ) : null}
                Aprobar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
