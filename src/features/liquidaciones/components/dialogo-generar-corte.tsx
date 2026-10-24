"use client"

import {
  CalendarRange,
  CircleAlert,
  CircleCheck,
  CircleX,
  Scissors,
} from "lucide-react"
import Link from "next/link"
import {
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react"
import { toast } from "sonner"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
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

import { generarCorte } from "../actions"
import {
  ETIQUETAS_PERIODICIDAD,
  type ErroresPeriodo,
  erroresDePeriodo,
  erroresPeriodoDeAccion,
  mediosDelCorte,
  type Periodicidad,
  type PeriodoCorte,
} from "../periodo"
import { periodoLargo, resumirCorte } from "../presentacion"
import { rutaLiquidacion, rutaVistaLiquidaciones } from "../rutas"
import { esquemaGenerarCorte } from "../schemas"
import type { MedioCorte, ResultadoCorteMedio } from "../tipos"
import { CamposPeriodo } from "./campos-periodo"

export interface DialogoGenerarCorteProps {
  /** El último periodo cerrado (`periodo_liquidacion_sugerido`). */
  sugerido: PeriodoCorte & { periodicidad: Periodicidad }
  /** Medios con verificadas por liquidar (para decir cuántos entran). */
  medios: readonly MedioCorte[]
  hoy: string
}

/**
 * «Generar corte» (LIQ-001, D79): propone el último periodo cerrado (se puede
 * cambiar; el último día va hasta hoy), dice cuántos medios entran y genera
 * una liquidación en borrador por medio. El resultado se muestra por medio:
 * la liquidación creada, con su enlace, o por qué quedó por fuera.
 */
export function DialogoGenerarCorte({
  sugerido,
  medios,
  hoy,
}: DialogoGenerarCorteProps) {
  const inicial: PeriodoCorte = { inicio: sugerido.inicio, fin: sugerido.fin }
  const [abierto, setAbierto] = useState(false)
  const [periodo, setPeriodo] = useState<PeriodoCorte>(inicial)
  const [errores, setErrores] = useState<ErroresPeriodo>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [resultados, setResultados] = useState<ResultadoCorteMedio[] | null>(
    null
  )
  const [pendiente, iniciar] = useTransition()
  const tituloResultado = useRef<HTMLHeadingElement>(null)
  const id = useId()

  const valido = esquemaGenerarCorte(hoy).safeParse(periodo).success
  const cuenta = valido ? mediosDelCorte(medios, periodo) : null
  const sinMedios = medios.length === 0

  // Con el resultado a la vista, el foco va a su título (el botón ya no está).
  useEffect(() => {
    if (resultados) tituloResultado.current?.focus()
  }, [resultados])

  function cambiarAbierto(valor: boolean) {
    if (pendiente) return
    if (!valor) {
      setPeriodo(inicial)
      setErrores({})
      setErrorGeneral(null)
      setResultados(null)
    }
    setAbierto(valor)
  }

  function generar() {
    const validacion = esquemaGenerarCorte(hoy).safeParse(periodo)
    if (!validacion.success) {
      setErrores(erroresDePeriodo(validacion.error.issues))
      return
    }
    setErrores({})
    setErrorGeneral(null)
    iniciar(async () => {
      const respuesta = await generarCorte(periodo)
      if (!respuesta.ok) {
        const deCampo = erroresPeriodoDeAccion(respuesta.erroresCampo)
        if (deCampo.inicio || deCampo.fin) setErrores(deCampo)
        else setErrorGeneral(respuesta.error)
        return
      }
      const resumen = resumirCorte(respuesta.datos)
      if (resumen.correctas > 0) toast.success(resumen.texto)
      setResultados(respuesta.datos)
    })
  }

  return (
    <>
      {/* Deshabilitado pero enfocable: tras un corte que liquida a todos, el
          foco vuelve aquí al cerrar el resultado y no cae a <body>. */}
      <Button
        type="button"
        disabled={sinMedios}
        focusableWhenDisabled
        aria-describedby={sinMedios ? `${id}-sin-medios` : undefined}
        className="data-disabled:cursor-not-allowed data-disabled:opacity-50"
        onClick={() => setAbierto(true)}
      >
        <Scissors data-icon="inline-start" aria-hidden />
        Generar corte
      </Button>
      {sinMedios ? (
        <span id={`${id}-sin-medios`} className="sr-only">
          No hay medios con asignaciones verificadas por liquidar.
        </span>
      ) : null}

      <Dialog
        open={abierto}
        onOpenChange={cambiarAbierto}
        disablePointerDismissal
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        >
          {resultados ? (
            <ResultadoCorte
              resultados={resultados}
              periodo={periodo}
              titulo={tituloResultado}
            />
          ) : (
            <>
              <DialogHeader className="flex-row items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                  <CalendarRange className="size-5" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <DialogTitle>Generar el corte</DialogTitle>
                  <DialogDescription>
                    Una liquidación en borrador por cada medio con asignaciones
                    verificadas hasta el último día, también las que quedaron
                    fuera de cortes anteriores. Otra persona del equipo las
                    aprueba.
                  </DialogDescription>
                </div>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                <p className="text-sm text-pretty text-muted-foreground">
                  Liquidación {ETIQUETAS_PERIODICIDAD[sugerido.periodicidad]}:
                  te proponemos el último periodo cerrado, del{" "}
                  <span className="text-foreground">
                    {periodoLargo(sugerido.inicio, sugerido.fin)}
                  </span>
                  .
                </p>
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
                <div
                  aria-live="polite"
                  className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm text-pretty"
                >
                  {cuenta === null ? (
                    <span className="text-muted-foreground">
                      Completa el periodo para ver cuántos medios entran.
                    </span>
                  ) : cuenta.entran === 0 ? (
                    "Ningún medio tiene asignaciones verificadas hasta ese día."
                  ) : (
                    <>
                      <span className="font-medium">
                        {contar(cuenta.entran, "medio entra", "medios entran")}
                      </span>{" "}
                      en el corte.
                      {cuenta.conCruce > 0
                        ? ` ${contar(cuenta.conCruce, "ya tiene", "ya tienen")} una liquidación en esas fechas: quedará${cuenta.conCruce === 1 ? "" : "n"} por fuera y te diremos cuál${cuenta.conCruce === 1 ? "" : "es"}.`
                        : ""}
                    </>
                  )}
                </div>
                {errorGeneral ? (
                  <Alert variant="destructive" role="alert">
                    <CircleAlert aria-hidden />
                    <AlertDescription>{errorGeneral}</AlertDescription>
                  </Alert>
                ) : null}
              </div>

              <DialogFooter>
                <DialogClose
                  render={<Button variant="outline" disabled={pendiente} />}
                >
                  Cancelar
                </DialogClose>
                <Button
                  onClick={generar}
                  disabled={pendiente || cuenta?.entran === 0}
                >
                  {pendiente ? (
                    <Spinner aria-label="Generando" data-icon="inline-start" />
                  ) : null}
                  Generar corte
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ResultadoCorte({
  resultados,
  periodo,
  titulo,
}: {
  resultados: readonly ResultadoCorteMedio[]
  periodo: PeriodoCorte
  titulo: RefObject<HTMLHeadingElement | null>
}) {
  const resumen = resumirCorte(resultados)
  return (
    <>
      <DialogHeader>
        <DialogTitle
          ref={titulo}
          tabIndex={-1}
          className="outline-none focus-visible:anillo-foco"
        >
          Corte del {periodoLargo(periodo.inicio, periodo.fin)}
        </DialogTitle>
        <DialogDescription role="status">{resumen.texto}</DialogDescription>
      </DialogHeader>
      {resultados.length > 0 ? (
        <ul
          aria-label="Resultado por medio"
          className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-lg border"
        >
          {resultados.map((resultado) => (
            <li
              key={resultado.medioId}
              className="flex items-start gap-2.5 px-3 py-2.5 text-sm"
            >
              {resultado.liquidacionId ? (
                <>
                  <CircleCheck
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-success"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium">{resultado.medio}</span>
                    <Link
                      href={rutaLiquidacion(resultado.liquidacionId)}
                      className="w-fit text-xs text-primary underline-offset-4 hover:underline focus-visible:underline"
                    >
                      Ver la liquidación de {resultado.medio}
                    </Link>
                  </span>
                </>
              ) : (
                <>
                  <CircleX
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium">{resultado.medio}</span>
                    <span className="text-xs text-pretty text-muted-foreground">
                      <span className="sr-only">No se liquidó: </span>
                      {resultado.error}
                    </span>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cerrar</DialogClose>
        {resumen.correctas > 0 ? (
          <EnlaceBoton href={rutaVistaLiquidaciones("borrador")}>
            Ver por aprobar
          </EnlaceBoton>
        ) : null}
      </DialogFooter>
    </>
  )
}
