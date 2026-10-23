"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CircleAlert, Info, Send, TriangleAlert } from "lucide-react"
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
import { FormProvider, type Resolver, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { useCargaCaptura } from "@/components/archivos/use-carga-captura"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { PieAcciones } from "@/components/layout/pie-acciones"
import { CuentaRegresiva } from "@/components/tiempo/cuenta-regresiva"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { separarFechaHora } from "@/features/asistente-oferta/instantes"
import { CampoFecha } from "@/features/configuracion/components/campos"
import {
  rutaAsignacionMedio,
  rutaContenido,
  rutaEvidencia,
} from "@/features/mis-campanas/rutas"
import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"
import type { ArchivoSubido } from "@/lib/archivos/tipos"
import { serializarFecha } from "@/lib/fechas"
import { formatearFecha, formatearFechaHora } from "@/lib/format"

import {
  confirmarCapturaEjecucion,
  prepararCapturaEjecucion,
  registrarEvidencia,
} from "../actions"
import { MENSAJES_EJECUCION } from "../errores"
import {
  fechaPorDefecto,
  limitesFechaPublicacion,
  versionPendiente,
} from "../evidencia"
import { nombrePublicacion } from "../presentacion"
import {
  CAMPOS_EVIDENCIA,
  conReglasEvidencia,
  esquemaEvidencia,
  REGLAS_CAPTURA,
  type ValoresEvidencia,
} from "../schemas"
import type {
  AsignacionEjecucion,
  ContenidoEjecucion,
  EvidenciaRegistrada,
  PublicacionEjecucion,
} from "../tipos"
import { CapturaEnviada } from "./captura-enviada"
import {
  CampoEnlacePost,
  CampoEtiquetaPublicidad,
  CampoHoraExacta,
} from "./campos-ejecucion"
import { Seccion } from "./seccion"
import { SelectorCaptura } from "./selector-captura"
import { useFocoErrores } from "./use-foco-errores"

export type ModoEvidencia = "cargar" | "corregir" | "revision"

export interface FormularioEvidenciaProps {
  asignacion: AsignacionEjecucion
  numero: number
  /** La evidencia ya enviada de esa publicación (al corregir). */
  publicacion: PublicacionEjecucion | null
  modo: ModoEvidencia
  /** Observaciones del rechazo (modo «corregir»). */
  observaciones?: string | null
  contenido: ContenidoEjecucion
  /** Otras publicaciones de la oferta que aún no tienen evidencia válida. */
  pendientes: readonly number[]
  ahoraServidor: number
}

const TEXTO_BOTON: Readonly<Record<ModoEvidencia, string>> = {
  cargar: "Enviar evidencia",
  corregir: "Enviar la corrección",
  revision: "Guardar cambios",
}

/** Mensaje y destino tras guardar: la siguiente publicación o la campaña. */
function despuesDeGuardar(
  resultado: EvidenciaRegistrada,
  { asignacion, numero, pendientes }: FormularioEvidenciaProps
) {
  const siguiente = pendientes.find((otro) => otro !== numero)
  if (resultado.estadoAsignacion !== "PUBLICADA" && siguiente) {
    return {
      mensaje: `Guardamos la evidencia de la publicación ${numero}. Sigue con la publicación ${siguiente}.`,
      ruta: rutaEvidencia(asignacion.id, siguiente),
    }
  }
  return {
    mensaje:
      "¡Listo! Enviaste tu evidencia. El equipo AMO la revisará y te avisará.",
    ruta: rutaAsignacionMedio(asignacion.id),
  }
}

/**
 * Evidencia de una publicación (MED-013): enlace del post validado según la
 * red y el formato de la oferta, fecha y hora dentro de la ventana, captura
 * de las estadísticas (cámara o galería, comprimida y con miniatura; sube
 * mientras se llena el resto) y la etiqueta de publicidad confirmada. La
 * BD vuelve a validarlo todo al registrar.
 */
export function FormularioEvidencia(props: FormularioEvidenciaProps) {
  const {
    asignacion,
    numero,
    publicacion,
    modo,
    observaciones,
    contenido,
    ahoraServidor,
  } = props
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [errorCaptura, setErrorCaptura] = useState<string | null>(null)
  const formularioRef = useRef<HTMLFormElement>(null)
  const mostrarErrores = useFocoErrores(pendiente, formularioRef)
  const idErrorCaptura = useId()

  const ahora = new Date(ahoraServidor)
  const limites = limitesFechaPublicacion(asignacion, ahora)
  const valoresIniciales = useMemo<ValoresEvidencia>(() => {
    const fecha = publicacion
      ? separarFechaHora(publicacion.fechaPublicacion)
      : fechaPorDefecto(
          limitesFechaPublicacion(asignacion, new Date(ahoraServidor)),
          new Date(ahoraServidor)
        )
    return {
      asignacionId: asignacion.id,
      numero,
      url: publicacion?.urlPost ?? "",
      dia: fecha.dia,
      hora: fecha.hora,
      etiquetaConfirmada: false,
    }
  }, [asignacion, numero, publicacion, ahoraServidor])

  // Las reglas leen la hora al validar: el formulario puede quedar abierto.
  const resolver = useMemo<Resolver<ValoresEvidencia>>(
    () => (valores, contexto, opciones) =>
      zodResolver(
        conReglasEvidencia(esquemaEvidencia, {
          plataforma: asignacion.plataforma,
          formato: asignacion.formatoClave,
          cuenta: asignacion.handle,
          ventanaInicio: asignacion.ventanaInicio,
          ventanaFin: asignacion.ventanaFin,
          contenidoDescargadoAt: asignacion.contenidoDescargadoAt,
          ahora: new Date(),
        })
      )(valores, contexto, opciones),
    [asignacion]
  )
  const formulario = useForm<ValoresEvidencia>({
    resolver,
    defaultValues: valoresIniciales,
    mode: "onTouched",
  })
  const { formState, trigger, control, getFieldState } = formulario
  const errorServidor = formState.errors.root?.servidor?.message

  // El día y la hora se validan juntos: corregir uno revalida el otro.
  const [dia, hora] = useWatch({ control, name: ["dia", "hora"] })
  useEffect(() => {
    if (getFieldState("dia").invalid || getFieldState("hora").invalid) {
      void trigger(["dia", "hora"])
    }
  }, [dia, hora, getFieldState, trigger])

  const carga = useCaptura(asignacion.id)
  const conCapturaPrevia = publicacion !== null

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
      const resultado = await registrarEvidencia({
        ...formulario.getValues(),
        captura,
      })
      if (!resultado.ok) {
        const deCaptura = resultado.erroresCampo?.captura?.[0]
        if (deCaptura) mostrarErrorCaptura(deCaptura)
        const otros = Object.keys(resultado.erroresCampo ?? {}).some(
          (campo) => campo !== "captura"
        )
        if (!deCaptura || otros) {
          aplicarErroresServidor(
            formulario.setError,
            resultado,
            CAMPOS_EVIDENCIA
          )
        }
        // Los campos siguen deshabilitados: el foco llega al terminar el envío.
        mostrarErrores()
        return
      }
      const destino = despuesDeGuardar(resultado.datos, props)
      toast.success(destino.mensaje)
      router.push(destino.ruta)
    })
  }

  function alSerInvalido() {
    capturaPresente()
    // También el día (el calendario no recibe el foco de react-hook-form).
    mostrarErrores()
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    void formulario.handleSubmit(alSerValido, alSerInvalido)(evento)
  }

  const subiendo = pendiente && carga.subida.activa
  const fueraDeVersion = versionPendiente(contenido)

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
            <AlertTitle>El equipo AMO pidió corregir tu evidencia</AlertTitle>
            <AlertDescription>
              {observaciones?.trim() ||
                "Revisa el enlace, la fecha y la captura, y envíala de nuevo."}
            </AlertDescription>
          </Alert>
        ) : modo === "revision" ? (
          <Alert>
            <Info aria-hidden />
            <AlertTitle>Tu evidencia está en revisión</AlertTitle>
            <AlertDescription>
              Si te equivocaste en algo, corrígelo aquí antes de que el equipo
              AMO la revise.
            </AlertDescription>
          </Alert>
        ) : null}

        {fueraDeVersion && contenido.vigente ? (
          <Alert>
            <TriangleAlert aria-hidden className="text-warning" />
            <AlertTitle>Hay una versión nueva del contenido</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>
                El anunciante la activó el{" "}
                {formatearFechaHora(contenido.vigente.activadoAt)}. Si
                publicaste después, descárgala y publica con ella antes de
                registrar la evidencia.
              </span>
              <EnlaceBoton
                href={rutaContenido(asignacion.id)}
                variant="outline"
                size="sm"
              >
                Ver el contenido
              </EnlaceBoton>
            </AlertDescription>
          </Alert>
        ) : null}

        <Seccion
          titulo="¿Dónde publicaste?"
          descripcion={`Pega el enlace de ${nombrePublicacion(numero, asignacion.publicaciones)} en ${asignacion.formatoNombre.toLowerCase()}.`}
        >
          <CampoEnlacePost
            nombre="url"
            plataforma={asignacion.plataforma}
            formato={asignacion.formatoClave}
            cuenta={asignacion.handle}
            deshabilitado={pendiente}
          />
        </Seccion>

        <Seccion
          titulo="¿Cuándo publicaste?"
          descripcion={
            limites.desdeDescarga
              ? `Hora de Colombia. Desde que descargaste el contenido (${formatearFechaHora(limites.minimo)}) hasta el ${formatearFechaHora(asignacion.ventanaFin)}.`
              : `Hora de Colombia. La oferta permite publicar desde el ${formatearFechaHora(limites.minimo)} hasta el ${formatearFechaHora(asignacion.ventanaFin)}.`
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoFecha
              nombre="dia"
              etiqueta="Día"
              minimo={serializarFecha(limites.minimo)}
              placeholder={formatearFecha(ahora)}
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
          descripcion="Abre las estadísticas de la publicación en la app y toma una captura donde se vea la fecha."
        >
          <SelectorCaptura
            carga={carga}
            titulo="Toma o elige la captura"
            instrucciones="Imagen JPG, PNG, WebP o HEIC. Se reduce sola antes de enviarla."
            descripcionVista="Vista previa de la captura de las estadísticas"
            actual={
              publicacion ? (
                <CapturaEnviada
                  origen={{ tipo: "publicacion", id: publicacion.id }}
                  titulo={`Captura de ${nombrePublicacion(numero, asignacion.publicaciones)}`}
                  detalle="Se conserva si no eliges otra."
                />
              ) : null
            }
            error={errorCaptura}
            idError={idErrorCaptura}
            bloqueado={pendiente}
          />
        </Seccion>

        <CampoEtiquetaPublicidad
          nombre="etiquetaConfirmada"
          deshabilitado={pendiente}
        />

        {errorServidor ? (
          <Alert variant="destructive" role="alert" data-error-general>
            <CircleAlert aria-hidden />
            <AlertDescription>{errorServidor}</AlertDescription>
          </Alert>
        ) : null}

        <PieAcciones
          etiqueta="Enviar la evidencia"
          nota={
            <CuentaRegresiva
              venceAt={asignacion.fechaLimitePublicacion}
              ahoraServidor={ahoraServidor}
              etiqueta="Evidencia"
              variante="texto"
            />
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

/** La captura de la evidencia: sube a `evidencias/asignacion/{id}/publicacion/`. */
function useCaptura(asignacionId: string) {
  return useCargaCaptura({
    preparar: (descripcion) =>
      prepararCapturaEjecucion({
        asignacionId,
        tipo: "publicacion",
        descripcion,
      }),
    confirmar: (captura) =>
      confirmarCapturaEjecucion({
        asignacionId,
        tipo: "publicacion",
        captura,
      }),
    reglas: REGLAS_CAPTURA,
  })
}
