"use client"

import { ArrowLeft, MailCheck } from "lucide-react"
import { useEffect, useRef } from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"

const PASOS = [
  "Revisamos tus redes y los datos de tu medio.",
  "Si encaja, te enviamos la invitación para crear tu cuenta.",
  "Completas tu perfil, documentos y datos de pago para empezar a recibir ofertas.",
] as const

/**
 * Confirmación del envío. Es la misma exista o no una cuenta o una solicitud
 * con ese correo (la BD absorbe los duplicados sin decirlo). Lleva el foco al
 * título para que el lector de pantalla anuncie el cambio.
 */
export function SolicitudEnviada({
  nombreMedio,
  email,
}: {
  nombreMedio: string
  email: string
}) {
  const titulo = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    titulo.current?.focus()
    titulo.current?.scrollIntoView({ block: "center" })
  }, [])

  return (
    <div className="flex flex-col gap-6 rounded-2xl border bg-card/60 p-6 motion-safe:animate-aparecer-arriba">
      <span className="grid size-11 place-items-center rounded-xl bg-success/10 text-success ring-1 ring-success/20">
        <MailCheck className="size-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-2">
        <h2
          ref={titulo}
          tabIndex={-1}
          className="font-heading text-xl font-semibold outline-none"
        >
          ¡Recibimos tu solicitud!
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Gracias por querer sumar a{" "}
          <span className="font-medium text-foreground">{nombreMedio}</span> a
          AMO. Te contactaremos en{" "}
          <span className="font-medium break-all text-foreground">{email}</span>
          .
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Lo que sigue</h3>
        <ol className="flex flex-col gap-2.5">
          {PASOS.map((paso, indice) => (
            <li key={paso} className="flex items-start gap-3 text-sm">
              <span
                aria-hidden
                className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary cifras"
              >
                {indice + 1}
              </span>
              <span className="pt-0.5 leading-snug">{paso}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        ¿Ya tienes una cuenta en AMO? Ingresa con ella: no hace falta otra
        solicitud. ¿Escribiste mal el correo? Envía la solicitud de nuevo con el
        correcto.
      </p>
      <EnlaceBoton variant="outline" size="lg" className="h-11" href="/ingresar">
        <ArrowLeft data-icon="inline-start" aria-hidden />
        Ir a ingresar
      </EnlaceBoton>
    </div>
  )
}
