import { FileText, ScrollText } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { SeccionCuenta } from "@/features/cuenta/components/seccion-cuenta"
import { VistaMarkdown } from "@/features/configuracion/components/vista-markdown"
import { NOMBRES_TERMINOS } from "@/features/configuracion/presentacion"
import { formatearFechaHora } from "@/lib/format"

import type { AutorizacionPropia } from "../tipos"

/**
 * «Autorizaciones» (AUT-012, CTA-007): cada documento que el titular aceptó,
 * con su versión, la fecha y la IP enmascarada, y el texto exacto de esa
 * versión en un diálogo. Es la prueba de la autorización que también puede
 * pedir con una solicitud.
 */
export function Autorizaciones({
  autorizaciones,
}: {
  autorizaciones: AutorizacionPropia[]
}) {
  return (
    <SeccionCuenta
      id="autorizaciones"
      titulo="Autorizaciones"
      icono={ScrollText}
      descripcion="Los términos y la política de datos que aceptaste, con la versión y la fecha."
    >
      {autorizaciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tienes autorizaciones registradas. Las cuentas del equipo AMO no
          aceptan términos de anunciante ni de medio.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {autorizaciones.map((autorizacion) => {
            const documento = NOMBRES_TERMINOS[autorizacion.tipo].titulo
            return (
              <li
                key={autorizacion.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                  >
                    <FileText className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-sm font-medium text-pretty">
                      {documento}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Versión {autorizacion.version} · Aceptada el{" "}
                      <time dateTime={autorizacion.aceptadaAt}>
                        {formatearFechaHora(autorizacion.aceptadaAt)}
                      </time>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {autorizacion.ip
                        ? `Desde la IP ${autorizacion.ip}`
                        : "Sin IP registrada"}
                    </p>
                  </div>
                </div>
                {autorizacion.textoMd ? (
                  <Dialog>
                    <DialogTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                        />
                      }
                    >
                      Leer el texto{" "}
                      <span className="sr-only">
                        de {documento}, versión {autorizacion.version}
                      </span>
                    </DialogTrigger>
                    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>{documento}</DialogTitle>
                        <DialogDescription>
                          Versión {autorizacion.version}, aceptada el{" "}
                          {formatearFechaHora(autorizacion.aceptadaAt)}.
                        </DialogDescription>
                      </DialogHeader>
                      <VistaMarkdown
                        texto={autorizacion.textoMd}
                        className="text-[0.9375rem] sm:text-sm"
                      />
                    </DialogContent>
                  </Dialog>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </SeccionCuenta>
  )
}
