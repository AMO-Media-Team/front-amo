"use client"

import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Globe,
  LockKeyhole,
  Monitor,
  ShieldAlert,
  X,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatearFechaHora, formatearRelativo } from "@/lib/format"
import { cn } from "@/lib/utils"

import { ORIGENES } from "../catalogo"
import type { ModoCambios } from "../diferencias"
import type { EventoBitacora } from "../tipos"
import {
  AvatarActor,
  IconoAccion,
  InsigniaOrigen,
  InsigniaTono,
} from "./distintivos"
import { Valor, VisorDiferencias } from "./visor-diferencias"

const TITULOS_CAMBIOS: Readonly<Record<ModoCambios, string>> = {
  diferencias: "Cambios",
  creacion: "Datos creados",
  eliminacion: "Datos eliminados",
  datos: "Datos registrados",
  sin_cambios: "Cambios",
}

function Seccion({
  titulo,
  accesorio,
  children,
}: {
  titulo: string
  accesorio?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          {titulo}
        </h3>
        {accesorio}
      </div>
      {children}
    </section>
  )
}

function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

function BotonCopiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1600)
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano.")
    }
  }
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={etiqueta}
      title={etiqueta}
      onClick={copiar}
    >
      {copiado ? (
        <Check aria-hidden className="text-success" />
      ) : (
        <Copy aria-hidden />
      )}
    </Button>
  )
}

function Transicion({ evento }: { evento: EventoBitacora }) {
  if (!evento.estadoAnterior || !evento.estadoNuevo) return null
  if (evento.estadoAnterior === evento.estadoNuevo) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3.5 py-3">
      <span className="text-xs text-muted-foreground">Estado</span>
      <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground">
        {evento.estadoAnterior}
      </span>
      <ArrowRight className="size-3.5 text-muted-foreground" aria-label="a" />
      <span className="inline-flex h-6 items-center rounded-full bg-primary/12 px-2.5 text-xs font-medium text-primary">
        {evento.estadoNuevo}
      </span>
    </div>
  )
}

function Contexto({ evento }: { evento: EventoBitacora }) {
  const { ubicacion } = evento
  const lugar = [ubicacion.ciudad, ubicacion.pais].filter(Boolean).join(", ")
  const agente = [ubicacion.navegador, ubicacion.sistemaOperativo]
    .filter(Boolean)
    .join(" · ")
  if (!ubicacion.ip && !lugar && !agente) {
    return (
      <p className="text-sm text-muted-foreground">
        {evento.origen === "APP"
          ? "La solicitud no trajo IP ni ubicación (por ejemplo, en desarrollo local)."
          : "Los eventos de la base de datos no tienen IP ni navegador."}
      </p>
    )
  }
  return (
    <dl className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-3.5 sm:grid-cols-2">
      <Dato etiqueta="IP">
        {ubicacion.ip ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[0.8125rem]">
            {ubicacion.ip.includes("•") ? (
              <LockKeyhole
                className="size-3.5 text-muted-foreground"
                aria-label="Enmascarada"
              />
            ) : null}
            {ubicacion.ip}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </Dato>
      <Dato etiqueta="Ubicación">
        <span className="inline-flex items-center gap-1.5">
          <Globe className="size-3.5 text-muted-foreground" aria-hidden />
          {lugar || <span className="text-muted-foreground">Desconocida</span>}
        </span>
      </Dato>
      <Dato etiqueta="Navegador y sistema">
        <span className="inline-flex items-center gap-1.5">
          <Monitor className="size-3.5 text-muted-foreground" aria-hidden />
          {agente || <span className="text-muted-foreground">Desconocido</span>}
        </span>
      </Dato>
    </dl>
  )
}

function Cuerpo({ evento }: { evento: EventoBitacora }) {
  const ruta = evento.ruta as Route | null
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Dato etiqueta="Actor">
          <span className="flex min-w-0 items-center gap-2.5">
            <AvatarActor actor={evento.actor} tamano="md" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">
                {evento.actor.nombre}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {evento.actor.esSistema
                  ? "Proceso automático"
                  : [evento.actor.rol, evento.actor.correo]
                      .filter(Boolean)
                      .join(" · ")}
              </span>
            </span>
          </span>
        </Dato>
        <Dato etiqueta="Entidad">
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 font-medium">
              {evento.nombreEntidad}
              {ruta ? (
                <Link
                  href={ruta}
                  className="inline-flex rounded text-primary hover:underline focus-visible:anillo-foco"
                  aria-label={`Abrir ${evento.nombreEntidad.toLowerCase()}`}
                >
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </span>
            {evento.entidadId ? (
              <span className="flex min-w-0 items-center gap-1">
                <span
                  className="truncate font-mono text-xs text-muted-foreground"
                  title={evento.entidadId}
                >
                  {evento.entidadId}
                </span>
                <BotonCopiar
                  texto={evento.entidadId}
                  etiqueta="Copiar el id de la entidad"
                />
              </span>
            ) : null}
          </span>
        </Dato>
        <Dato etiqueta="Fecha">
          <time dateTime={evento.at} className="cifras">
            {formatearFechaHora(evento.at)}
          </time>
        </Dato>
        <Dato etiqueta="Origen">
          <span className="flex flex-col gap-1">
            <InsigniaOrigen origen={evento.origen} />
            <span className="text-xs text-muted-foreground">
              {ORIGENES[evento.origen].descripcion}
            </span>
          </span>
        </Dato>
      </dl>

      <Transicion evento={evento} />

      {evento.motivo ? (
        <Seccion titulo="Motivo">
          <blockquote className="rounded-r-lg border-l-2 border-primary/60 bg-primary/5 px-3.5 py-2.5 text-sm">
            {evento.motivo}
          </blockquote>
        </Seccion>
      ) : null}

      {evento.cambios.modo !== "sin_cambios" ? (
        <Seccion
          titulo={TITULOS_CAMBIOS[evento.cambios.modo]}
          accesorio={
            <span className="text-xs text-muted-foreground">
              {evento.cambios.campos.length}{" "}
              {evento.cambios.campos.length === 1 ? "campo" : "campos"}
            </span>
          }
        >
          {evento.redactados ? (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <LockKeyhole className="mt-px size-3.5 shrink-0" aria-hidden />
              Los datos personales se guardan enmascarados o como huella: la
              bitácora nunca conserva el valor original.
            </p>
          ) : null}
          <VisorDiferencias cambios={evento.cambios} />
        </Seccion>
      ) : null}

      {evento.metadatos.length > 0 ? (
        <Seccion titulo="Detalles">
          <dl className="divide-y overflow-hidden rounded-xl border bg-card">
            {evento.metadatos.map((par) => (
              <div
                key={par.clave}
                className="grid gap-1 px-3.5 py-2.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-4"
              >
                <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">
                  {par.etiqueta}
                </dt>
                <dd className="min-w-0 text-sm">
                  <Valor valor={par.valor} />
                </dd>
              </div>
            ))}
          </dl>
        </Seccion>
      ) : null}

      <Seccion titulo="Contexto de la solicitud">
        <Contexto evento={evento} />
      </Seccion>
    </div>
  )
}

/** Panel lateral con todo lo registrado de un evento de la bitácora. */
export function PanelDetalleEvento({
  evento,
  abierto,
  onAbiertoChange,
}: {
  evento: EventoBitacora | null
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}) {
  async function copiarEnlace() {
    if (!evento) return
    const url = new URL(window.location.href)
    url.searchParams.set("evento", String(evento.id))
    try {
      await navigator.clipboard.writeText(url.toString())
      toast.success("Enlace copiado", { description: `Evento #${evento.id}` })
    } catch {
      toast.error("No se pudo copiar el enlace.")
    }
  }

  const ruta = evento?.ruta as Route | null | undefined

  return (
    <Sheet open={abierto && evento !== null} onOpenChange={onAbiertoChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        {evento ? (
          <>
            <SheetHeader className="flex-row items-start gap-3 border-b px-5 py-4">
              <IconoAccion
                accion={evento.accion}
                tono={evento.tono}
                tamano="lg"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    #{evento.id}
                  </span>
                  <InsigniaTono tono={evento.tono}>
                    {evento.etiquetaAccion}
                  </InsigniaTono>
                  {evento.sensible ? (
                    <InsigniaTono tono="aviso">
                      <ShieldAlert className="size-3" aria-hidden />
                      Sensible
                    </InsigniaTono>
                  ) : null}
                </div>
                <SheetTitle className="text-base leading-snug font-semibold">
                  {evento.titulo}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  <time dateTime={evento.at} suppressHydrationWarning>
                    {formatearRelativo(evento.at)}
                  </time>
                  {evento.resumen ? ` · ${evento.resumen}` : null}
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

            {/* Con `key`, otro evento empieza arriba y con los campos vacíos plegados. */}
            <Cuerpo key={evento.id} evento={evento} />

            <SheetFooter
              className={cn(
                "flex-row flex-wrap justify-end gap-2 border-t bg-muted/30 px-5 py-3",
                ruta && "justify-between"
              )}
            >
              {ruta ? (
                <EnlaceBoton variant="outline" href={ruta}>
                  {evento.textoRuta}
                  <ArrowRight data-icon="inline-end" aria-hidden />
                </EnlaceBoton>
              ) : null}
              <Button variant="ghost" onClick={copiarEnlace}>
                <Copy data-icon="inline-start" aria-hidden />
                Copiar enlace
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
