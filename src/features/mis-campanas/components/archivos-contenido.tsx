"use client"

import { Download, Eye, FileStack } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { VisorArchivoFirmado } from "@/components/archivos/visor-archivo-firmado"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  describirArchivo,
  nombreArchivo,
} from "@/features/creativos/presentacion"
import { cn } from "@/lib/utils"

import { firmarArchivoContenido } from "../actions"
import type { ArchivoContenido, VersionContenido } from "../tipos"

/** Guarda un archivo en el celular: firma como adjunto y lo abre (no sale de la página). */
function BotonGuardar({
  asignacionId,
  archivo,
  nombre,
}: {
  asignacionId: string
  archivo: ArchivoContenido
  nombre: string
}) {
  const [guardando, iniciar] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={guardando}
      title={`Descargar ${nombre.toLocaleLowerCase("es-CO")}`}
      onClick={() =>
        iniciar(async () => {
          const resultado = await firmarArchivoContenido({
            asignacionId,
            archivoId: archivo.id,
            descargar: true,
          })
          if (!resultado.ok) {
            toast.error(resultado.error)
            return
          }
          window.location.assign(resultado.datos.url)
        })
      }
    >
      {guardando ? (
        <Spinner role={undefined} aria-hidden />
      ) : (
        <Download aria-hidden />
      )}
      <span className="sr-only">
        Descargar {nombre.toLocaleLowerCase("es-CO")}
      </span>
    </Button>
  )
}

/**
 * Los archivos de la versión descargada en calidad original (MED-012): el
 * elegido se ve en línea (imagen o video, con URL firmada de vida corta que
 * se renueva sola) y cada uno se guarda con un toque. Con varios, una lista
 * para pasar de uno a otro.
 */
export function ArchivosContenido({
  asignacionId,
  version,
}: {
  asignacionId: string
  version: VersionContenido
}) {
  const [elegido, setElegido] = useState(0)
  const total = version.archivos.length
  const indice = Math.min(elegido, Math.max(total - 1, 0))
  const archivo = version.archivos[indice]

  if (!archivo) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        <FileStack aria-hidden className="size-6" />
        Esta versión no trae archivos: publica con el texto de abajo.
      </div>
    )
  }

  const nombre = nombreArchivo(archivo, indice, total)
  return (
    <section
      aria-label="Archivos del contenido"
      className="flex flex-col gap-3"
    >
      <VisorArchivoFirmado
        key={archivo.id}
        firmar={() =>
          firmarArchivoContenido({ asignacionId, archivoId: archivo.id })
        }
        firmarDescarga={() =>
          firmarArchivoContenido({
            asignacionId,
            archivoId: archivo.id,
            descargar: true,
          })
        }
        nombre={nombre}
        tipo={archivo.mime}
        tamano={archivo.tamanoBytes}
        descripcion={`${nombre} del contenido, versión ${version.version}`}
      />
      {total > 1 ? (
        <>
          <ul
            aria-label={`Los ${total} archivos del contenido`}
            className="flex flex-col divide-y rounded-xl border"
          >
            {version.archivos.map((otro, posicion) => {
              const nombreOtro = nombreArchivo(otro, posicion, total)
              const activo = posicion === indice
              return (
                <li
                  key={otro.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2",
                    activo && "bg-primary/6"
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setElegido(posicion)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1 text-left outline-none focus-visible:anillo-foco"
                  >
                    <Eye
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0",
                        activo ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    <span className="flex min-w-0 flex-col">
                      {/* `aria-pressed` ya dice cuál se está mostrando. */}
                      <span className="text-sm font-medium">{nombreOtro}</span>
                      <span className="truncate text-xs cifras text-muted-foreground">
                        {describirArchivo(otro)}
                      </span>
                    </span>
                  </button>
                  <BotonGuardar
                    asignacionId={asignacionId}
                    archivo={otro}
                    nombre={nombreOtro}
                  />
                </li>
              )
            })}
          </ul>
          <p aria-live="polite" className="sr-only">
            {`Mostrando ${nombre.toLocaleLowerCase("es-CO")}.`}
          </p>
        </>
      ) : (
        <p className="text-xs cifras text-muted-foreground">
          {describirArchivo(archivo)}
        </p>
      )}
    </section>
  )
}
