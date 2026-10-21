"use client"

import { Check, Copy, ExternalLink, RotateCcw } from "lucide-react"
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useTransition,
} from "react"
import { toast } from "sonner"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { EnlaceBotonExterno } from "@/components/layout/enlace-boton"
import { Button } from "@/components/ui/button"
import type { ResultadoAccion } from "@/lib/result"

import type { EnrolamientoMfa } from "../acciones-contrato"
import { ACCIONES_AUTH } from "./acciones"
import { AlertaFormulario } from "./alerta-formulario"
import { FormularioVerificacionMfa } from "./formulario-verificacion-mfa"

const PASOS = [
  "Abre tu app autenticadora (Google Authenticator, Microsoft Authenticator, 1Password u otra).",
  "Escanea el código QR o escribe la clave manual.",
  "Ingresa el código de 6 dígitos que aparece en la app.",
] as const

/** `ABCD EFGH IJKL…`: más fácil de copiar a mano sin perder el lugar. */
function agruparClave(secreto: string): string {
  return (
    secreto
      .replace(/\s+/g, "")
      .match(/.{1,4}/g)
      ?.join(" ") ?? secreto
  )
}

function ClaveManual({ secreto }: { secreto: string }) {
  const idEtiqueta = useId()
  const [copiada, setCopiada] = useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(secreto)
      setCopiada(true)
      toast.success("Clave copiada")
      window.setTimeout(() => setCopiada(false), 2000)
    } catch {
      toast.error("No pudimos copiar la clave. Selecciónala y cópiala a mano.")
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p id={idEtiqueta} className="text-xs font-medium text-muted-foreground">
        Clave de configuración (tipo «basada en tiempo»)
      </p>
      <div className="flex items-center gap-2 rounded-xl border bg-muted/40 py-2 pr-2 pl-3">
        <code
          aria-labelledby={idEtiqueta}
          className="min-w-0 flex-1 font-mono text-[0.8125rem] tracking-wider break-words select-all"
        >
          {agruparClave(secreto)}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={copiar}
          aria-label={copiada ? "Clave copiada" : "Copiar clave"}
        >
          {copiada ? (
            <Check aria-hidden className="text-success" />
          ) : (
            <Copy aria-hidden />
          )}
        </Button>
      </div>
    </div>
  )
}

function CodigoQr({ datos }: { datos: EnrolamientoMfa }) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border bg-card/60 p-5 motion-safe:animate-aparecer-arriba">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
        {/* Fondo blanco siempre: los lectores de QR necesitan contraste claro/oscuro. */}
        <div className="shrink-0 rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL de datos SVG generada por Supabase */}
          <img
            src={datos.qrSvg}
            alt="Código QR para configurar la verificación en dos pasos"
            width={144}
            height={144}
            className="size-36"
          />
        </div>
        <div className="flex flex-col gap-1.5 text-center sm:text-left">
          <p className="text-sm font-medium">Escanéalo con tu app</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            ¿No puedes usar la cámara? Escribe la clave de abajo.
          </p>
          {/* En el celular, el enlace otpauth:// abre directamente la app autenticadora. */}
          <EnlaceBotonExterno
            variant="link"
            className="h-auto self-center px-0 sm:hidden"
            href={datos.uri}
          >
            <ExternalLink aria-hidden data-icon="inline-start" />
            Abrir en la app autenticadora
          </EnlaceBotonExterno>
        </div>
      </div>
      <ClaveManual secreto={datos.secreto} />
    </div>
  )
}

function CargandoQr() {
  return (
    <div
      role="status"
      aria-label="Generando el código QR…"
      className="flex flex-col gap-5 rounded-2xl border bg-card/60 p-5"
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
        <Esqueleto className="size-40 shrink-0 rounded-xl" />
        <div className="flex w-full flex-1 flex-col items-center gap-2 sm:items-start">
          <Esqueleto className="h-4 w-32" />
          <Esqueleto className="h-3 w-full" />
          <Esqueleto className="h-3 w-3/4" />
        </div>
      </div>
      <Esqueleto className="h-10 w-full rounded-xl" />
    </div>
  )
}

/**
 * Enrolamiento TOTP: pide el factor al montar (una vez, aun con el doble
 * montaje de StrictMode), muestra QR y clave, y verifica el primer código.
 */
export function ConfiguracionMfa() {
  const [resultado, setResultado] =
    useState<ResultadoAccion<EnrolamientoMfa> | null>(null)
  const [generando, iniciarGeneracion] = useTransition()
  const solicitado = useRef(false)

  const generar = () =>
    iniciarGeneracion(async () => {
      setResultado(await ACCIONES_AUTH.iniciarEnrolamientoMfa())
    })

  const generarAlMontar = useEffectEvent(generar)
  useEffect(() => {
    if (solicitado.current) return
    solicitado.current = true
    generarAlMontar()
  }, [])

  const datos = resultado?.ok ? resultado.datos : null

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-col gap-3">
        {PASOS.map((paso, indice) => (
          <li key={paso} className="flex gap-3 text-sm leading-relaxed">
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold cifras text-primary"
            >
              {indice + 1}
            </span>
            <span className="text-muted-foreground">{paso}</span>
          </li>
        ))}
      </ol>

      {generando || !resultado ? <CargandoQr /> : null}

      {!generando && resultado && !resultado.ok ? (
        <div className="flex flex-col gap-3">
          <AlertaFormulario
            titulo="No pudimos generar el código"
            mensaje={resultado.error}
          />
          <Button
            variant="outline"
            className="h-10 self-start"
            onClick={generar}
          >
            <RotateCcw aria-hidden data-icon="inline-start" />
            Intentar de nuevo
          </Button>
        </div>
      ) : null}

      {datos ? (
        <>
          <CodigoQr datos={datos} />
          {/* Sin autofoco: primero hay que escanear el QR (y en el celular
              el teclado taparía el código). */}
          <FormularioVerificacionMfa
            factorId={datos.factorId}
            textoBoton="Activar verificación"
            enfocar={false}
          />
        </>
      ) : null}
    </div>
  )
}
