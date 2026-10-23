"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert, Info, Send } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import {
  type FieldErrors,
  type FieldPath,
  FormProvider,
  type Resolver,
  useForm,
  useWatch,
} from "react-hook-form"
import { toast } from "sonner"

import { useCargaCaptura } from "@/components/archivos/use-carga-captura"
import { PieAcciones } from "@/components/layout/pie-acciones"
import { CuentaRegresiva } from "@/components/tiempo/cuenta-regresiva"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { separarFechaHora } from "@/features/asistente-oferta/instantes"
import { CampoFecha } from "@/features/configuracion/components/campos"
import { numeroAEntrada, textoANumero } from "@/features/configuracion/numeros"
import { rutaAsignacionMedio } from "@/features/mis-campanas/rutas"
import {
  aplicarErroresServidor,
  ERROR_SERVIDOR,
} from "@/features/usuarios/components/errores-formulario"
import type { ArchivoSubido } from "@/lib/archivos/tipos"
import { formatearNumero } from "@/lib/format"

import {
  confirmarCapturaEjecucion,
  guardarMetricas,
  prepararCapturaEjecucion,
} from "../actions"
import {
  CAMPOS,
  camposMetricas,
  type DefinicionCampo,
} from "../campos-metricas"
import { esCorteFijo, NOMBRES_CORTE, venceCarga } from "../cortes"
import { MENSAJES_EJECUCION } from "../errores"
import { cortesComparables, diaDe, diasDelPeriodo } from "../metricas"
import {
  CAMPOS_FORMULARIO_METRICAS,
  conReglasMetricas,
  esquemaMetricas,
  REGLAS_CAPTURA,
  type ValoresFormularioMetricas,
} from "../schemas"
import type {
  AsignacionEjecucion,
  CampoMetrica,
  Corte,
  MetricaEjecucion,
  MetricaGuardada,
  PublicacionEjecucion,
  ValoresMetricas,
} from "../tipos"
import { CapturaEnviada } from "./captura-enviada"
import { CampoCifraMetrica, CampoHoraExacta } from "./campos-ejecucion"
import { Seccion } from "./seccion"
import { SelectorCaptura } from "./selector-captura"
import { useFocoErrores } from "./use-foco-errores"

export type ModoMetricas = "cargar" | "corregir" | "revision"

export interface FormularioMetricasProps {
  asignacion: AsignacionEjecucion
  numero: number
  publicacion: PublicacionEjecucion
  corte: Corte
  /** El corte que se corrige (o `null` si es nuevo). */
  metrica: MetricaEjecucion | null
  /** Los demás cortes de la publicación, para la coherencia. */
  otros: readonly MetricaEjecucion[]
  toleranciaCortes: number
  plazoCargaHoras: number
  modo: ModoMetricas
  ahoraServidor: number
}

const TEXTO_BOTON: Readonly<Record<ModoMetricas, string>> = {
  cargar: "Enviar métricas",
  corregir: "Enviar la corrección",
  revision: "Guardar cambios",
}

const SUFIJOS: Readonly<Record<DefinicionCampo["tipo"], string | undefined>> = {
  entero: undefined,
  segundos: "s",
  porcentaje: "%",
}

function textosDe(valores: ValoresMetricas): Record<CampoMetrica, string> {
  return Object.fromEntries(
    CAMPOS.map((campo) => [campo, numeroAEntrada(valores[campo])])
  ) as Record<CampoMetrica, string>
}

function valoresIniciales({
  asignacion,
  numero,
  publicacion,
  corte,
  metrica,
  ahoraServidor,
}: FormularioMetricasProps): ValoresFormularioMetricas {
  const captura = separarFechaHora(
    metrica?.fechaCorte ?? new Date(ahoraServidor).toISOString()
  )
  const periodo =
    metrica?.periodoDesde && metrica.periodoHasta
      ? diasDelPeriodo(metrica.periodoDesde, metrica.periodoHasta)
      : esCorteFijo(corte)
        ? { desde: "", hasta: "" }
        : {
            desde: diaDe(publicacion.fechaPublicacion),
            hasta: captura.dia,
          }
  const vacios = Object.fromEntries(CAMPOS.map((campo) => [campo, ""]))
  return {
    asignacionId: asignacion.id,
    numero,
    corte,
    metricaId: metrica?.corte === "PERSONALIZADO" ? metrica.id : null,
    dia: captura.dia,
    hora: captura.hora,
    periodoDesde: periodo.desde,
    periodoHasta: periodo.hasta,
    ...(vacios as Record<CampoMetrica, string>),
    ...(metrica ? textosDe(metrica.valores) : {}),
  }
}

function mensajeGuardado(resultado: MetricaGuardada, corte: Corte): string {
  if (resultado.estadoAsignacion === "METRICAS_CARGADAS") {
    return "¡Listo! Cargaste todas las métricas. El equipo AMO las verificará."
  }
  return corte === "PERSONALIZADO"
    ? "Enviaste las métricas del periodo personalizado."
    : `Enviaste las métricas de ${NOMBRES_CORTE[corte].largo}. El equipo AMO las revisará.`
}

/** Suma de interacciones en vivo, con el error de coherencia si lo hay. */
function ResumenInteracciones({
  idError,
  definiciones,
  textos,
  error,
  referencia,
}: {
  /** Lo citan los campos que suman (`aria-describedby`). */
  idError: string
  definiciones: readonly DefinicionCampo[]
  textos: readonly string[]
  error: { message?: string } | undefined
  referencia: string
}) {
  const sumandos = definiciones.filter((definicion) => definicion.interaccion)
  const suma = sumandos.reduce((total, definicion) => {
    const indice = CAMPOS.indexOf(definicion.clave)
    const valor = textoANumero(textos[indice] ?? "")
    return total + (valor !== null && valor > 0 ? Math.trunc(valor) : 0)
  }, 0)
  return (
    <div
      data-invalid={error ? true : undefined}
      className="flex flex-col gap-1 rounded-xl border bg-muted/30 p-3 text-sm data-[invalid=true]:border-destructive/50"
    >
      <p className="flex items-baseline justify-between gap-3">
        <span className="font-medium">Interacciones</span>
        <span className="text-base font-semibold cifras">
          {formatearNumero(suma)}
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        {`Suma de ${sumandos.map((d) => d.etiqueta.toLowerCase()).join(", ")}. No puede superar ${referencia}.`}
      </p>
      <FieldError id={idError} errors={[error]} />
    </div>
  )
}

/**
 * Un corte de métricas (MED-014): las cifras de EP §9 de la plataforma, la
 * fecha de la captura, el periodo del personalizado y la captura obligatoria
 * del panel (INT-001). La coherencia (INT-005) se valida en pantalla con las
 * mismas reglas y la misma tolerancia que la BD, y bloquea el envío.
 */
export function FormularioMetricas(props: FormularioMetricasProps) {
  const {
    asignacion,
    publicacion,
    corte,
    metrica,
    otros,
    toleranciaCortes,
    plazoCargaHoras,
    modo,
    ahoraServidor,
  } = props
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [errorCaptura, setErrorCaptura] = useState<string | null>(null)
  const formularioRef = useRef<HTMLFormElement>(null)
  const mostrarErrores = useFocoErrores(pendiente, formularioRef)
  const idErrorCaptura = useId()
  const idErrorInteracciones = useId()

  const definiciones = useMemo(
    () => camposMetricas(asignacion.plataforma, asignacion.formatoClave),
    [asignacion.plataforma, asignacion.formatoClave]
  )
  const comparables = useMemo(() => cortesComparables(otros), [otros])
  // Las reglas leen la hora al validar: el formulario puede quedar abierto.
  const resolver = useMemo<Resolver<ValoresFormularioMetricas>>(
    () => (valores, contexto, opciones) =>
      zodResolver(
        conReglasMetricas(esquemaMetricas, {
          plataforma: asignacion.plataforma,
          formato: asignacion.formatoClave,
          corte,
          fechaPublicacion: publicacion.fechaPublicacion,
          otros: comparables,
          tolerancia: toleranciaCortes,
          ahora: new Date(),
        })
      )(valores, contexto, opciones),
    [
      asignacion,
      corte,
      publicacion.fechaPublicacion,
      comparables,
      toleranciaCortes,
    ]
  )
  const formulario = useForm<ValoresFormularioMetricas>({
    resolver,
    defaultValues: valoresIniciales(props),
    mode: "onTouched",
  })
  const { formState, trigger, control, getFieldState } = formulario
  const errores = formState.errors as FieldErrors
  const errorServidor = formState.errors.root?.servidor?.message
  // Se lee al pintar: así `formState` sigue `isDirty` (proxy de react-hook-form).
  const sinCambios = !formState.isDirty

  // Las reglas cruzan campos (impresiones ≥ alcance, interacciones, fecha y
  // periodo): al cambiar uno se revalidan los que ya muestran un error.
  const observados = useWatch({
    control,
    name: CAMPOS_FORMULARIO_METRICAS.filter(
      (campo) => campo !== "interacciones"
    ) as FieldPath<ValoresFormularioMetricas>[],
  })
  const textos = useWatch({ control, name: CAMPOS })
  const huella = observados.join("|")
  useEffect(() => {
    const conError = CAMPOS_FORMULARIO_METRICAS.filter(
      (campo) =>
        getFieldState(campo as FieldPath<ValoresFormularioMetricas>).invalid
    )
    if (conError.length > 0) {
      void trigger(conError as FieldPath<ValoresFormularioMetricas>[])
    }
  }, [huella, getFieldState, trigger])

  const carga = useCaptura(asignacion.id)
  const conCapturaPrevia = metrica !== null

  function capturaPresente(): boolean {
    if (carga.elegida || conCapturaPrevia) {
      setErrorCaptura(null)
      return true
    }
    setErrorCaptura(MENSAJES_EJECUCION.capturaRequerida)
    return false
  }

  function mostrarErrorCaptura(mensaje: string) {
    setErrorCaptura(mensaje)
    mostrarErrores()
  }

  function alSerValido() {
    if (!capturaPresente()) {
      mostrarErrores()
      return
    }
    // Reenviar igual un corte rechazado no lo devuelve a revisión (la BD lo
    // deja RECHAZADO): se pide cambiar algo antes de enviarlo.
    if (modo === "corregir" && sinCambios && !carga.elegida) {
      formulario.setError(ERROR_SERVIDOR, {
        type: "manual",
        message: MENSAJES_EJECUCION.correccionSinCambios,
      })
      mostrarErrores()
      return
    }
    iniciar(async () => {
      let captura: ArchivoSubido | null = null
      if (carga.elegida) {
        const lista = await carga.obtener()
        if (!lista?.ok) {
          mostrarErrorCaptura(
            lista?.error ?? MENSAJES_EJECUCION.capturaRequerida
          )
          return
        }
        captura = lista.captura
      }
      const resultado = await guardarMetricas({
        ...formulario.getValues(),
        captura,
      })
      if (!resultado.ok) {
        const deCaptura = resultado.erroresCampo?.captura?.[0]
        if (deCaptura) mostrarErrorCaptura(deCaptura)
        const otrosCampos = Object.keys(resultado.erroresCampo ?? {}).some(
          (campo) => campo !== "captura"
        )
        if (!deCaptura || otrosCampos) {
          aplicarErroresServidor(
            formulario.setError,
            resultado,
            CAMPOS_FORMULARIO_METRICAS as unknown as FieldPath<ValoresFormularioMetricas>[]
          )
        }
        // Los campos siguen deshabilitados: el foco llega al terminar el envío.
        mostrarErrores()
        return
      }
      toast.success(mensajeGuardado(resultado.datos, corte))
      router.push(rutaAsignacionMedio(asignacion.id))
    })
  }

  function alSerInvalido(errores: FieldErrors) {
    capturaPresente()
    // La suma de interacciones no es un campo: el foco va al primero que suma.
    const campos = Object.keys(errores)
    if (campos.length === 1 && campos[0] === "interacciones") {
      const primera = definiciones.find((definicion) => definicion.interaccion)
      if (primera) formulario.setFocus(primera.clave)
      return
    }
    // También los días (el calendario no recibe el foco de react-hook-form).
    mostrarErrores()
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    void formulario.handleSubmit(alSerValido, alSerInvalido)(evento)
  }

  const vence = venceCarga(publicacion.fechaPublicacion, corte, plazoCargaHoras)
  const subiendo = pendiente && carga.subida.activa
  const referenciaInteracciones =
    asignacion.plataforma === "TIKTOK"
      ? "las reproducciones"
      : "las impresiones"
  const delCorte =
    corte === "PERSONALIZADO"
      ? "del periodo"
      : `de ${NOMBRES_CORTE[corte].largo}`

  return (
    <FormProvider {...formulario}>
      <form
        ref={formularioRef}
        onSubmit={enviar}
        noValidate
        aria-busy={pendiente || undefined}
        className="flex flex-col gap-4"
      >
        {modo === "corregir" ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertTitle>El equipo AMO pidió corregir estas métricas</AlertTitle>
            <AlertDescription>
              {metrica?.observaciones?.trim() ||
                "Revisa las cifras y la captura, y envíalas de nuevo."}
            </AlertDescription>
          </Alert>
        ) : modo === "revision" ? (
          <Alert>
            <Info aria-hidden />
            <AlertTitle>Estas métricas están en revisión</AlertTitle>
            <AlertDescription>
              Si te equivocaste en alguna cifra, corrígela aquí antes de que el
              equipo AMO las revise.
            </AlertDescription>
          </Alert>
        ) : null}

        <Seccion
          titulo="Cifras del panel"
          descripcion="Escríbelas tal como aparecen en las estadísticas de la publicación, completas y sin abreviar (1.250, no 1,2 mil)."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {definiciones.map((definicion) => (
              <CampoCifraMetrica
                key={definicion.clave}
                nombre={definicion.clave}
                etiqueta={definicion.etiqueta}
                descripcion={definicion.ayuda}
                opcional={!definicion.obligatorio}
                decimal={definicion.tipo !== "entero"}
                sufijo={SUFIJOS[definicion.tipo]}
                placeholder={definicion.tipo === "entero" ? "0" : "0,0"}
                deshabilitado={pendiente}
                describidaPor={
                  definicion.interaccion && errores.interacciones
                    ? idErrorInteracciones
                    : undefined
                }
              />
            ))}
          </div>
          <ResumenInteracciones
            idError={idErrorInteracciones}
            definiciones={definiciones}
            textos={textos}
            error={errores.interacciones}
            referencia={referenciaInteracciones}
          />
        </Seccion>

        {corte === "PERSONALIZADO" ? (
          <Seccion
            titulo="Periodo que reportas"
            descripcion="Los días que elegiste en el panel. Empieza, como pronto, el día de la publicación."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoFecha
                nombre="periodoDesde"
                etiqueta="Desde"
                minimo={diaDe(publicacion.fechaPublicacion)}
                deshabilitado={pendiente}
              />
              <CampoFecha
                nombre="periodoHasta"
                etiqueta="Hasta"
                minimo={diaDe(publicacion.fechaPublicacion)}
                deshabilitado={pendiente}
              />
            </div>
          </Seccion>
        ) : null}

        <Seccion
          titulo="¿Cuándo tomaste la captura?"
          descripcion="Hora de Colombia. Debe ser después de cumplirse el corte y no en el futuro."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoFecha
              nombre="dia"
              etiqueta="Día"
              minimo={diaDe(publicacion.fechaPublicacion)}
              deshabilitado={pendiente}
            />
            <CampoHoraExacta
              nombre="hora"
              etiqueta="Hora"
              deshabilitado={pendiente}
            />
          </div>
        </Seccion>

        <Seccion
          titulo="Captura de las estadísticas"
          descripcion="Toma una captura del panel donde se vean estas cifras y la fecha. Sin ella no se pueden registrar."
        >
          <SelectorCaptura
            carga={carga}
            titulo="Toma o elige la captura"
            instrucciones="Imagen JPG, PNG, WebP o HEIC. Se reduce sola antes de enviarla."
            descripcionVista={`Vista previa de la captura de las métricas ${delCorte}`}
            actual={
              metrica ? (
                <CapturaEnviada
                  origen={{ tipo: "metrica", id: metrica.id }}
                  titulo={`Captura de las métricas ${delCorte}`}
                  detalle="Se conserva si no eliges otra."
                />
              ) : null
            }
            error={errorCaptura}
            idError={idErrorCaptura}
            bloqueado={pendiente}
          />
        </Seccion>

        {errorServidor ? (
          <Alert variant="destructive" role="alert" data-error-general>
            <CircleAlert aria-hidden />
            <AlertDescription>{errorServidor}</AlertDescription>
          </Alert>
        ) : null}

        <PieAcciones
          etiqueta="Enviar las métricas"
          nota={
            vence ? (
              <CuentaRegresiva
                venceAt={vence}
                ahoraServidor={ahoraServidor}
                etiqueta={`Métricas de ${NOMBRES_CORTE[corte].corto}`}
                variante="texto"
              />
            ) : (
              <span className="text-muted-foreground">Corte personalizado</span>
            )
          }
        >
          <Button type="submit" size="lg" disabled={pendiente}>
            {pendiente ? (
              <Spinner data-icon="inline-start" aria-hidden />
            ) : (
              <Send data-icon="inline-start" aria-hidden />
            )}
            {subiendo
              ? "Subiendo la captura…"
              : pendiente
                ? "Enviando…"
                : TEXTO_BOTON[modo]}
          </Button>
        </PieAcciones>
      </form>
    </FormProvider>
  )
}

/** La captura del corte: sube a `evidencias/asignacion/{id}/metrica/`. */
function useCaptura(asignacionId: string) {
  return useCargaCaptura({
    preparar: (descripcion) =>
      prepararCapturaEjecucion({ asignacionId, tipo: "metrica", descripcion }),
    confirmar: (captura) =>
      confirmarCapturaEjecucion({ asignacionId, tipo: "metrica", captura }),
    reglas: REGLAS_CAPTURA,
  })
}
