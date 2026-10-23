"use client"

import {
  ArrowRight,
  Download,
  FileClock,
  PackageCheck,
  PackageX,
  RefreshCw,
  TimerOff,
} from "lucide-react"
import { useEffect, useId, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { PieAcciones } from "@/components/layout/pie-acciones"
import { CuentaRegresiva } from "@/components/tiempo/cuenta-regresiva"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatearFechaHora } from "@/lib/format"

import { descargarContenido } from "../actions"
import { resumenArchivos, type SituacionContenido } from "../contenido"
import { TEXTO_BOTON_ACCION } from "../siguiente-accion"
import type { AccionMedio, DescargaContenido, VersionContenido } from "../tipos"
import { ArchivosContenido } from "./archivos-contenido"
import { ID_CONTENIDO_DESCARGADO } from "./ids"
import { TextosContenido } from "./textos-contenido"

/** La última vez que descargó esa versión. */
function ultimaDescarga(
  descargas: readonly DescargaContenido[],
  version: VersionContenido
): DescargaContenido | null {
  return (
    descargas.findLast((descarga) => descarga.creativoId === version.id) ?? null
  )
}

function HistorialDescargas({
  descargas,
}: {
  descargas: readonly DescargaContenido[]
}) {
  if (descargas.length < 2) return null
  return (
    <details className="group rounded-xl border bg-muted/20 px-3 py-2 text-sm">
      <summary className="cursor-pointer rounded font-medium outline-none select-none focus-visible:anillo-foco">
        Descargas registradas ({descargas.length})
      </summary>
      <ol className="mt-2 flex flex-col gap-1.5">
        {[...descargas].reverse().map((descarga, indice) => (
          <li
            key={`${descarga.at}-${indice}`}
            className="flex flex-wrap justify-between gap-x-3 text-xs"
          >
            <span>
              {descarga.version !== null
                ? `Versión ${descarga.version}`
                : "Versión anterior"}
            </span>
            <time
              dateTime={descarga.at}
              className="cifras text-muted-foreground"
            >
              {formatearFechaHora(descarga.at)}
            </time>
          </li>
        ))}
      </ol>
    </details>
  )
}

/** La versión descargada: archivos para ver y guardar y el texto para copiar. */
function ContenidoDescargado({
  asignacionId,
  version,
  descargas,
  puedeEjecutar,
  enfocar,
}: {
  asignacionId: string
  version: VersionContenido
  descargas: readonly DescargaContenido[]
  puedeEjecutar: boolean
  /** Recién descargado: el título recibe el foco (el botón desapareció). */
  enfocar: boolean
}) {
  const titulo = useRef<HTMLHeadingElement>(null)
  const ultima = ultimaDescarga(descargas, version)

  useEffect(() => {
    if (enfocar) titulo.current?.focus()
  }, [enfocar])

  return (
    <section
      aria-labelledby={ID_CONTENIDO_DESCARGADO}
      className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5"
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-lg bg-success/12 text-success"
        >
          <PackageCheck className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            ref={titulo}
            id={ID_CONTENIDO_DESCARGADO}
            tabIndex={-1}
            className="w-fit rounded text-base font-semibold outline-none focus-visible:anillo-foco"
          >
            Tu contenido · versión {version.version}
          </h2>
          <p className="text-sm text-muted-foreground">
            {ultima ? (
              <>
                Descargaste esta versión el{" "}
                <time dateTime={ultima.at}>
                  {formatearFechaHora(ultima.at)}
                </time>
                .
              </>
            ) : (
              "Ya descargaste esta versión."
            )}{" "}
            Los archivos están en calidad original.
          </p>
        </div>
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {puedeEjecutar ? (
          <ArchivosContenido asignacionId={asignacionId} version={version} />
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Tu rol puede ver esta campaña, pero no descargar sus archivos.
          </p>
        )}
        <TextosContenido version={version} />
      </div>
      <HistorialDescargas descargas={descargas} />
    </section>
  )
}

export interface PanelContenidoProps {
  asignacionId: string
  situacion: SituacionContenido
  descargas: readonly DescargaContenido[]
  puedeEjecutar: boolean
  /** Lo que sigue tras descargar (publicar o corregir la evidencia), si toca. */
  siguiente: AccionMedio | null
  fechaLimitePublicacion: string
  ahoraServidor: number
}

/**
 * La entrega del contenido (MED-012). Antes de descargar: qué trae y el botón
 * «Descargar el contenido» en el pie (al alcance del pulgar), que registra
 * la descarga con su versión. Después: los archivos y el texto; si el
 * anunciante publicó una versión nueva, se destaca para descargarla antes de
 * publicar. Tras descargar, el foco pasa al contenido.
 */
export function PanelContenido({
  asignacionId,
  situacion,
  descargas,
  puedeEjecutar,
  siguiente,
  fechaLimitePublicacion,
  ahoraServidor,
}: PanelContenidoProps) {
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [enfocar, setEnfocar] = useState(false)
  const idError = useId()

  function descargar() {
    setError(null)
    iniciar(async () => {
      const resultado = await descargarContenido({ asignacionId })
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setEnfocar(true)
      toast.success(
        resultado.datos.version !== null
          ? `Descargaste la versión ${resultado.datos.version}`
          : "Descargaste el contenido",
        {
          description:
            "Ya puedes ver y guardar los archivos y copiar el texto.",
        }
      )
    })
  }

  const plazo = (
    <span className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">
        Publica a más tardar
      </span>
      <CuentaRegresiva
        venceAt={fechaLimitePublicacion}
        ahoraServidor={ahoraServidor}
        etiqueta="Publicación"
        variante="texto"
      />
    </span>
  )

  const mensajeError = error ? (
    <p id={idError} role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null

  // Una función que devuelve el botón (no un componente definido en el render).
  function botonDescargar(texto: string) {
    return (
      <Button
        type="button"
        onClick={descargar}
        disabled={pendiente}
        aria-describedby={error ? idError : undefined}
      >
        {pendiente ? (
          <Spinner aria-label="Descargando" data-icon="inline-start" />
        ) : (
          <Download data-icon="inline-start" aria-hidden />
        )}
        {texto}
      </Button>
    )
  }

  switch (situacion.tipo) {
    case "por_descargar":
      return (
        <>
          <section
            aria-labelledby="contenido-listo"
            className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-card p-4 sm:p-5"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"
              >
                <Download className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <h2 id="contenido-listo" className="text-base font-semibold">
                  Tu contenido está listo
                </h2>
                <p className="text-sm text-pretty text-muted-foreground">
                  Versión {situacion.vigente.version}:{" "}
                  {resumenArchivos(situacion.vigente.archivos)} y el texto de la
                  publicación. Al descargarlo queda registrado con la fecha, la
                  hora y la versión; después verás cada archivo en calidad
                  original, lo guardarás en tu celular y copiarás el texto con
                  un toque.
                </p>
              </div>
            </div>
            {puedeEjecutar ? null : (
              <p className="text-sm text-muted-foreground">
                Tu rol puede ver esta campaña, pero no descargar su contenido.
              </p>
            )}
            {mensajeError}
          </section>
          {puedeEjecutar ? (
            <PieAcciones etiqueta="Descargar el contenido" nota={plazo}>
              {botonDescargar("Descargar el contenido")}
            </PieAcciones>
          ) : null}
        </>
      )
    case "version_nueva": {
      const anterior = ultimaDescarga(descargas, situacion.descargada)
      return (
        <>
          <Alert className="border-warning/40 bg-warning/8">
            <RefreshCw className="text-warning" aria-hidden />
            <AlertTitle>Hay una versión nueva del contenido</AlertTitle>
            <AlertDescription>
              {`Descargaste la versión ${situacion.descargada.version}${anterior ? ` el ${formatearFechaHora(anterior.at)}` : ""}; el anunciante la actualizó a la versión ${situacion.vigente.version}. Descárgala antes de publicar: tu evidencia se revisa contra ella.`}
            </AlertDescription>
          </Alert>
          {mensajeError}
          {puedeEjecutar ? (
            <PieAcciones etiqueta="Descargar la versión nueva" nota={plazo}>
              {botonDescargar(
                `Descargar la versión ${situacion.vigente.version}`
              )}
            </PieAcciones>
          ) : null}
        </>
      )
    }
    case "al_dia":
    case "descargado":
      return (
        <>
          <ContenidoDescargado
            key={situacion.version.id}
            asignacionId={asignacionId}
            version={situacion.version}
            descargas={descargas}
            puedeEjecutar={puedeEjecutar}
            enfocar={enfocar}
          />
          {siguiente && puedeEjecutar ? (
            <PieAcciones etiqueta="Lo que sigue" nota={plazo}>
              <EnlaceBoton href={siguiente.ruta}>
                {TEXTO_BOTON_ACCION[siguiente.tipo]}
                <ArrowRight data-icon="inline-end" aria-hidden />
              </EnlaceBoton>
            </PieAcciones>
          ) : null}
        </>
      )
    case "fuera_de_plazo":
      return (
        <EstadoVacio
          icono={TimerOff}
          titulo="Venció el plazo para descargar"
          descripcion={`La fecha límite para publicar era el ${formatearFechaHora(fechaLimitePublicacion)}. Si crees que es un error, escríbele al equipo AMO.`}
          className="flex-none py-12"
        />
      )
    case "sin_creativo":
      return (
        <EstadoVacio
          icono={FileClock}
          titulo="El contenido aún no está listo"
          descripcion="El anunciante todavía no tiene una versión vigente. Te avisaremos cuando esté disponible."
          className="flex-none py-12"
        />
      )
    case "no_disponible":
      return (
        <EstadoVacio
          icono={PackageX}
          titulo="El contenido ya no está disponible"
          descripcion="Esta campaña terminó para ti: desististe, venció o se canceló."
          className="flex-none py-12"
        />
      )
  }
}
