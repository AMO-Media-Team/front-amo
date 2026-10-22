"use client"

import {
  CircleCheck,
  FileText,
  Fingerprint,
  Maximize2,
  Megaphone,
  Scale,
  X,
} from "lucide-react"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import type { TipoTerminos } from "@/lib/auth/compuertas"
import { cn } from "@/lib/utils"

import type { DocumentoPorAceptar } from "../presentacion"
import { CAMPOS_ACEPTACION } from "../schemas"

/** Documento con su texto ya pintado en el servidor (`VistaMarkdown`). */
export interface DocumentoConTexto extends DocumentoPorAceptar {
  texto: ReactNode
}

function IconoDocumento({ tipo }: { tipo: TipoTerminos }) {
  switch (tipo) {
    case "TERMINOS_MEDIO":
      return <Megaphone className="size-5" aria-hidden />
    case "TERMINOS_ANUNCIANTE":
      return <FileText className="size-5" aria-hidden />
    case "POLITICA_DATOS":
      return <Fingerprint className="size-5" aria-hidden />
    case "CONDICIONES_COMERCIALES":
      return <Scale className="size-5" aria-hidden />
  }
}

/**
 * ¿Se ve el final del texto? Mientras no, el borde inferior se desvanece para
 * indicar que hay más. ResizeObserver mide al empezar a observar (y si cambia
 * el tamaño); el desplazamiento vuelve a medir.
 */
function useFinVisible() {
  const ref = useRef<HTMLDivElement>(null)
  const [alFinal, setAlFinal] = useState(false)
  const medir = useCallback(() => {
    const zona = ref.current
    if (!zona) return
    setAlFinal(zona.scrollTop + zona.clientHeight >= zona.scrollHeight - 4)
  }, [])
  useEffect(() => {
    const zona = ref.current
    if (!zona || typeof ResizeObserver === "undefined") return
    const observador = new ResizeObserver(medir)
    observador.observe(zona)
    return () => observador.disconnect()
  }, [medir])
  return { ref, alFinal, medir }
}

/** Desvanece los últimos 2,5 rem visibles (no depende del color de fondo). */
const DESVANECIDO =
  "[mask-image:linear-gradient(to_bottom,#000_calc(100%-2.5rem),transparent)]"

interface DocumentoTerminosProps {
  documento: DocumentoConTexto
  marcado: boolean
  onMarcado: (marcado: boolean) => void
  error?: string
  /** La casilla, para llevar el foco al primer documento sin aceptar. */
  refCasilla: (casilla: HTMLElement | null) => void
}

/**
 * Un documento por aceptar: qué es, su versión y vigencia, el texto completo
 * (en un recuadro desplazable o a pantalla completa) y la casilla explícita
 * con la que la persona lo acepta.
 */
export function DocumentoTerminos({
  documento,
  marcado,
  onMarcado,
  error,
  refCasilla,
}: DocumentoTerminosProps) {
  const id = useId()
  const idTitulo = `${id}-titulo`
  const idError = `${id}-error`
  const { ref, alFinal, medir } = useFinVisible()

  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        "overflow-hidden rounded-2xl border bg-card/70 shadow-xs transition-colors duration-200",
        marcado && "border-primary/40",
        error && "border-destructive/50"
      )}
    >
      <header className="flex items-start gap-3 px-4 pt-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <IconoDocumento tipo={documento.tipo} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2
            id={idTitulo}
            className="font-heading text-base leading-snug font-semibold text-balance"
          >
            {documento.titulo}
          </h2>
          <p className="text-xs text-muted-foreground">{documento.vigencia}</p>
          {documento.actualizado || marcado ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {documento.actualizado ? (
                <Badge variant="secondary">Versión nueva</Badge>
              ) : null}
              {marcado ? (
                <Badge variant="outline" className="border-primary/40">
                  <CircleCheck data-icon="inline-start" aria-hidden />
                  Aceptado
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <p className="px-4 pt-3 text-sm text-muted-foreground">
        {documento.resumen}
      </p>

      <div className="mt-3 border-y bg-background/50">
        <div
          ref={ref}
          role="region"
          aria-label={`Texto de ${documento.titulo}`}
          tabIndex={0}
          onScroll={medir}
          className={cn(
            "max-h-56 overflow-y-auto overscroll-contain px-4 py-3 outline-none focus-visible:anillo-foco",
            !alFinal && DESVANECIDO
          )}
        >
          {documento.texto}
        </div>
      </div>

      <div className="flex flex-col gap-1 p-2">
        <LecturaCompleta
          documento={documento}
          marcado={marcado}
          onAceptar={() => onMarcado(true)}
        />
        <label
          className={cn(
            "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors select-none hover:bg-muted/60",
            "has-data-checked:bg-primary/8 dark:has-data-checked:bg-primary/12"
          )}
        >
          <Checkbox
            ref={refCasilla}
            name={CAMPOS_ACEPTACION.aceptada}
            value={documento.id}
            checked={marcado}
            onCheckedChange={(valor) => onMarcado(valor === true)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? idError : undefined}
            className="mt-0.5 size-[1.125rem]"
          />
          <span className="text-sm leading-snug font-medium">
            {documento.aceptacion}
          </span>
        </label>
        {error ? (
          <p id={idError} className="px-2.5 pb-1 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  )
}

/**
 * El texto a pantalla completa (hoja inferior): en el celular el recuadro se
 * queda corto para leer un documento legal. Desde ahí también se acepta.
 */
function LecturaCompleta({
  documento,
  marcado,
  onAceptar,
}: {
  documento: DocumentoConTexto
  marcado: boolean
  onAceptar: () => void
}) {
  const [abierta, setAbierta] = useState(false)

  return (
    <Sheet open={abierta} onOpenChange={setAbierta}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="h-10 justify-start self-start px-2.5 text-primary"
          />
        }
      >
        <Maximize2 data-icon="inline-start" aria-hidden />
        Leer en pantalla completa
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto h-[min(92dvh,56rem)] w-full max-w-2xl gap-0 rounded-t-2xl"
      >
        <SheetHeader className="flex-row items-start gap-3 border-b px-5 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <IconoDocumento tipo={documento.tipo} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <SheetTitle className="text-base font-semibold">
              {documento.titulo}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {documento.vigencia}
            </SheetDescription>
          </div>
          <SheetClose
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Cerrar" />
            }
          >
            <X aria-hidden />
          </SheetClose>
        </SheetHeader>
        <div
          role="region"
          aria-label={`Texto de ${documento.titulo}`}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 outline-none focus-visible:anillo-foco"
        >
          {documento.texto}
        </div>
        <SheetFooter className="border-t px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {marcado ? (
            <SheetClose
              render={
                <Button variant="outline" size="lg" className="h-11 w-full" />
              }
            >
              Cerrar
            </SheetClose>
          ) : (
            <Button
              type="button"
              size="lg"
              className="h-11 w-full"
              onClick={() => {
                onAceptar()
                setAbierta(false)
              }}
            >
              <CircleCheck data-icon="inline-start" aria-hidden />
              {documento.accion}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
