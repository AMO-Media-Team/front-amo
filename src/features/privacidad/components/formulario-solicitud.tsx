"use client"

import { CircleAlert, CircleCheck, Send, Stamp } from "lucide-react"
import {
  type FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { SeccionCuenta } from "@/features/cuenta/components/seccion-cuenta"
import { cn } from "@/lib/utils"

import { radicarSolicitud, type SolicitudRadicada } from "../actions"
import {
  admiteSupresion,
  DATOS,
  datosParaRol,
  formatearDia,
  ORDEN_TIPOS,
  textoPlazoLegal,
  textoRadicado,
  TIPOS,
} from "../presentacion"
import { esquemaRadicar, LIMITES_DESCRIPCION } from "../schemas"
import type { DatoAfectado, RolTitular, TipoSolicitud } from "../tipos"
import { idSolicitudPropia } from "./mis-solicitudes"

const TARJETA_OPCION =
  "flex cursor-pointer items-start gap-3 rounded-xl border bg-background/60 p-3 transition-colors select-none hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/6 has-data-disabled:cursor-not-allowed has-data-disabled:opacity-70 has-data-disabled:hover:bg-background/60 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 dark:bg-input/20"

type Campo = "tipo" | "descripcion" | "datosAfectados"
type Errores = Partial<Record<Campo, string>>

const ORDEN_CAMPOS: readonly Campo[] = ["tipo", "descripcion", "datosAfectados"]

export interface FormularioSolicitudProps {
  rol: RolTitular
  /** Tipos con una solicitud abierta: la BD admite una por tipo. */
  abiertas: readonly TipoSolicitud[]
}

/**
 * «Radicar solicitud» (CTA-007): qué pide el titular, con una explicación
 * corta de cada derecho y su plazo legal, la descripción y los datos
 * afectados. Al radicar muestra el número y la fecha límite y lleva el foco a
 * esa confirmación. Valida con el mismo esquema que la Server Action; la BD
 * vuelve a comprobarlo todo (una abierta por tipo).
 */
export function FormularioSolicitud({
  rol,
  abiertas,
}: FormularioSolicitudProps) {
  const [tipo, setTipo] = useState<TipoSolicitud | null>(null)
  const [descripcion, setDescripcion] = useState("")
  const [datos, setDatos] = useState<DatoAfectado[]>([])
  const [errores, setErrores] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [radicada, setRadicada] = useState<
    (SolicitudRadicada & { tipo: TipoSolicitud }) | null
  >(null)
  const [pendiente, iniciar] = useTransition()

  const id = useId()
  const ids = {
    tipo: `${id}-tipo`,
    descripcion: `${id}-descripcion`,
    ayudaDescripcion: `${id}-ayuda-descripcion`,
    contador: `${id}-contador`,
    datos: `${id}-datos`,
    confirmacion: `${id}-confirmacion`,
  }
  const grupoTipo = useRef<HTMLDivElement>(null)
  const campoDescripcion = useRef<HTMLTextAreaElement>(null)
  const grupoDatos = useRef<HTMLFieldSetElement>(null)
  const confirmacion = useRef<HTMLDivElement>(null)
  const campoConError = useRef<Campo | null>(null)

  const opcionesDatos = datosParaRol(rol)

  // El foco va al primer campo con error en cuanto se puede enfocar.
  useEffect(() => {
    const campo = campoConError.current
    if (!campo || pendiente) return
    campoConError.current = null
    if (campo === "descripcion") {
      campoDescripcion.current?.focus()
    } else if (campo === "tipo") {
      grupoTipo.current
        ?.querySelector<HTMLElement>('[role="radio"]:not([data-disabled])')
        ?.focus()
    } else {
      grupoDatos.current
        ?.querySelector<HTMLElement>('[role="checkbox"]')
        ?.focus()
    }
  }, [errores, pendiente])

  useEffect(() => {
    if (radicada) confirmacion.current?.focus()
  }, [radicada])

  function mostrarErrores(porCampo: Errores): boolean {
    setErrores(porCampo)
    campoConError.current =
      ORDEN_CAMPOS.find((campo) => porCampo[campo]) ?? null
    return campoConError.current !== null
  }

  function alternarDato(dato: DatoAfectado, marcado: boolean) {
    setDatos((actuales) =>
      marcado
        ? opcionesDatos.filter((d) => d === dato || actuales.includes(d))
        : actuales.filter((d) => d !== dato)
    )
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (pendiente) return
    setErrorGeneral(null)
    const entrada = { tipo, descripcion, datosAfectados: datos }
    const validacion = esquemaRadicar.safeParse(entrada)
    if (!validacion.success) {
      const porCampo: Errores = {}
      for (const problema of validacion.error.issues) {
        const campo = problema.path[0] as Campo | undefined
        if (campo && !porCampo[campo]) porCampo[campo] = problema.message
      }
      mostrarErrores(porCampo)
      return
    }
    if (abiertas.includes(validacion.data.tipo)) {
      mostrarErrores({
        tipo: "Ya tienes una solicitud de este tipo en trámite.",
      })
      return
    }
    iniciar(async () => {
      const resultado = await radicarSolicitud(validacion.data)
      if (!resultado.ok) {
        const deCampo: Errores = {}
        for (const campo of ORDEN_CAMPOS) {
          const mensaje = resultado.erroresCampo?.[campo]?.[0]
          if (mensaje) deCampo[campo] = mensaje
        }
        if (!mostrarErrores(deCampo)) setErrorGeneral(resultado.error)
        return
      }
      setRadicada({ ...resultado.datos, tipo: validacion.data.tipo })
      setTipo(null)
      setDescripcion("")
      setDatos([])
      setErrores({})
    })
  }

  return (
    <SeccionCuenta
      id="radicar-solicitud"
      titulo="Ejerce tus derechos"
      icono={Stamp}
      descripcion="Consulta, corrige o pide suprimir tus datos personales (Ley 1581 de 2012). El equipo de AMO responde dentro del plazo legal."
    >
      {radicada ? (
        <div
          ref={confirmacion}
          id={ids.confirmacion}
          tabIndex={-1}
          role="status"
          className="mb-5 flex gap-3 rounded-xl border border-success/40 bg-success/8 p-4 outline-none focus-visible:anillo-foco"
        >
          <CircleCheck aria-hidden className="mt-0.5 size-5 text-success" />
          <div className="flex min-w-0 flex-col gap-1 text-sm">
            <p className="font-semibold">
              Radicamos tu solicitud {textoRadicado(radicada.numero)}
            </p>
            <p className="text-pretty text-muted-foreground">
              {TIPOS[radicada.tipo].etiqueta}. Te responderemos a más tardar el{" "}
              <strong className="font-medium text-foreground">
                {formatearDia(radicada.plazoVence, "largo")}
              </strong>
              . Te avisaremos en Notificaciones.
            </p>
            <a
              href={`#${idSolicitudPropia(radicada.solicitudId)}`}
              className="w-fit rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:anillo-foco"
            >
              Ver la solicitud
            </a>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={enviar}
        noValidate
        aria-busy={pendiente || undefined}
        className="flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <p id={ids.tipo} className="text-sm font-medium">
            ¿Qué quieres pedir?
          </p>
          <RadioGroup
            ref={grupoTipo}
            value={tipo ?? ""}
            onValueChange={(valor) => {
              setTipo(valor as TipoSolicitud)
              setErrores(({ tipo: _quitado, ...resto }) => resto)
            }}
            disabled={pendiente}
            aria-labelledby={ids.tipo}
            aria-invalid={errores.tipo ? true : undefined}
            aria-describedby={errores.tipo ? `${ids.tipo}-error` : undefined}
            className="gap-2 sm:grid-cols-2"
          >
            {ORDEN_TIPOS.map((opcion) => {
              const idOpcion = `${id}-${opcion}`
              const abierta = abiertas.includes(opcion)
              return (
                <label key={opcion} className={TARJETA_OPCION}>
                  <RadioGroupItem
                    value={opcion}
                    disabled={abierta}
                    aria-labelledby={`${idOpcion}-titulo`}
                    aria-describedby={`${idOpcion}-derecho ${idOpcion}-plazo`}
                    className="mt-0.5"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      id={`${idOpcion}-titulo`}
                      className="text-sm font-medium"
                    >
                      {TIPOS[opcion].opcion}
                    </span>
                    <span
                      id={`${idOpcion}-derecho`}
                      className="text-xs text-pretty text-muted-foreground"
                    >
                      {TIPOS[opcion].derecho}
                    </span>
                    <span
                      id={`${idOpcion}-plazo`}
                      className="text-xs text-pretty text-muted-foreground"
                    >
                      {abierta
                        ? "Ya tienes una en trámite: te avisaremos cuando la respondamos."
                        : textoPlazoLegal(opcion)}
                    </span>
                  </span>
                </label>
              )
            })}
          </RadioGroup>
          {errores.tipo ? (
            <p
              id={`${ids.tipo}-error`}
              role="alert"
              className="text-sm text-destructive"
            >
              {errores.tipo}
            </p>
          ) : null}
          {tipo && admiteSupresion(tipo) ? (
            <p className="flex items-start gap-2 rounded-lg border border-warning/45 bg-warning/10 px-3 py-2.5 text-sm text-pretty">
              <CircleAlert
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-warning"
              />
              Si procede, borraremos tu cuenta y ya no podrás ingresar a AMO.
              Conservamos lo que la ley nos obliga a guardar (soportes
              contables, la bitácora y la prueba de tu autorización), y no
              procede mientras tengas negocios o pagos en curso.
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor={ids.descripcion}>Cuéntanos qué necesitas</Label>
          <Textarea
            ref={campoDescripcion}
            id={ids.descripcion}
            value={descripcion}
            maxLength={LIMITES_DESCRIPCION.maximo}
            rows={4}
            required
            disabled={pendiente}
            placeholder="Ej.: quiero corregir mi celular, que quedó con un número equivocado…"
            onChange={(evento) => {
              setDescripcion(evento.target.value)
              setErrores(({ descripcion: _quitado, ...resto }) => resto)
            }}
            aria-invalid={errores.descripcion ? true : undefined}
            aria-describedby={cn(
              errores.descripcion && `${ids.descripcion}-error`,
              ids.ayudaDescripcion,
              ids.contador
            )}
          />
          <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
            <p id={ids.ayudaDescripcion} className="text-pretty">
              No escribas contraseñas ni números de cuenta completos.
            </p>
            <p id={ids.contador} className="shrink-0 cifras">
              {descripcion.length.toLocaleString("es-CO")}/
              {LIMITES_DESCRIPCION.maximo.toLocaleString("es-CO")}
            </p>
          </div>
          {errores.descripcion ? (
            <p
              id={`${ids.descripcion}-error`}
              role="alert"
              className="text-sm text-destructive"
            >
              {errores.descripcion}
            </p>
          ) : null}
        </div>

        <fieldset
          ref={grupoDatos}
          className="flex flex-col gap-2"
          aria-describedby={`${ids.datos}-ayuda`}
        >
          <legend className="mb-1 text-sm font-medium">
            ¿Qué datos tiene que ver? (opcional)
          </legend>
          <p
            id={`${ids.datos}-ayuda`}
            className="text-xs text-pretty text-muted-foreground"
          >
            Nos ayuda a atenderla más rápido.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {opcionesDatos.map((dato) => {
              const idDato = `${id}-dato-${dato}`
              return (
                <div
                  key={dato}
                  className="flex items-start gap-3 rounded-lg border bg-background/60 p-3"
                >
                  <Checkbox
                    id={idDato}
                    checked={datos.includes(dato)}
                    disabled={pendiente}
                    onCheckedChange={(valor) =>
                      alternarDato(dato, valor === true)
                    }
                    aria-describedby={`${idDato}-ayuda`}
                    className="mt-0.5"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <Label htmlFor={idDato} className="text-sm">
                      {DATOS[dato].etiqueta}
                    </Label>
                    <span
                      id={`${idDato}-ayuda`}
                      className="text-xs text-muted-foreground"
                    >
                      {DATOS[dato].ayuda}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
          {errores.datosAfectados ? (
            <p role="alert" className="text-sm text-destructive">
              {errores.datosAfectados}
            </p>
          ) : null}
        </fieldset>

        {errorGeneral ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/8 px-3 py-2.5 text-sm text-pretty text-destructive"
          >
            {errorGeneral}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={pendiente}
          className="w-full sm:w-fit sm:self-end"
        >
          {pendiente ? (
            <Spinner role={undefined} aria-hidden data-icon="inline-start" />
          ) : (
            <Send data-icon="inline-start" aria-hidden />
          )}
          Radicar solicitud
        </Button>
      </form>
    </SeccionCuenta>
  )
}
