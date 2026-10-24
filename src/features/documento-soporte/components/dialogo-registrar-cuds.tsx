"use client"

import { Fingerprint } from "lucide-react"
import { useEffect, useId, useRef, useState, useTransition } from "react"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { registrarCuds } from "../actions"
import { esquemaRegistrarCuds, LARGO_CUDS, normalizarCuds } from "../schemas"
import { DialogoFormulario } from "./dialogo-formulario"

export interface DialogoRegistrarCudsProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  documentoId: string
  numero: string | null
  /** Con la numeración de la plataforma, el PDF se vuelve a generar para mostrar el CUDS. */
  regeneraPdf: boolean
  focoAlCerrar?: () => HTMLElement | null | false
  onRegistrado: (aviso: string | null) => void
}

/**
 * «Registrar CUDS»: el código que devolvió el proveedor tecnológico al transmitir el documento a la DIAN.
 * Se pega tal cual (los espacios y saltos de línea se quitan solos) y el contador dice cuántos caracteres
 * van de los 96. El error queda junto al campo y el foco va a él (el del servidor, cuando el campo deja de
 * estar deshabilitado).
 */
export function DialogoRegistrarCuds({
  abierto,
  onAbiertoChange,
  documentoId,
  numero,
  regeneraPdf,
  focoAlCerrar,
  onRegistrado,
}: DialogoRegistrarCudsProps) {
  const [cuds, setCuds] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const campo = useRef<HTMLTextAreaElement>(null)
  // El campo está deshabilitado mientras se registra y `focus()` no tiene efecto sobre él: el error del
  // servidor lo enfoca cuando termina `pendiente`.
  const enfocarAlTerminar = useRef(false)
  const id = useId()
  const ids = {
    campo: `${id}-cuds`,
    ayuda: `${id}-ayuda`,
    error: `${id}-error`,
  }
  const largo = normalizarCuds(cuds).length

  useEffect(() => {
    if (pendiente || !enfocarAlTerminar.current) return
    enfocarAlTerminar.current = false
    campo.current?.focus()
  }, [pendiente])

  function cambiarAbierto(valor: boolean) {
    if (!valor) {
      enfocarAlTerminar.current = false
      setCuds("")
      setError(null)
      setErrorGeneral(null)
    }
    onAbiertoChange(valor)
  }

  function enviar() {
    const entrada = { documentoId, cuds }
    const validacion = esquemaRegistrarCuds.safeParse(entrada)
    if (!validacion.success) {
      setError(validacion.error.issues[0]?.message ?? null)
      setErrorGeneral(null)
      campo.current?.focus()
      return
    }
    setError(null)
    setErrorGeneral(null)
    iniciar(async () => {
      const resultado = await registrarCuds(entrada)
      if (!resultado.ok) {
        const delCampo = resultado.erroresCampo?.cuds?.[0]
        if (delCampo) {
          setError(delCampo)
          enfocarAlTerminar.current = true
        } else {
          setErrorGeneral(resultado.error)
        }
        return
      }
      onRegistrado(resultado.datos.aviso)
      cambiarAbierto(false)
    })
  }

  return (
    <DialogoFormulario
      abierto={abierto}
      onAbiertoChange={cambiarAbierto}
      icono={Fingerprint}
      titulo="Registrar el CUDS"
      descripcion={
        <>
          Documento soporte {numero ?? "sin número"}. Pega el código único
          (CUDS) que te devolvió el proveedor tecnológico al transmitirlo a la
          DIAN.
          {regeneraPdf
            ? " El PDF se vuelve a generar para que lo muestre."
            : ""}
        </>
      }
      textoConfirmar="Registrar CUDS"
      textoPendiente="Registrando…"
      pendiente={pendiente}
      errorGeneral={errorGeneral}
      focoAlCerrar={focoAlCerrar}
      onEnviar={enviar}
    >
      <div className="grid gap-2">
        <Label htmlFor={ids.campo}>CUDS</Label>
        <Textarea
          ref={campo}
          id={ids.campo}
          value={cuds}
          onChange={(evento) => {
            setCuds(evento.target.value)
            if (error) setError(null)
          }}
          rows={3}
          disabled={pendiente}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
          className="font-mono text-xs break-all"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${ids.error} ${ids.ayuda}` : ids.ayuda}
        />
        <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
          <p id={ids.ayuda} className="text-pretty">
            {LARGO_CUDS} caracteres: números del 0 al 9 y letras de la a a la f.
            Los espacios y saltos de línea se quitan solos.
          </p>
          <span className="shrink-0 cifras" aria-hidden>
            {largo}/{LARGO_CUDS}
          </span>
        </div>
        {error ? (
          <p id={ids.error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </DialogoFormulario>
  )
}
