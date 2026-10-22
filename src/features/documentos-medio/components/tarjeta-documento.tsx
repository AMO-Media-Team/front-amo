"use client"

import { Eye, RefreshCw, TriangleAlert, Upload } from "lucide-react"
import { useCallback, useEffect, useId, useState } from "react"
import { toast } from "sonner"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { Button } from "@/components/ui/button"
import { InsigniaTono } from "@/features/operacion/components/distintivos"
import { cn } from "@/lib/utils"

import { FICHAS_DOCUMENTO } from "../catalogo"
import {
  type AccionDocumento,
  presentarSituacion,
  type Situacion,
  TEXTO_ACCION,
} from "../situacion"
import { lineaFechas } from "../textos"
import type { DocumentoCargado, TipoDocumentoMedio } from "../tipos"
import { AvisoPruebaVida, Nota, NotaRechazo } from "./avisos"
import { HojaCargarDocumento } from "./hoja-cargar-documento"
import { HojaVerDocumento } from "./hoja-ver-documento"
import { ICONOS_DOCUMENTO } from "./iconos"
import { useCargaDocumento } from "./use-carga-documento"

const ICONOS_ACCION: Readonly<Record<AccionDocumento, typeof Upload>> = {
  cargar: Upload,
  "cargar-de-nuevo": Upload,
  reemplazar: RefreshCw,
}

const BORDE_TONO = {
  peligro: "border-destructive/40",
  aviso: "border-warning/45",
} as const

/** Lo que el medio debe saber de este documento, debajo del título. */
function Notas({
  tipo,
  situacion,
}: {
  tipo: TipoDocumentoMedio
  situacion: Situacion
}) {
  switch (situacion.tipo) {
    case "falta":
      return tipo === "PRUEBA_VIDA" ? <AvisoPruebaVida compacto /> : null
    case "rechazado":
      return <NotaRechazo observaciones={situacion.documento.observaciones} />
    case "vencido":
      return (
        <Nota tono="aviso" icono={TriangleAlert}>
          Venció: carga uno vigente para conservar tu nivel.
        </Nota>
      )
    case "en-revision":
      return situacion.vigente ? (
        <Nota tono="info">
          Mientras revisamos el nuevo, sigue valiendo el que ya estaba
          aprobado.
        </Nota>
      ) : null
    case "aprobado":
      if (situacion.reemplazoRechazado) {
        return (
          <NotaRechazo
            titulo="Rechazamos tu reemplazo; sigue valiendo el aprobado"
            observaciones={situacion.reemplazoRechazado.observaciones}
          />
        )
      }
      return situacion.porVencer ? (
        <Nota tono="aviso" icono={TriangleAlert}>
          Carga uno vigente antes de que venza para no perder tu nivel.
        </Nota>
      ) : null
  }
}

export interface TarjetaDocumentoProps {
  tipo: TipoDocumentoMedio
  situacion: Situacion
  /** Avisa si hay una subida en curso (la lista evita desmontar la tarjeta). */
  onActividad: (tipo: TipoDocumentoMedio, activa: boolean) => void
}

/**
 * Un documento: qué es, su estado, fechas, motivo de rechazo o vigencia, y
 * las acciones de ver y cargar o reemplazar. La subida vive aquí: si la hoja
 * se cierra, el avance sigue visible en la tarjeta.
 */
export function TarjetaDocumento({
  tipo,
  situacion,
  onActividad,
}: TarjetaDocumentoProps) {
  const ficha = FICHAS_DOCUMENTO[tipo]
  const Icono = ICONOS_DOCUMENTO[tipo]
  const presentacion = presentarSituacion(situacion)
  const idTitulo = useId()
  const [hoja, setHoja] = useState<"cargar" | "ver" | null>(null)

  const alCompletar = useCallback(() => {
    setHoja(null)
    toast.success(`${ficha.titulo}: enviado a revisión`, {
      description: "Te avisaremos cuando el equipo AMO lo revise.",
    })
  }, [ficha.titulo])
  const carga = useCargaDocumento(tipo, alCompletar)
  const activa = carga.subida.activa

  useEffect(() => {
    onActividad(tipo, activa)
    return () => onActividad(tipo, false)
  }, [tipo, activa, onActividad])

  const documento =
    situacion.tipo !== "falta" && situacion.documento.metodo === "ARCHIVO"
      ? situacion.documento
      : null
  const fechas = lineaFechas(situacion)
  const accion = presentacion.accion
  const IconoAccion = accion ? ICONOS_ACCION[accion] : null
  // La prueba de vida es voluntaria: se ofrece sin empujarla como las demás.
  const destacar =
    presentacion.requiereAccion &&
    !(ficha.biometrico && situacion.tipo === "falta")
  const tonoBorde =
    presentacion.tono === "peligro" || presentacion.tono === "aviso"
      ? BORDE_TONO[presentacion.tono]
      : null

  return (
    <li>
      <article
        aria-labelledby={idTitulo}
        className={cn(
          "flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs",
          tonoBorde
        )}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
          >
            <Icono className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 id={idTitulo} className="text-sm font-semibold text-balance">
                {ficha.titulo}
              </h3>
              <InsigniaTono
                tono={presentacion.tono}
                etiqueta={presentacion.etiqueta}
                className="h-5 px-2 text-[0.6875rem]"
              />
            </div>
            <p className="text-xs text-pretty text-muted-foreground">
              {fechas ?? ficha.descripcion}
            </p>
          </div>
        </div>

        <Notas tipo={tipo} situacion={situacion} />

        {carga.elemento && hoja !== "cargar" ? (
          <ListaSubidas
            elementos={[carga.elemento]}
            etiqueta={`Subida de ${ficha.titulo.toLowerCase()}`}
            onReintentar={() => void carga.reintentar()}
            onCancelar={() => carga.subida.cancelar()}
            onQuitar={() => carga.descartar()}
          />
        ) : null}

        {documento || accion ? (
          <div className="flex flex-wrap justify-end gap-2">
            {documento ? (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => setHoja("ver")}
                aria-describedby={idTitulo}
              >
                <Eye data-icon="inline-start" aria-hidden />
                Ver
              </Button>
            ) : null}
            {accion && IconoAccion ? (
              <Button
                type="button"
                variant={destacar ? "default" : "outline"}
                size="lg"
                disabled={activa}
                onClick={() => setHoja("cargar")}
                aria-describedby={idTitulo}
              >
                <IconoAccion data-icon="inline-start" aria-hidden />
                {activa ? "Subiendo…" : TEXTO_ACCION[accion]}
              </Button>
            ) : null}
          </div>
        ) : null}
      </article>

      <HojaCargarDocumento
        tipo={tipo}
        situacion={situacion}
        carga={carga}
        abierta={hoja === "cargar"}
        onAbiertaChange={(abierta) => setHoja(abierta ? "cargar" : null)}
      />
      {documento ? (
        <HojaVerDocumento
          documento={documento}
          detalle={fechas}
          abierta={hoja === "ver"}
          onAbiertaChange={(abierta) => setHoja(abierta ? "ver" : null)}
        />
      ) : null}
    </li>
  )
}
