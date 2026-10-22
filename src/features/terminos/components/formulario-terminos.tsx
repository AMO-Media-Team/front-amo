"use client"

import { type FormEvent, useActionState, useRef, useState } from "react"

import { AlertaFormulario } from "@/features/auth/components/alerta-formulario"
import { BotonEnviar } from "@/features/auth/components/boton-enviar"
import {
  errorDeCampo,
  errorGeneral,
  useNavegarTrasExito,
} from "@/features/auth/components/estado-formulario"

import { aceptarTerminos } from "../actions"
import { MENSAJE_CASILLA, textoFaltan, textoProgreso } from "../presentacion"
import { CAMPOS_ACEPTACION } from "../schemas"
import { type DocumentoConTexto, DocumentoTerminos } from "./documento-terminos"

interface FormularioTerminosProps {
  documentos: readonly DocumentoConTexto[]
  /** Ruta interna (ya validada) a la que continuar después de aceptar. */
  siguiente?: string
}

/**
 * Formulario nativo (`<form action>`): las casillas viajan en el `FormData` y
 * funciona antes de hidratar. En el navegador se valida antes de enviar y el
 * foco va a la primera casilla sin marcar; el servidor vuelve a validar contra
 * lo pendiente en la BD.
 */
export function FormularioTerminos({
  documentos,
  siguiente,
}: FormularioTerminosProps) {
  const [estado, accion] = useActionState(aceptarTerminos, null)
  useNavegarTrasExito(estado)

  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set())
  // Los avisos locales aparecen solo tras un intento de envío incompleto.
  const [intentado, setIntentado] = useState(false)
  const casillas = useRef(new Map<string, HTMLElement>())

  const total = documentos.length
  const aceptados = documentos.filter(({ id }) => marcados.has(id)).length
  const faltan = total - aceptados

  const marcar = (id: string, marcado: boolean) =>
    setMarcados((anteriores) => {
      const siguientes = new Set(anteriores)
      if (marcado) siguientes.add(id)
      else siguientes.delete(id)
      return siguientes
    })

  const validarAntesDeEnviar = (evento: FormEvent<HTMLFormElement>) => {
    const pendiente = documentos.find(({ id }) => !marcados.has(id))
    setIntentado(pendiente !== undefined)
    if (!pendiente) return
    evento.preventDefault()
    casillas.current.get(pendiente.id)?.focus()
  }

  const errorDocumento = (id: string): string | undefined => {
    if (marcados.has(id)) return undefined
    return intentado ? MENSAJE_CASILLA : errorDeCampo(estado, id)
  }

  const mensaje =
    intentado && faltan > 0 ? textoFaltan(faltan) : errorGeneral(estado)

  return (
    <form
      action={accion}
      onSubmit={validarAntesDeEnviar}
      noValidate
      className="flex flex-col gap-5"
    >
      {siguiente ? (
        <input
          type="hidden"
          name={CAMPOS_ACEPTACION.siguiente}
          value={siguiente}
        />
      ) : null}

      <div className="flex flex-col gap-4">
        {documentos.map((documento) => (
          <div key={documento.id}>
            <input
              type="hidden"
              name={CAMPOS_ACEPTACION.mostrada}
              value={documento.id}
            />
            <DocumentoTerminos
              documento={documento}
              marcado={marcados.has(documento.id)}
              onMarcado={(marcado) => marcar(documento.id, marcado)}
              error={errorDocumento(documento.id)}
              refCasilla={(casilla) => {
                if (casilla) casillas.current.set(documento.id, casilla)
                else casillas.current.delete(documento.id)
              }}
            />
          </div>
        ))}
      </div>

      <AlertaFormulario mensaje={mensaje} />

      <div className="flex flex-col gap-3">
        {total > 1 ? <Progreso aceptados={aceptados} total={total} /> : null}
        <BotonEnviar textoPendiente="Guardando tu aceptación…">
          Aceptar y continuar
        </BotonEnviar>
        <p className="text-center text-xs leading-relaxed text-pretty text-muted-foreground">
          Guardamos como constancia la versión de cada documento, la fecha y la
          hora, y la dirección IP desde la que aceptas.
        </p>
      </div>
    </form>
  )
}

function Progreso({ aceptados, total }: { aceptados: number; total: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Documentos</span>
        <span aria-live="polite" className="font-medium tabular-nums">
          {textoProgreso(aceptados, total)}
        </span>
      </div>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${(aceptados / total) * 100}%` }}
        />
      </div>
    </div>
  )
}
