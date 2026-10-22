"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Mail, Phone, RadioTower, UserRound } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type ReactNode, useId, useState, useTransition } from "react"
import { FormProvider, useForm, useFormContext } from "react-hook-form"

import { useGuardiaSalida } from "@/components/asistente/use-guardia-salida"
import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { AlertaFormulario } from "@/features/auth/components/alerta-formulario"
import { BotonEnviar } from "@/features/auth/components/boton-enviar"
import { aplicarErroresServidor } from "@/features/usuarios/components/errores-formulario"

import { registrarSolicitudVinculacion } from "../actions"
import { MENSAJES_VINCULACION } from "../errores"
import { type CampoSolicitud, camposConError } from "../formulario"
import {
  type EntradaSolicitudVinculacion,
  esquemaSolicitudVinculacion,
  VALORES_SOLICITUD,
} from "../schemas"
import type { DatosFormularioPublico } from "../tipos"
import { CampoAutorizacion } from "./campo-autorizacion"
import { CampoUbicacion } from "./campo-ubicacion"
import { CamposCuentas } from "./campos-cuentas"
import {
  CampoMensaje,
  CampoTextoPublico,
  CampoTipoMedio,
} from "./campos-publicos"
import { SolicitudEnviada } from "./solicitud-enviada"
import { useFocoTrasEnvio } from "./use-foco-tras-envio"

function Seccion({
  numero,
  titulo,
  descripcion,
  children,
}: {
  numero: number
  titulo: string
  descripcion?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-semibold cifras text-primary ring-1 ring-primary/20"
        >
          {numero}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
          <h2 id={id} className="text-base leading-tight font-semibold">
            {titulo}
          </h2>
          {descripcion ? (
            <p className="text-sm text-pretty text-muted-foreground">
              {descripcion}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  )
}

/**
 * Campo trampa: invisible y fuera del orden de tabulación. Una persona nunca
 * lo llena; un robot que completa todo, sí (y recibe la misma respuesta).
 */
function CampoTrampa() {
  const { register } = useFormContext<EntradaSolicitudVinculacion>()
  return (
    <div aria-hidden className="sr-only">
      <label htmlFor="vincular-sitio-web">Sitio web (déjalo vacío)</label>
      <input
        id="vincular-sitio-web"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        {...register("sitioWeb")}
      />
    </div>
  )
}

interface Enviada {
  nombreMedio: string
  email: string
}

/**
 * Solicitud pública para unirse a AMO (MED-001), pensada para el celular:
 * cuatro bloques cortos, campos de 44 px y validación al salir de cada campo
 * con el mismo esquema que el servidor. Tras enviarla muestra siempre la
 * misma confirmación (no revela si el correo ya existe).
 */
export function FormularioVinculacion({
  datos,
}: {
  datos: DatosFormularioPublico
}) {
  const router = useRouter()
  const formulario = useForm({
    resolver: zodResolver(esquemaSolicitudVinculacion),
    defaultValues: VALORES_SOLICITUD,
    mode: "onTouched",
  })
  const { formState, getValues, handleSubmit, setError, setFocus } = formulario
  const [pendiente, iniciar] = useTransition()
  const [enviada, setEnviada] = useState<Enviada | null>(null)
  /**
   * Correo de la última solicitud recibida en esta visita. Con el mismo correo
   * la BD absorbe el reenvío sin decirlo (no guarda los cambios): se pide
   * corregirlo en lugar de confirmar otra vez algo que no se registró.
   */
  const [correoEnviado, setCorreoEnviado] = useState<string | null>(null)
  const [destinoSalida, setDestinoSalida] = useState<string | null>(null)
  const errorServidor = formState.errors.root?.servidor?.message

  useGuardiaSalida(formState.isDirty && !enviada, setDestinoSalida)

  const enfocarTrasEnvio = useFocoTrasEnvio<CampoSolicitud>(pendiente, setFocus)

  // Se envían los valores tal como se escribieron: el servidor aplica el
  // MISMO esquema (con sus transformaciones) que acaba de validar el cliente.
  const enviar = handleSubmit((valores) => {
    if (valores.email === correoEnviado) {
      setError(
        "email",
        { type: "manual", message: MENSAJES_VINCULACION.correoYaEnviado },
        { shouldFocus: true }
      )
      return
    }
    iniciar(async () => {
      const resultado = await registrarSolicitudVinculacion(getValues())
      if (!resultado.ok) {
        const campos = camposConError(resultado.erroresCampo)
        aplicarErroresServidor(setError, resultado, campos)
        enfocarTrasEnvio(campos[0] ?? null)
        return
      }
      setCorreoEnviado(valores.email)
      setEnviada({ nombreMedio: valores.nombreMedio, email: valores.email })
    })
  })

  if (enviada) {
    return (
      <SolicitudEnviada
        nombreMedio={enviada.nombreMedio}
        email={enviada.email}
        onCorregir={() => {
          setEnviada(null)
          // El correo es lo que más se corrige: queda enfocado y seleccionado.
          requestAnimationFrame(() => setFocus("email", { shouldSelect: true }))
        }}
      />
    )
  }

  return (
    <FormProvider {...formulario}>
      <form
        onSubmit={enviar}
        noValidate
        aria-busy={pendiente || undefined}
        className="relative flex flex-col gap-9"
      >
        <Seccion
          numero={1}
          titulo="Tu medio"
          descripcion="Cómo lo conoce tu audiencia y desde dónde publicas."
        >
          <CampoTextoPublico
            nombre="nombreMedio"
            etiqueta="Nombre del medio"
            icono={RadioTower}
            placeholder="Por ejemplo, Noticias del Pacífico"
            autoComplete="organization"
            maxLength={150}
            disabled={pendiente}
          />
          <CampoTipoMedio deshabilitado={pendiente} />
          <CampoUbicacion
            territorio={datos.territorio}
            deshabilitado={pendiente}
          />
        </Seccion>

        <Seccion
          numero={2}
          titulo="Tus redes"
          descripcion="Las cuentas donde publicas. Los seguidores pueden ser aproximados: los verificamos después."
        >
          <CamposCuentas
            umbral={datos.umbralSeguidores}
            deshabilitado={pendiente}
          />
        </Seccion>

        <Seccion
          numero={3}
          titulo="Tus datos de contacto"
          descripcion="A quién le escribimos con la respuesta."
        >
          <CampoTextoPublico
            nombre="contactoNombre"
            etiqueta="Tu nombre"
            icono={UserRound}
            autoComplete="name"
            maxLength={150}
            disabled={pendiente}
          />
          <CampoTextoPublico
            nombre="email"
            etiqueta="Correo electrónico"
            icono={Mail}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="tu@correo.com"
            ayuda="Si te invitamos, será tu usuario para ingresar a AMO."
            disabled={pendiente}
          />
          <CampoTextoPublico
            nombre="celular"
            etiqueta="Celular"
            icono={Phone}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="300 123 4567"
            opcional
            ayuda="Para escribirte por WhatsApp si hace falta."
            disabled={pendiente}
          />
        </Seccion>

        <Seccion numero={4} titulo="Antes de enviar">
          <CampoMensaje deshabilitado={pendiente} />
          <CampoAutorizacion
            politica={datos.politica}
            deshabilitado={pendiente}
          />
        </Seccion>

        <CampoTrampa />

        <div className="flex flex-col gap-4">
          <AlertaFormulario mensaje={errorServidor} />
          <BotonEnviar pendiente={pendiente} textoPendiente="Enviando…">
            Enviar solicitud
          </BotonEnviar>
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes una cuenta?{" "}
            <Link
              href="/ingresar"
              className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:anillo-foco"
            >
              Ingresa
            </Link>
          </p>
        </div>
      </form>

      <DialogoConfirmacion
        abierto={destinoSalida !== null}
        onAbiertoChange={(abierto) => {
          if (!abierto) setDestinoSalida(null)
        }}
        titulo="¿Salir sin enviar la solicitud?"
        descripcion="Perderás lo que escribiste."
        textoConfirmar="Salir sin enviar"
        textoCancelar="Seguir aquí"
        destructivo
        onConfirmar={() => {
          if (destinoSalida) router.push(destinoSalida as Route)
        }}
      />
    </FormProvider>
  )
}
