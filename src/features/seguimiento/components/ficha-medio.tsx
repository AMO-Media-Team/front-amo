"use client"

import { ExternalLink, RotateCcw, ShieldCheck, X } from "lucide-react"
import { type ReactNode, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  InsigniaNivel,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import { PLATAFORMAS, TIPOS_MEDIO } from "@/features/operacion/estados"
import { contar, formatearHandle } from "@/features/operacion/formato"
import { formatearNumero, formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import { consultarPerfilMedio } from "../actions"
import type {
  CuentaPublica,
  CuentaSeguimiento,
  MedioSeguimiento,
  PerfilMedio,
} from "../tipos"

type EstadoPerfil =
  | { tipo: "inicial" }
  | { tipo: "cargando" }
  | { tipo: "listo"; perfil: PerfilMedio | null }
  | { tipo: "error"; mensaje: string }

/** «Pasto, Nariño», «Bogotá, D.C.» o `null`. */
export function ubicacionMedio(
  medio: Pick<MedioSeguimiento, "municipio" | "departamento">
): string | null {
  const partes = [medio.municipio, medio.departamento].filter(Boolean)
  return partes.length > 0 ? partes.join(", ") : null
}

export function EnlaceCuenta({
  cuenta,
}: {
  cuenta: Pick<CuentaPublica, "plataforma" | "handle" | "url">
}) {
  const texto = cuenta.handle ? formatearHandle(cuenta.handle) : "Ver perfil"
  const contenido = (
    <>
      <MarcaPlataforma plataforma={cuenta.plataforma} />
      <span className="truncate">{texto}</span>
    </>
  )
  if (!cuenta.url) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        {contenido}
      </span>
    )
  }
  return (
    <a
      href={cuenta.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex min-w-0 items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline focus-visible:anillo-foco"
    >
      {contenido}
      <ExternalLink aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">
        {" "}
        (perfil de {PLATAFORMAS[cuenta.plataforma]}, abre en una pestaña nueva)
      </span>
    </a>
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
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

function textoCumplimiento(perfil: PerfilMedio): string {
  if (perfil.tasaCumplimiento === null || perfil.nCumplimiento === 0) {
    return "Aún sin historial suficiente"
  }
  return `${formatearPorcentaje(perfil.tasaCumplimiento, 0)} de ${contar(perfil.nCumplimiento, "negocio", "negocios")}`
}

function CuentasVerificadas({
  cuentas,
}: {
  cuentas: readonly CuentaPublica[]
}) {
  if (cuentas.length === 0) return null
  return (
    <section
      aria-labelledby="titulo-cuentas-medio"
      className="flex flex-col gap-2"
    >
      <h3 id="titulo-cuentas-medio" className="text-sm font-semibold">
        Cuentas verificadas por AMO
      </h3>
      <ul className="flex flex-col divide-y rounded-lg border">
        {cuentas.map((cuenta) => (
          <li
            key={`${cuenta.plataforma}-${cuenta.handle ?? cuenta.url ?? ""}`}
            className="flex flex-col gap-1 px-3 py-2.5 text-sm"
          >
            <EnlaceCuenta cuenta={cuenta} />
            <span className="text-xs cifras text-muted-foreground">
              {[
                cuenta.seguidores !== null
                  ? `${formatearNumero(cuenta.seguidores)} seguidores`
                  : null,
                cuenta.franja ? `Franja ${cuenta.franja}` : null,
                cuenta.alcanceMediano !== null
                  ? `Alcance mediano ${formatearNumero(cuenta.alcanceMediano)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function EsqueletoPerfil() {
  return (
    <div
      role="status"
      aria-label="Cargando el perfil"
      className="flex flex-col gap-3"
    >
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

/**
 * Nombre del medio que abre su ficha pública (ANU-011 c2): tipo, ubicación,
 * nivel, cumplimiento, publicaciones verificadas y cuentas. Nunca documentos,
 * contacto, datos bancarios ni lo que recibe el medio. El perfil se pide al
 * abrir; si la BD ya no lo entrega (p. ej. el medio desistió), se muestra lo
 * que trae la asignación.
 */
export function FichaMedio({
  medio,
  cuenta,
  className,
}: {
  medio: MedioSeguimiento
  /** La cuenta con la que aceptó en esta campaña. */
  cuenta: CuentaSeguimiento
  className?: string
}) {
  const [estado, setEstado] = useState<EstadoPerfil>({ tipo: "inicial" })
  const [, iniciar] = useTransition()

  function cargar() {
    setEstado({ tipo: "cargando" })
    iniciar(async () => {
      try {
        const resultado = await consultarPerfilMedio({ medioId: medio.id })
        setEstado(
          resultado.ok
            ? { tipo: "listo", perfil: resultado.datos }
            : { tipo: "error", mensaje: resultado.error }
        )
      } catch {
        setEstado({
          tipo: "error",
          mensaje: "No pudimos conectar con el servidor. Revisa tu conexión.",
        })
      }
    })
  }

  const perfil = estado.tipo === "listo" ? estado.perfil : null
  const ubicacion = ubicacionMedio(perfil ?? medio)

  return (
    <Dialog
      onOpenChange={(abierto) => {
        if (abierto && (estado.tipo === "inicial" || estado.tipo === "error")) {
          cargar()
        }
      }}
    >
      <DialogTrigger
        render={
          // El nombre abre la ficha: subrayado punteado como pista visual y
          // `aria-haspopup` (de Base UI) para los lectores de pantalla.
          <button
            type="button"
            title="Ver el perfil público del medio"
            className={cn(
              "max-w-full truncate rounded-sm text-left font-semibold underline decoration-muted-foreground/50 decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:anillo-foco",
              className
            )}
          />
        }
      >
        {medio.nombre}
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92vh] gap-4 overflow-y-auto sm:max-w-lg"
      >
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2"
              aria-label="Cerrar"
            />
          }
        >
          <X aria-hidden />
        </DialogClose>
        <DialogHeader className="pr-8">
          <DialogTitle>{medio.nombre}</DialogTitle>
          <DialogDescription>
            Perfil público del medio en AMO.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {perfil?.tipo ? (
            <Dato etiqueta="Tipo de medio">{TIPOS_MEDIO[perfil.tipo]}</Dato>
          ) : null}
          <Dato etiqueta="Ubicación">{ubicacion ?? "Sin municipio"}</Dato>
          <Dato etiqueta="Verificación">
            <InsigniaNivel nivel={perfil?.nivel ?? medio.nivel} />
          </Dato>
          {perfil ? (
            <>
              <Dato etiqueta="Cumplimiento">
                <span className="cifras">{textoCumplimiento(perfil)}</span>
              </Dato>
              <Dato etiqueta="Publicaciones verificadas">
                <span className="cifras">
                  {formatearNumero(perfil.publicacionesVerificadas)}
                </span>
              </Dato>
            </>
          ) : null}
        </dl>

        <section
          aria-labelledby="titulo-cuenta-campana"
          className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3"
        >
          <h3 id="titulo-cuenta-campana" className="text-sm font-semibold">
            Cuenta con la que aceptó en esta campaña
          </h3>
          <EnlaceCuenta cuenta={cuenta} />
          <p className="text-xs cifras text-muted-foreground">
            {[
              cuenta.seguidoresAlAceptar !== null
                ? `${formatearNumero(cuenta.seguidoresAlAceptar)} seguidores al aceptar`
                : null,
              cuenta.franja ? `Franja ${cuenta.franja}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Sin datos de alcance declarado"}
          </p>
        </section>

        {estado.tipo === "cargando" || estado.tipo === "inicial" ? (
          <EsqueletoPerfil />
        ) : estado.tipo === "error" ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/6 p-3 text-sm"
          >
            {estado.mensaje}
            <Button type="button" variant="outline" size="sm" onClick={cargar}>
              <RotateCcw data-icon="inline-start" aria-hidden />
              Reintentar
            </Button>
          </div>
        ) : perfil ? (
          <CuentasVerificadas cuentas={perfil.cuentas} />
        ) : (
          <p className="text-sm text-pretty text-muted-foreground">
            El perfil completo de este medio ya no está disponible para tu
            empresa.
          </p>
        )}

        <p className="flex items-start gap-2 text-xs text-pretty text-muted-foreground">
          <ShieldCheck
            aria-hidden
            className="mt-0.5 size-3.5 shrink-0 text-primary"
          />
          Por privacidad, AMO no comparte los documentos, los datos de contacto
          ni los datos bancarios de los medios, ni lo que reciben por tu pauta.
        </p>
      </DialogContent>
    </Dialog>
  )
}
