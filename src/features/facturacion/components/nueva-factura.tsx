"use client"

import { FilePlus, Inbox, RotateCcw } from "lucide-react"
import { useRouter } from "next/navigation"
import { type FormEvent, useId, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { parsearFecha } from "@/lib/fechas"
import { formatearCOP } from "@/lib/format"
import { desdeErrorZod } from "@/lib/result"
import { cn } from "@/lib/utils"

import { consultarPendientesFacturacion, generarFactura } from "../actions"
import { describir } from "../errores-formulario"
import {
  contarAsignaciones,
  formatearDia,
  seleccionPorFacturar,
} from "../presentacion"
import { rutaFactura } from "../rutas"
import { esquemaGenerarFactura, hoyEnBogota } from "../schemas"
import type { GrupoPorFacturar } from "../tipos"
import { DialogoFormulario } from "./dialogo-formulario"

/** Valor del grupo de alcance para la factura consolidada. */
const CONSOLIDADA = "consolidada"

type Campo = "anuncianteId" | "campanaId" | "desde" | "hasta"

type Carga =
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "lista"; grupos: GrupoPorFacturar[] }

const CLASE_OPCION =
  "flex cursor-pointer items-start gap-3 rounded-xl border bg-background/60 p-3 transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/6 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20"

function erroresDe(
  erroresCampo: Readonly<Record<string, string[]>> | undefined
): Partial<Record<Campo, string>> {
  const campos: readonly Campo[] = [
    "anuncianteId",
    "campanaId",
    "desde",
    "hasta",
  ]
  return Object.fromEntries(
    campos.flatMap((campo) => {
      const mensaje = erroresCampo?.[campo]?.[0]
      return mensaje ? [[campo, mensaje]] : []
    })
  )
}

/**
 * «Nueva factura» (LIQ-008): lo verificado sin facturar agrupado por
 * anunciante y campaña; se elige el anunciante, si va consolidada o por una
 * campaña y la fecha de corte (no futura; entra todo lo verificado hasta ese
 * día, también lo anterior). Genera el borrador y lleva a su ficha.
 */
export function NuevaFactura() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [carga, setCarga] = useState<Carga>({ tipo: "cargando" })
  const [anuncianteId, setAnuncianteId] = useState<string | null>(null)
  const [alcance, setAlcance] = useState<string>(CONSOLIDADA)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState(hoyEnBogota())
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [consultando, iniciarConsulta] = useTransition()
  const [pendiente, iniciar] = useTransition()
  const consulta = useRef(0)
  const id = useId()
  const idFormulario = `${id}-formulario`

  const grupos = carga.tipo === "lista" ? carga.grupos : []
  const grupo = grupos.find((g) => g.anuncianteId === anuncianteId) ?? null
  const campanaId = alcance === CONSOLIDADA ? null : alcance
  const seleccion = grupo ? seleccionPorFacturar(grupo, campanaId) : null

  /** El anunciante elegido, para decidir al llegar una consulta nueva. */
  const elegido = useRef<string | null>(null)

  function aplicarGrupos(nuevos: GrupoPorFacturar[]) {
    setCarga({ tipo: "lista", grupos: nuevos })
    const actual = nuevos.find((g) => g.anuncianteId === elegido.current)
    if (actual) return
    // Un solo anunciante queda elegido; si el elegido ya no está, se suelta.
    if (nuevos.length === 1) {
      elegirAnunciante(nuevos[0])
    } else if (elegido.current !== null) {
      elegido.current = null
      setAnuncianteId(null)
      setAlcance(CONSOLIDADA)
    }
  }

  function consultar(corte: string | null) {
    const numero = ++consulta.current
    iniciarConsulta(async () => {
      const resultado = await consultarPendientesFacturacion({ hasta: corte })
      if (numero !== consulta.current) return
      if (resultado.ok) aplicarGrupos(resultado.datos)
      else setCarga({ tipo: "error", mensaje: resultado.error })
    })
  }

  function abrir() {
    setAbierto(true)
    consultar(null)
  }

  function reiniciar() {
    consulta.current += 1
    elegido.current = null
    setCarga({ tipo: "cargando" })
    setAnuncianteId(null)
    setAlcance(CONSOLIDADA)
    setDesde("")
    setHasta(hoyEnBogota())
    setErrores({})
    setErrorGeneral(null)
  }

  function cambiarAbierto(valor: boolean) {
    if (!valor) reiniciar()
    setAbierto(valor)
  }

  function elegirAnunciante(opcion: GrupoPorFacturar) {
    elegido.current = opcion.anuncianteId
    setAnuncianteId(opcion.anuncianteId)
    setAlcance(CONSOLIDADA)
    setDesde(opcion.primeraVerificada)
    setErrores(({ anuncianteId: _, campanaId: __, ...resto }) => resto)
  }

  function elegirAlcance(valor: string) {
    setAlcance(valor)
    if (grupo) {
      const nueva = seleccionPorFacturar(
        grupo,
        valor === CONSOLIDADA ? null : valor
      )
      if (nueva) setDesde(nueva.primeraVerificada)
    }
  }

  function cambiarHasta(valor: string) {
    setHasta(valor)
    setErrores(({ hasta: _, ...resto }) => resto)
    if (parsearFecha(valor) && valor <= hoyEnBogota()) {
      consultar(valor === hoyEnBogota() ? null : valor)
    }
  }

  /** El foco va al primer campo con error (en el grupo, a su primera opción). */
  function enfocarError(porCampo: Partial<Record<Campo, string>>) {
    const destino = porCampo.anuncianteId
      ? document
          .getElementById(`${id}-anunciantes`)
          ?.querySelector<HTMLElement>('[role="radio"]')
      : document.getElementById(porCampo.desde ? `${id}-desde` : `${id}-hasta`)
    destino?.focus()
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErrorGeneral(null)
    const entrada = {
      anuncianteId: anuncianteId ?? "",
      campanaId,
      desde,
      hasta,
    }
    const validacion = esquemaGenerarFactura.safeParse(entrada)
    if (!validacion.success) {
      const porCampo = erroresDe(desdeErrorZod(validacion.error).erroresCampo)
      setErrores(porCampo)
      enfocarError(porCampo)
      return
    }
    setErrores({})
    iniciar(async () => {
      const resultado = await generarFactura(entrada)
      if (!resultado.ok) {
        const porCampo = erroresDe(resultado.erroresCampo)
        if (Object.keys(porCampo).length > 0) {
          setErrores(porCampo)
          enfocarError(porCampo)
        } else {
          setErrorGeneral(resultado.error)
        }
        return
      }
      toast.success("Borrador generado", {
        description:
          "Revísalo, descarga el archivo de carga y registra la factura cuando la expidas.",
      })
      setAbierto(false)
      reiniciar()
      router.push(rutaFactura(resultado.datos.facturaId))
    })
  }

  function cuerpo() {
    if (carga.tipo === "cargando") {
      return (
        <div role="status" aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Cargando lo pendiente por facturar…</span>
          <Esqueleto className="h-16 rounded-xl" />
          <Esqueleto className="h-16 rounded-xl" />
          <Esqueleto className="h-16 rounded-xl" />
        </div>
      )
    }
    if (carga.tipo === "error") {
      return (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/6 p-4">
          <p role="alert" className="text-sm text-pretty">
            {carga.mensaje}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => consultar(hasta === hoyEnBogota() ? null : hasta)}
          >
            <RotateCcw data-icon="inline-start" aria-hidden />
            Reintentar
          </Button>
        </div>
      )
    }
    return (
      <form
        id={idFormulario}
        onSubmit={enviar}
        noValidate
        className="flex flex-col gap-5"
        aria-busy={consultando || undefined}
      >
        <Field data-invalid={errores.hasta ? true : undefined}>
          <FieldLabel htmlFor={`${id}-hasta`}>Facturar hasta</FieldLabel>
          <Input
            id={`${id}-hasta`}
            type="date"
            max={hoyEnBogota()}
            value={hasta}
            onChange={(evento) => cambiarHasta(evento.target.value)}
            disabled={pendiente}
            aria-invalid={errores.hasta ? true : undefined}
            aria-describedby={describir(
              `${id}-hasta-ayuda`,
              errores.hasta && `${id}-error-hasta`
            )}
            className="h-10 w-full sm:h-9 sm:w-48"
          />
          <FieldDescription id={`${id}-hasta-ayuda`}>
            Entra todo lo verificado sin facturar hasta ese día, también lo de
            periodos anteriores.
          </FieldDescription>
          <FieldError id={`${id}-error-hasta`}>{errores.hasta}</FieldError>
        </Field>

        {grupos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
            <Inbox aria-hidden className="size-6 text-muted-foreground" />
            <p className="font-medium">No hay nada por facturar</p>
            <p className="text-sm text-pretty text-muted-foreground">
              Cuando Operación verifique asignaciones y no estén en otra
              factura, aparecerán aquí por anunciante y campaña.
            </p>
          </div>
        ) : (
          <FieldSet data-invalid={errores.anuncianteId ? true : undefined}>
            <FieldLegend id={`${id}-leyenda-anunciante`} variant="label">
              Anunciante
            </FieldLegend>
            <RadioGroup
              id={`${id}-anunciantes`}
              value={anuncianteId ?? ""}
              onValueChange={(valor) => {
                const opcion = grupos.find((g) => g.anuncianteId === valor)
                if (opcion) elegirAnunciante(opcion)
              }}
              disabled={pendiente}
              aria-labelledby={`${id}-leyenda-anunciante`}
              aria-invalid={errores.anuncianteId ? true : undefined}
              aria-describedby={
                errores.anuncianteId ? `${id}-error-anunciante` : undefined
              }
              className={cn(
                "max-h-64 gap-2 overflow-y-auto p-0.5",
                consultando && "opacity-60"
              )}
            >
              {grupos.map((opcion) => (
                <label key={opcion.anuncianteId} className={CLASE_OPCION}>
                  <RadioGroupItem
                    value={opcion.anuncianteId}
                    className="mt-0.5"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {opcion.anunciante}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {contarAsignaciones(opcion.asignaciones)} ·{" "}
                      {opcion.campanas.length === 1
                        ? "1 campaña"
                        : `${opcion.campanas.length} campañas`}{" "}
                      · desde el {formatearDia(opcion.primeraVerificada)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium cifras">
                    {formatearCOP(opcion.montoBruto)}
                  </span>
                </label>
              ))}
            </RadioGroup>
            {errores.anuncianteId ? (
              <p
                id={`${id}-error-anunciante`}
                role="alert"
                className="text-sm text-destructive"
              >
                {errores.anuncianteId}
              </p>
            ) : null}
          </FieldSet>
        )}

        {grupo ? (
          <FieldSet>
            <FieldLegend id={`${id}-leyenda-alcance`} variant="label">
              Qué incluye
            </FieldLegend>
            <RadioGroup
              value={alcance}
              onValueChange={(valor) => {
                if (typeof valor === "string") elegirAlcance(valor)
              }}
              disabled={pendiente}
              aria-labelledby={`${id}-leyenda-alcance`}
              className="gap-2"
            >
              <label className={CLASE_OPCION}>
                <RadioGroupItem value={CONSOLIDADA} className="mt-0.5" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">Consolidada</span>
                  <span className="text-xs text-muted-foreground">
                    Todas sus campañas en una sola factura.
                  </span>
                </span>
                <span className="shrink-0 text-sm cifras">
                  {formatearCOP(grupo.montoBruto)}
                </span>
              </label>
              {grupo.campanas.map((campana) => (
                <label key={campana.campanaId} className={CLASE_OPCION}>
                  <RadioGroupItem
                    value={campana.campanaId}
                    className="mt-0.5"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {campana.campana}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {contarAsignaciones(campana.asignaciones)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm cifras">
                    {formatearCOP(campana.montoBruto)}
                  </span>
                </label>
              ))}
            </RadioGroup>
          </FieldSet>
        ) : null}

        {grupo ? (
          <Field data-invalid={errores.desde ? true : undefined}>
            <FieldLabel htmlFor={`${id}-desde`}>Periodo desde</FieldLabel>
            <Input
              id={`${id}-desde`}
              type="date"
              max={hasta || hoyEnBogota()}
              value={desde}
              onChange={(evento) => {
                setDesde(evento.target.value)
                setErrores(({ desde: _, ...resto }) => resto)
              }}
              disabled={pendiente}
              aria-invalid={errores.desde ? true : undefined}
              aria-describedby={describir(
                `${id}-desde-ayuda`,
                errores.desde && `${id}-error-desde`
              )}
              className="h-10 w-full sm:h-9 sm:w-48"
            />
            <FieldDescription id={`${id}-desde-ayuda`}>
              Inicio del periodo que dice la factura. Si hay algo verificado
              antes, el borrador lo toma desde esa fecha.
            </FieldDescription>
            <FieldError id={`${id}-error-desde`}>{errores.desde}</FieldError>
          </Field>
        ) : null}

        {seleccion ? (
          <p
            aria-live="polite"
            className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-pretty"
          >
            Entran {contarAsignaciones(seleccion.asignaciones)} por{" "}
            <span className="font-medium cifras">
              {formatearCOP(seleccion.montoBruto)}
            </span>{" "}
            antes de IVA. El borrador calcula el IVA según el esquema de
            facturación vigente.
          </p>
        ) : null}
      </form>
    )
  }

  return (
    <>
      <Button type="button" onClick={abrir}>
        <FilePlus data-icon="inline-start" aria-hidden />
        Nueva factura
      </Button>
      <DialogoFormulario
        abierto={abierto}
        onAbiertoChange={cambiarAbierto}
        icono={FilePlus}
        titulo="Nueva factura"
        descripcion="Genera el borrador desde lo verificado sin facturar. Después lo expides en el software de facturación y lo registras aquí."
        idFormulario={idFormulario}
        textoConfirmar="Generar borrador"
        textoPendiente="Generando el borrador"
        pendiente={pendiente}
        envioDeshabilitado={carga.tipo !== "lista" || grupos.length === 0}
        errorGeneral={errorGeneral}
      >
        {cuerpo()}
      </DialogoFormulario>
    </>
  )
}
