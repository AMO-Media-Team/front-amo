"use client"

import { Eye, EyeOff, KeyRound, type LucideIcon, Mail } from "lucide-react"
import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useState,
} from "react"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

type PropsInput = Omit<ComponentProps<"input">, "id" | "className" | "type">

interface CampoBaseProps extends PropsInput {
  etiqueta: string
  error?: string
  /** Texto de ayuda bajo el campo. */
  ayuda?: ReactNode
  /** Elemento junto a la etiqueta (p. ej. "¿Olvidaste tu contraseña?"). */
  accionEtiqueta?: ReactNode
  className?: string
}

interface CampoConIconoProps extends CampoBaseProps {
  type: ComponentProps<"input">["type"]
  icono: LucideIcon
  /** Contenido al final del campo (botón de mostrar contraseña). */
  final?: ReactNode
  /** Mensajes extra enlazados con `aria-describedby`. */
  avisos?: ReactNode
  idAvisos?: string
}

function CampoConIcono({
  etiqueta,
  error,
  ayuda,
  accionEtiqueta,
  className,
  icono: Icono,
  final,
  avisos,
  idAvisos,
  "aria-describedby": descritoPorExterno,
  ...input
}: CampoConIconoProps) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  const descritoPor = [
    descritoPorExterno,
    ayuda && idAyuda,
    avisos && idAvisos,
    error && idError,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <Field data-invalid={Boolean(error)} className={cn("gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
        {accionEtiqueta}
      </div>
      <InputGroup className="h-11 bg-background/60 dark:bg-input/20">
        <InputGroupAddon align="inline-start" className="pl-3">
          <Icono aria-hidden className="size-4 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={descritoPor || undefined}
          className="h-full text-[0.9375rem] md:text-[0.9375rem]"
          {...input}
        />
        {final ? (
          <InputGroupAddon align="inline-end" className="pr-2">
            {final}
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      {avisos}
      {ayuda ? <FieldDescription id={idAyuda}>{ayuda}</FieldDescription> : null}
      {error ? <FieldError id={idError}>{error}</FieldError> : null}
    </Field>
  )
}

export function CampoEmail(props: CampoBaseProps) {
  return (
    <CampoConIcono
      type="email"
      icono={Mail}
      inputMode="email"
      autoComplete="email"
      autoCapitalize="none"
      spellCheck={false}
      {...props}
    />
  )
}

interface CampoContrasenaProps extends CampoBaseProps {
  autoComplete: "current-password" | "new-password"
}

/**
 * Contraseña con botón para mostrarla y aviso de Bloq Mayús (un error común
 * que de otro modo solo se descubre al fallar el ingreso).
 */
export function CampoContrasena({ onKeyUp, ...props }: CampoContrasenaProps) {
  const idAvisos = useId()
  const [visible, setVisible] = useState(false)
  const [mayusculas, setMayusculas] = useState(false)

  const detectarMayusculas = (evento: KeyboardEvent<HTMLInputElement>) => {
    setMayusculas(evento.getModifierState("CapsLock"))
    onKeyUp?.(evento)
  }

  return (
    <CampoConIcono
      type={visible ? "text" : "password"}
      icono={KeyRound}
      autoCapitalize="none"
      spellCheck={false}
      onKeyUp={detectarMayusculas}
      idAvisos={idAvisos}
      avisos={
        mayusculas ? (
          <p id={idAvisos} className="text-xs font-medium text-warning">
            Bloq Mayús está activado.
          </p>
        ) : null
      }
      final={
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          onClick={() => setVisible((actual) => !actual)}
          className="text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </InputGroupButton>
      }
      {...props}
    />
  )
}
