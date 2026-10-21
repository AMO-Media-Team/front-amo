"use client"

import { CircleAlert, type LucideIcon, Save, X } from "lucide-react"
import {
  createContext,
  type FormEventHandler,
  type ReactNode,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { DialogoConfirmacion } from "@/components/feedback/dialogo-confirmacion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

interface ContextoHoja {
  /** Cierra sin preguntar (tras guardar). */
  cerrar: () => void
  /** Pide cerrar: con cambios sin guardar, pregunta antes. */
  solicitarCierre: () => void
  fijarSucio: (sucio: boolean) => void
}

const Contexto = createContext<ContextoHoja | null>(null)

export function useHojaLateral(): ContextoHoja {
  const valor = use(Contexto)
  if (!valor) throw new Error("Falta <HojaLateral>.")
  return valor
}

const ANCHOS = {
  md: "data-[side=right]:sm:max-w-md",
  lg: "data-[side=right]:sm:max-w-lg",
  xl: "data-[side=right]:sm:max-w-2xl",
} as const

/**
 * Hoja lateral de Configuración: encabezado con icono, título y contexto, y
 * el contenido (normalmente un `FormularioHoja`). El contenido se monta al
 * abrir y se desmonta al cerrar, así cada apertura parte de los datos
 * actuales. Si hay cambios sin guardar, cerrar pide confirmación.
 */
export function HojaLateral({
  abierta,
  onAbiertaChange,
  icono: Icono,
  titulo,
  descripcion,
  ancho = "md",
  children,
}: {
  abierta: boolean
  onAbiertaChange: (abierta: boolean) => void
  icono: LucideIcon
  titulo: string
  descripcion?: ReactNode
  ancho?: keyof typeof ANCHOS
  children: ReactNode
}) {
  const sucio = useRef(false)
  const [descartar, setDescartar] = useState(false)

  const contexto = useMemo<ContextoHoja>(
    () => ({
      cerrar: () => {
        sucio.current = false
        onAbiertaChange(false)
      },
      solicitarCierre: () => {
        if (sucio.current) setDescartar(true)
        else onAbiertaChange(false)
      },
      fijarSucio: (valor) => {
        sucio.current = valor
      },
    }),
    [onAbiertaChange]
  )

  function cambiarAbierta(valor: boolean) {
    if (valor) {
      onAbiertaChange(true)
      return
    }
    contexto.solicitarCierre()
  }

  return (
    <Contexto value={contexto}>
      <Sheet open={abierta} onOpenChange={cambiarAbierta}>
        <SheetContent
          side="right"
          showCloseButton={false}
          // `data-[side=right]:w-full`: en móvil ocupa toda la pantalla (el
          // componente base la deja en 3/4 y un formulario ahí queda estrecho).
          className={cn("gap-0 data-[side=right]:w-full", ANCHOS[ancho])}
        >
          <SheetHeader className="flex-row items-start gap-3 border-b px-5 py-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
              <Icono className="size-5" aria-hidden />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <SheetTitle className="text-base font-semibold">
                {titulo}
              </SheetTitle>
              {descripcion ? (
                <SheetDescription className="text-pretty">
                  {descripcion}
                </SheetDescription>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Cerrar"
              onClick={contexto.solicitarCierre}
            >
              <X aria-hidden />
            </Button>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
      <DialogoConfirmacion
        abierto={descartar}
        onAbiertoChange={setDescartar}
        titulo="¿Descartar los cambios?"
        descripcion="Lo que escribiste en este formulario se perderá."
        textoConfirmar="Descartar"
        textoCancelar="Seguir editando"
        destructivo
        onConfirmar={() => contexto.cerrar()}
      />
    </Contexto>
  )
}

/**
 * Formulario dentro de una `HojaLateral`: cuerpo desplazable, error general
 * del servidor y pie con Cancelar y el botón de envío.
 */
export function FormularioHoja({
  onEnviar,
  pendiente,
  sucio,
  errorGeneral,
  textoEnviar = "Guardar",
  iconoEnviar: IconoEnviar = Save,
  envioDeshabilitado = false,
  children,
}: {
  onEnviar: FormEventHandler<HTMLFormElement>
  pendiente: boolean
  sucio: boolean
  errorGeneral?: string
  textoEnviar?: string
  iconoEnviar?: LucideIcon
  envioDeshabilitado?: boolean
  children: ReactNode
}) {
  const { fijarSucio, solicitarCierre } = useHojaLateral()
  useEffect(() => fijarSucio(sucio), [fijarSucio, sucio])

  return (
    <form
      onSubmit={onEnviar}
      noValidate
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
        {errorGeneral ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertDescription>{errorGeneral}</AlertDescription>
          </Alert>
        ) : null}
        {children}
      </div>
      <SheetFooter className="border-t bg-muted/30 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          type="button"
          disabled={pendiente}
          onClick={solicitarCierre}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pendiente || envioDeshabilitado}>
          {pendiente ? (
            <Spinner aria-label="Guardando" data-icon="inline-start" />
          ) : (
            <IconoEnviar data-icon="inline-start" aria-hidden />
          )}
          {textoEnviar}
        </Button>
      </SheetFooter>
    </form>
  )
}

/** Contenido de solo lectura en una hoja (historial, vista previa…). */
export function CuerpoHoja({
  children,
  pie,
  className,
}: {
  children: ReactNode
  pie?: ReactNode
  className?: string
}) {
  return (
    <>
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5",
          className
        )}
      >
        {children}
      </div>
      {pie ? (
        <SheetFooter className="border-t bg-muted/30 sm:flex-row sm:justify-end">
          {pie}
        </SheetFooter>
      ) : null}
    </>
  )
}
