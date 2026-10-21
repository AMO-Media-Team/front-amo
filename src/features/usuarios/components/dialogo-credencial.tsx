"use client"

import {
  Check,
  Copy,
  KeyRound,
  Link2,
  MailCheck,
  ShieldAlert,
} from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

import type { CredencialEntregada } from "../tipos"

/** Lo que el diálogo muestra: la credencial y a quién pertenece. */
export interface CredencialParaMostrar {
  credencial: CredencialEntregada
  email: string
  /** Contexto del título ("Usuario creado" / "Enlace generado"). */
  motivo: "alta" | "regeneracion"
}

const DURACION_COPIADO_MS = 2000

function textos(datos: CredencialParaMostrar) {
  const { credencial, email } = datos
  switch (credencial.tipo) {
    case "CORREO":
      return {
        Icono: MailCheck,
        titulo: "Invitación enviada",
        descripcion: `Enviamos el enlace de activación a ${email}. Si no le llega en unos minutos, genera uno nuevo desde su ficha (el del correo dejará de funcionar).`,
        etiqueta: null,
      }
    case "CONTRASENA":
      return {
        Icono: KeyRound,
        titulo: "Contraseña temporal",
        descripcion: `Entrégala a ${email} por un canal privado. Al primer ingreso deberá crear su propia contraseña y, si su rol lo exige, configurar la verificación en dos pasos.`,
        etiqueta: "Contraseña temporal",
      }
    case "ENLACE":
      return {
        Icono: Link2,
        titulo:
          credencial.proposito === "invitacion"
            ? datos.motivo === "alta"
              ? "Comparte el enlace de invitación"
              : "Nuevo enlace de invitación"
            : "Enlace de recuperación",
        descripcion:
          credencial.proposito === "invitacion"
            ? `Con este enlace ${email} activa su cuenta y crea su contraseña.`
            : `Con este enlace ${email} crea una contraseña nueva.`,
        etiqueta:
          credencial.proposito === "invitacion"
            ? "Enlace de invitación"
            : "Enlace de recuperación",
      }
  }
}

function secretoDe(credencial: CredencialEntregada): string | null {
  if (credencial.tipo === "ENLACE") return credencial.enlace
  if (credencial.tipo === "CONTRASENA") return credencial.contrasena
  return null
}

/**
 * Muestra UNA sola vez un enlace o una contraseña temporal. El secreto vive
 * solo en el estado de este diálogo: al cerrarlo se descarta y no queda en
 * ningún otro lugar (ni en la bitácora ni en los logs).
 */
export function DialogoCredencial({
  datos,
  onCerrar,
}: {
  datos: CredencialParaMostrar | null
  onCerrar: () => void
}) {
  const [copiado, setCopiado] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const idCampo = useId()
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(temporizador.current), [])

  if (!datos) return null
  const { Icono, titulo, descripcion, etiqueta } = textos(datos)
  const secreto = secretoDe(datos.credencial)

  async function copiar() {
    if (!secreto) return
    try {
      await navigator.clipboard.writeText(secreto)
      setCopiado(true)
      clearTimeout(temporizador.current)
      temporizador.current = setTimeout(
        () => setCopiado(false),
        DURACION_COPIADO_MS
      )
    } catch {
      // Sin permiso de portapapeles: se selecciona para copiar a mano.
      campo.current?.select()
      toast.info("Selecciona el texto y cópialo con Ctrl/⌘ + C.")
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar()
      }}
    >
      <DialogContent showCloseButton={false} className="gap-5 sm:max-w-lg">
        <DialogHeader className="gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-primary/12 text-primary">
            <Icono className="size-5" aria-hidden />
          </div>
          <DialogTitle className="text-lg">{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>

        {secreto && etiqueta ? (
          <div className="grid gap-2">
            <label htmlFor={idCampo} className="text-sm font-medium">
              {etiqueta}
            </label>
            <div className="flex gap-2">
              <input
                ref={campo}
                id={idCampo}
                readOnly
                value={secreto}
                onFocus={(evento) => evento.currentTarget.select()}
                spellCheck={false}
                className={cn(
                  "h-9 min-w-0 flex-1 rounded-lg border border-input bg-muted/50 px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  datos.credencial.tipo === "CONTRASENA" &&
                    "text-base tracking-wider"
                )}
              />
              <Button
                size="lg"
                variant={copiado ? "secondary" : "default"}
                onClick={copiar}
                aria-live="polite"
                className="min-w-26"
              >
                {copiado ? (
                  <Check data-icon="inline-start" aria-hidden />
                ) : (
                  <Copy data-icon="inline-start" aria-hidden />
                )}
                {copiado ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>
        ) : null}

        {secreto ? (
          <Alert className="border-warning/40 bg-warning/8">
            <ShieldAlert className="text-warning" aria-hidden />
            <AlertTitle>Solo se muestra esta vez</AlertTitle>
            <AlertDescription>
              {datos.credencial.tipo === "ENLACE"
                ? "No lo guardamos en ningún lugar. Funciona una sola vez y vence pronto: compártelo solo con esta persona por un canal privado. Si se pierde, genera uno nuevo."
                : "No la guardamos en ningún lugar. Compártela solo con esta persona por un canal privado; si se pierde, genera un enlace de recuperación."}
            </AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button onClick={onCerrar}>
            {secreto ? "Ya lo compartí" : "Entendido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
