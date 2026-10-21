"use client"

import {
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { EnlaceBotonExterno } from "@/components/layout/enlace-boton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import type { EnrolamientoMfa } from "@/features/auth/acciones-contrato"
import { CampoCodigo } from "@/features/auth/components/campo-codigo"
import type { ResultadoAccion } from "@/lib/result"

import {
  cancelarFactorMfa,
  confirmarFactorMfa,
  desactivarMfa,
  iniciarFactorMfa,
} from "../actions"

/** `ABCD EFGH IJKL…`: más fácil de copiar a mano. */
function agruparClave(secreto: string): string {
  return (
    secreto
      .replace(/\s+/g, "")
      .match(/.{1,4}/g)
      ?.join(" ") ?? secreto
  )
}

function ClaveManual({ secreto }: { secreto: string }) {
  const [copiada, setCopiada] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(secreto)
      setCopiada(true)
      window.setTimeout(() => setCopiada(false), 2000)
    } catch {
      toast.error("No pudimos copiar la clave. Selecciónala y cópiala a mano.")
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-muted/40 py-2 pr-2 pl-3">
      <code className="min-w-0 flex-1 font-mono text-[0.8125rem] tracking-wider break-words select-all">
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
  )
}

function BloqueQr({ datos }: { datos: EnrolamientoMfa }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card/60 p-4 motion-safe:animate-aparecer-arriba">
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        {/* Fondo blanco siempre: los lectores de QR necesitan contraste. */}
        <div className="shrink-0 rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL de datos SVG de Supabase */}
          <img
            src={datos.qrSvg}
            alt="Código QR para tu app autenticadora"
            width={136}
            height={136}
            className="size-34"
          />
        </div>
        <div className="flex flex-col gap-1.5 text-center sm:text-left">
          <p className="text-sm font-medium">
            Escanéalo con tu app autenticadora
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Google Authenticator, Microsoft Authenticator, 1Password u otra.
            ¿Sin cámara? Escribe la clave.
          </p>
          <EnlaceBotonExterno
            variant="link"
            className="h-auto self-center px-0 sm:hidden"
            href={datos.uri}
          >
            <ExternalLink aria-hidden data-icon="inline-start" />
            Abrir en la app
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
      className="flex flex-col gap-4 rounded-2xl border bg-card/60 p-4"
    >
      <span className="sr-only">Generando el código QR…</span>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <Esqueleto className="size-38 shrink-0 rounded-xl" />
        <div className="flex w-full flex-col gap-2">
          <Esqueleto className="h-4 w-40" />
          <Esqueleto className="h-3 w-full" />
          <Esqueleto className="h-3 w-3/4" />
        </div>
      </div>
      <Esqueleto className="h-10 w-full rounded-xl" />
    </div>
  )
}

interface DialogoConfigurarProps {
  /** `true`: ya hay un factor y se reemplaza por uno nuevo. */
  reemplazo: boolean
}

/**
 * Activar o cambiar de dispositivo: se crea un factor nuevo, se confirma con
 * su primer código y solo entonces se retiran los anteriores.
 */
function DialogoConfigurarMfa({ reemplazo }: DialogoConfigurarProps) {
  const [abierto, setAbierto] = useState(false)
  const [enrolamiento, setEnrolamiento] =
    useState<ResultadoAccion<EnrolamientoMfa> | null>(null)
  const [codigo, setCodigo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [generando, iniciarGeneracion] = useTransition()
  const [verificando, iniciarVerificacion] = useTransition()

  const generar = () =>
    iniciarGeneracion(async () => {
      setEnrolamiento(await iniciarFactorMfa())
    })

  const cambiarAbierto = (siguiente: boolean) => {
    if (verificando) return
    setAbierto(siguiente)
    setCodigo("")
    setError(null)
    if (siguiente) {
      generar()
      return
    }
    // Sin confirmar: no se deja un factor pendiente en la cuenta.
    if (enrolamiento?.ok) {
      void cancelarFactorMfa({ factorId: enrolamiento.datos.factorId })
    }
    setEnrolamiento(null)
  }

  const datos = enrolamiento?.ok ? enrolamiento.datos : null

  const verificar = (valor: string) => {
    if (!datos) return
    iniciarVerificacion(async () => {
      const resultado = await confirmarFactorMfa({
        factorId: datos.factorId,
        codigo: valor,
      })
      if (!resultado.ok) {
        setError(resultado.erroresCampo?.codigo?.[0] ?? resultado.error)
        setCodigo("")
        return
      }
      toast.success(
        resultado.datos.reemplazo
          ? "Listo: tu nueva app autenticadora quedó activa"
          : "Verificación en dos pasos activada"
      )
      setAbierto(false)
      setEnrolamiento(null)
      setCodigo("")
    })
  }

  return (
    <>
      <Button
        variant={reemplazo ? "outline" : "default"}
        onClick={() => cambiarAbierto(true)}
      >
        {reemplazo ? (
          <RefreshCw data-icon="inline-start" aria-hidden />
        ) : (
          <ShieldCheck data-icon="inline-start" aria-hidden />
        )}
        {reemplazo ? "Cambiar de dispositivo" : "Activar"}
      </Button>
      <Dialog open={abierto} onOpenChange={cambiarAbierto}>
        <DialogContent className="gap-5 sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              {reemplazo
                ? "Cambiar de app autenticadora"
                : "Activar verificación en dos pasos"}
            </DialogTitle>
            <DialogDescription>
              {reemplazo
                ? "Tu app actual sigue funcionando hasta que confirmes la nueva con su primer código."
                : "Además de tu contraseña, te pediremos un código de 6 dígitos de tu app."}
            </DialogDescription>
          </DialogHeader>

          {generando || !enrolamiento ? <CargandoQr /> : null}
          {!generando && enrolamiento && !enrolamiento.ok ? (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-col items-start gap-2">
                {enrolamiento.error}
                <Button size="sm" variant="outline" onClick={generar}>
                  Intentar de nuevo
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {datos && !generando ? (
            <>
              <BloqueQr datos={datos} />
              <CampoCodigo
                name="codigo"
                valor={codigo}
                onCambio={(valor) => {
                  setCodigo(valor)
                  setError(null)
                }}
                onCompleto={verificar}
                etiqueta="Código de la app autenticadora"
                ayuda="Escribe el código que muestra ahora tu app."
                error={error ?? undefined}
                deshabilitado={verificando}
              />
            </>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={verificando}
              onClick={() => cambiarAbierto(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={!datos || codigo.length !== 6 || verificando}
              onClick={() => verificar(codigo)}
            >
              {verificando ? (
                <Spinner data-icon="inline-start" aria-hidden />
              ) : null}
              {verificando
                ? "Verificando…"
                : reemplazo
                  ? "Confirmar cambio"
                  : "Activar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Desactivar (solo roles que no la exigen): pide un código vigente. */
function DialogoDesactivarMfa() {
  const [abierto, setAbierto] = useState(false)
  const [codigo, setCodigo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  const cambiarAbierto = (siguiente: boolean) => {
    if (pendiente) return
    setAbierto(siguiente)
    setCodigo("")
    setError(null)
  }

  const desactivar = (valor: string) =>
    iniciar(async () => {
      const resultado = await desactivarMfa({ codigo: valor })
      if (!resultado.ok) {
        setError(resultado.erroresCampo?.codigo?.[0] ?? resultado.error)
        setCodigo("")
        return
      }
      toast.success("Verificación en dos pasos desactivada")
      setAbierto(false)
    })

  return (
    <>
      <Button
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => cambiarAbierto(true)}
      >
        <ShieldOff data-icon="inline-start" aria-hidden />
        Desactivar
      </Button>
      <Dialog open={abierto} onOpenChange={cambiarAbierto}>
        <DialogContent className="gap-5 sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              ¿Desactivar la verificación?
            </DialogTitle>
            <DialogDescription>
              Tu cuenta quedará protegida solo con la contraseña. Para
              confirmar, escribe el código actual de tu app.
            </DialogDescription>
          </DialogHeader>
          <CampoCodigo
            name="codigo-desactivar"
            valor={codigo}
            onCambio={(valor) => {
              setCodigo(valor)
              setError(null)
            }}
            onCompleto={desactivar}
            error={error ?? undefined}
            deshabilitado={pendiente}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pendiente}
              onClick={() => cambiarAbierto(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={codigo.length !== 6 || pendiente}
              onClick={() => desactivar(codigo)}
            >
              {pendiente ? (
                <Spinner data-icon="inline-start" aria-hidden />
              ) : null}
              Desactivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Acciones de la tarjeta de verificación en dos pasos según el estado y el rol. */
export function AccionesMfa({
  activa,
  obligatoria,
}: {
  activa: boolean
  obligatoria: boolean
}) {
  return (
    <>
      {activa && !obligatoria ? <DialogoDesactivarMfa /> : null}
      <DialogoConfigurarMfa reemplazo={activa} />
    </>
  )
}
