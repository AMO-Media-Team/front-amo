import {
  FileCheck2,
  FileClock,
  FileText,
  FileWarning,
  FileX2,
} from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { formatearFecha, formatearFechaHora } from "@/lib/format"
import { cn } from "@/lib/utils"

import { avisoVencimiento } from "../calculos"
import { ESTADOS_DOCUMENTO, type EstadoDocumento } from "../estados"
import type { DocumentoMetadatos } from "../tipos"
import { InsigniaEstado } from "./distintivos"
import { TarjetaFicha } from "./ficha"

const ICONOS: Readonly<Record<EstadoDocumento, typeof FileText>> = {
  PENDIENTE: FileClock,
  APROBADO: FileCheck2,
  RECHAZADO: FileX2,
  VENCIDO: FileWarning,
}

function textoAviso(
  vencimiento: NonNullable<ReturnType<typeof avisoVencimiento>>
): string {
  switch (vencimiento.aviso) {
    case "vencido":
      return "Vencido"
    case "hoy":
      return "Vence hoy"
    case "manana":
      return "Vence mañana"
    case "pronto":
      return `Vence en ${vencimiento.dias} días`
  }
}

/**
 * Documentos de verificación: solo metadatos (tipo, estado, fechas y
 * observaciones de la revisión). El archivo y su ruta nunca llegan a esta
 * vista; se consultan en el flujo de verificación.
 */
export function ListaDocumentos({
  documentos,
  descripcion,
}: {
  documentos: readonly DocumentoMetadatos[]
  descripcion: string
}) {
  if (documentos.length === 0) {
    return (
      <TarjetaFicha
        titulo="Documentos"
        icono={FileText}
        descripcion={descripcion}
      >
        <EstadoVacio
          variante="simple"
          icono={FileText}
          titulo="Sin documentos cargados"
          descripcion="Los documentos que suba para su verificación aparecerán aquí."
          className="py-6"
        />
      </TarjetaFicha>
    )
  }
  const ahora = new Date()
  return (
    <TarjetaFicha
      titulo="Documentos"
      icono={FileText}
      descripcion={descripcion}
    >
      <ul className="-my-1 divide-y">
        {documentos.map((documento) => {
          const Icono = ICONOS[documento.estado]
          const vencimiento = avisoVencimiento(documento.venceAt, ahora)
          const aviso = vencimiento ? textoAviso(vencimiento) : null
          return (
            <li key={documento.id} className="flex items-start gap-3 py-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Icono aria-hidden className="size-4" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-medium">{documento.tipo}</span>
                  <InsigniaEstado
                    catalogo={ESTADOS_DOCUMENTO}
                    estado={documento.estado}
                    className="h-5 px-2 text-[0.6875rem]"
                  />
                  {aviso && documento.estado === "APROBADO" ? (
                    <span className="text-xs font-medium text-warning">
                      {aviso}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  <span title={formatearFechaHora(documento.subidoAt)}>
                    Subido el {formatearFecha(documento.subidoAt)}
                  </span>
                  {documento.validadoAt ? (
                    <span title={formatearFechaHora(documento.validadoAt)}>
                      {" "}
                      · revisado el {formatearFecha(documento.validadoAt)}
                    </span>
                  ) : null}
                  {documento.venceAt ? (
                    <span className={cn(aviso && "text-foreground")}>
                      {" "}
                      · {vencimiento?.aviso === "vencido"
                        ? "venció"
                        : "vence"}{" "}
                      el {formatearFecha(`${documento.venceAt}T12:00:00-05:00`)}
                    </span>
                  ) : null}
                </p>
                {documento.observaciones ? (
                  <p className="text-xs text-pretty text-muted-foreground">
                    <span className="font-medium text-foreground/80">
                      Observaciones:
                    </span>{" "}
                    {documento.observaciones}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </TarjetaFicha>
  )
}
