"use client"

import { Eye, FileJson, FileSpreadsheet, UserSearch } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

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
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import { formatearNumero } from "@/lib/format"
import type { Json } from "@/types/database.types"

import { consultarDatosTitular } from "../actions"
import {
  conteosDatosTitular,
  type DatosTitular,
  leerDatosTitular,
  seccionesDatosTitular,
} from "../exportacion"
import { textoRadicado } from "../presentacion"
import {
  descargarDatosTitular,
  type FormatoDatos,
  NOMBRES_FORMATO,
} from "./descarga-datos"

/**
 * «Ver datos del titular» para atender una consulta (art. 14): el servidor
 * llama a `datos_titular` con la sesión (queda `EXPORTAR` en la bitácora) y
 * el diálogo muestra el resumen; las listas completas van en la descarga
 * (JSON o Excel), que reutiliza lo ya consultado.
 */
export function VerDatosTitular({
  solicitud,
  titular,
}: {
  solicitud: { id: string; numero: number }
  /** Nombre del titular (para el archivo); `null` si ya no tiene cuenta. */
  titular: string | null
}) {
  const [cargando, iniciar] = useTransition()
  const [datos, setDatos] = useState<{
    crudos: Json
    leidos: DatosTitular
  } | null>(null)
  const [descargando, setDescargando] = useState<FormatoDatos | null>(null)

  function consultar() {
    iniciar(async () => {
      const respuesta = await consultarDatosTitular({
        solicitudId: solicitud.id,
      })
      if (!respuesta.ok) {
        toast.error(respuesta.error)
        return
      }
      const leidos = leerDatosTitular(respuesta.datos)
      if (!leidos) {
        toast.error("Los datos del titular llegaron con una forma inesperada.")
        return
      }
      setDatos({ crudos: respuesta.datos, leidos })
    })
  }

  async function descargar(formato: FormatoDatos) {
    if (!datos) return
    setDescargando(formato)
    try {
      await descargarDatosTitular(datos.crudos, formato, {
        titular: titular ?? undefined,
        base: `datos titular solicitud ${solicitud.numero}`,
      })
    } catch {
      toast.error(`No pudimos generar el ${NOMBRES_FORMATO[formato]}.`)
    } finally {
      setDescargando(null)
    }
  }

  return (
    <TarjetaFicha
      titulo="Datos del titular"
      icono={UserSearch}
      descripcion="Lo que AMO trata de esta persona, para atender una consulta. Queda en la bitácora."
    >
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={cargando || titular === null}
        aria-busy={cargando || undefined}
        onClick={consultar}
      >
        {cargando ? (
          <Spinner role={undefined} aria-hidden data-icon="inline-start" />
        ) : (
          <Eye data-icon="inline-start" aria-hidden />
        )}
        Ver datos del titular
      </Button>
      {titular === null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          El titular ya no tiene cuenta.
        </p>
      ) : null}

      <Dialog
        open={datos !== null}
        onOpenChange={(abrir) => {
          if (!abrir) setDatos(null)
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Datos del titular</DialogTitle>
            <DialogDescription>
              Solicitud {textoRadicado(solicitud.numero)}. La cuenta de pago y
              el documento se muestran resumidos.
            </DialogDescription>
          </DialogHeader>
          {datos ? (
            <div className="flex flex-col gap-5">
              {seccionesDatosTitular(datos.leidos, { interno: true }).map(
                (seccion) => (
                  <section
                    key={seccion.titulo}
                    aria-label={seccion.titulo}
                    className="flex flex-col gap-2"
                  >
                    <h3 className="text-sm font-semibold">{seccion.titulo}</h3>
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      {seccion.filas.map((fila) => (
                        <div key={fila.dato} className="flex min-w-0 flex-col">
                          <dt className="text-xs text-muted-foreground">
                            {fila.dato}
                          </dt>
                          <dd className="break-words">{fila.valor}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )
              )}
              <section aria-label="Registros" className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Registros</h3>
                <ul className="grid gap-2 text-sm sm:grid-cols-2">
                  {conteosDatosTitular(datos.leidos).map((conteo) => (
                    <li
                      key={conteo.etiqueta}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                    >
                      <span className="text-muted-foreground">
                        {conteo.etiqueta}
                      </span>
                      <span className="font-medium cifras">
                        {formatearNumero(conteo.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}
          <DialogFooter>
            {(["xlsx", "json"] as const).map((formato) => {
              const Icono = formato === "xlsx" ? FileSpreadsheet : FileJson
              return (
                <Button
                  key={formato}
                  type="button"
                  variant={formato === "xlsx" ? "default" : "outline"}
                  disabled={descargando !== null}
                  aria-busy={descargando === formato || undefined}
                  onClick={() => void descargar(formato)}
                >
                  {descargando === formato ? (
                    <Spinner
                      role={undefined}
                      aria-hidden
                      data-icon="inline-start"
                    />
                  ) : (
                    <Icono data-icon="inline-start" aria-hidden />
                  )}
                  Descargar en {NOMBRES_FORMATO[formato]}
                </Button>
              )
            })}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TarjetaFicha>
  )
}
