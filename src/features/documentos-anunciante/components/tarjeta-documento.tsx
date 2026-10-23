"use client"

import { Eye, RefreshCw, TriangleAlert, Upload } from "lucide-react"
import { useCallback, useEffect, useId, useState } from "react"
import { toast } from "sonner"

import { ListaSubidas } from "@/components/archivos/lista-subidas"
import { Button } from "@/components/ui/button"
import {
  Nota,
  NotaRechazo,
} from "@/features/documentos-medio/components/avisos"
import { InsigniaTono } from "@/features/operacion/components/distintivos"
import { cn } from "@/lib/utils"

import { fichaDocumento, type TipoDocumentoAnunciante } from "../catalogo"
import {
  type AccionDocumento,
  presentarSituacion,
  type Situacion,
  TEXTO_ACCION,
} from "../situacion"
import { lineaFechas, NOTA_DESACTUALIZADO } from "../textos"
import { HojaCargarDocumentoAnunciante } from "./hoja-cargar-documento"
import { HojaVerDocumentoAnunciante } from "./hoja-ver-documento"
import { ICONOS_DOCUMENTO_ANUNCIANTE } from "./iconos"
import { useCargaDocumentoAnunciante } from "./use-carga-documento"

const ICONOS_ACCION: Readonly<Record<AccionDocumento, typeof Upload>> = {
  cargar: Upload,
  "cargar-de-nuevo": Upload,
  reemplazar: RefreshCw,
}

const BORDE_TONO = {
  peligro: "border-destructive/40",
  aviso: "border-warning/45",
} as const

/** Lo que la empresa debe saber de este documento, debajo del título. */
function Notas({ situacion }: { situacion: Situacion }) {
  switch (situacion.tipo) {
    case "falta":
      return null
    case "rechazado":
      return <NotaRechazo observaciones={situacion.documento.observaciones} />
    case "vencido":
      return (
        <Nota tono="aviso" icono={TriangleAlert}>
          Venció: carga uno vigente para mantener tu empresa al día.
        </Nota>
      )
    case "desactualizado":
      return (
        <Nota tono="aviso" icono={TriangleAlert}>
          {NOTA_DESACTUALIZADO}
        </Nota>
      )
    case "en-revision":
      return situacion.vigente ? (
        <Nota tono="info">
          Mientras revisamos el nuevo, sigue valiendo el que ya estaba aprobado.
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
          Carga uno vigente antes de que venza.
        </Nota>
      ) : null
  }
}

export interface TarjetaDocumentoAnuncianteProps {
  tipo: TipoDocumentoAnunciante
  pais: string
  situacion: Situacion
  /** Lo exige la verificación (si no, «Opcional» y sin pedir atención). */
  exigido: boolean
  /** Avisa si hay una subida en curso (la lista evita salir sin querer). */
  onActividad: (tipo: TipoDocumentoAnunciante, activa: boolean) => void
}

/**
 * Un documento: qué es, su estado, fechas, motivo de rechazo o vigencia, y
 * las acciones de ver y cargar o reemplazar. La subida vive aquí: si la hoja
 * se cierra, el avance sigue visible en la tarjeta.
 */
export function TarjetaDocumentoAnunciante({
  tipo,
  pais,
  situacion,
  exigido,
  onActividad,
}: TarjetaDocumentoAnuncianteProps) {
  const ficha = fichaDocumento(tipo, pais)
  const Icono = ICONOS_DOCUMENTO_ANUNCIANTE[tipo]
  const presentacion = presentarSituacion(situacion, { exigido })
  const idTitulo = useId()
  const [hoja, setHoja] = useState<"cargar" | "ver" | null>(null)

  const alCompletar = useCallback(() => {
    setHoja(null)
    toast.success("Documento recibido", {
      description: `${ficha.titulo}: el equipo de AMO lo revisará y te avisaremos el resultado.`,
    })
  }, [ficha.titulo])
  const carga = useCargaDocumentoAnunciante(tipo, alCompletar)
  const activa = carga.subida.activa

  useEffect(() => {
    onActividad(tipo, activa)
    return () => onActividad(tipo, false)
  }, [tipo, activa, onActividad])

  const documento = situacion.tipo !== "falta" ? situacion.documento : null
  const fechas = lineaFechas(situacion)
  const { accion } = presentacion
  const IconoAccion = ICONOS_ACCION[accion]
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

        <Notas situacion={situacion} />

        {carga.elemento && hoja !== "cargar" ? (
          <ListaSubidas
            elementos={[carga.elemento]}
            etiqueta={`Subida de ${ficha.titulo}`}
            onReintentar={() => void carga.reintentar()}
            onCancelar={() => carga.subida.cancelar()}
            onQuitar={() => carga.descartar()}
          />
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 *:flex-1 sm:*:flex-none">
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
          <Button
            type="button"
            variant={presentacion.requiereAccion ? "default" : "outline"}
            size="lg"
            disabled={activa}
            onClick={() => setHoja("cargar")}
            aria-describedby={idTitulo}
          >
            <IconoAccion data-icon="inline-start" aria-hidden />
            {activa ? "Subiendo…" : TEXTO_ACCION[accion]}
          </Button>
        </div>
      </article>

      <HojaCargarDocumentoAnunciante
        tipo={tipo}
        pais={pais}
        situacion={situacion}
        carga={carga}
        abierta={hoja === "cargar"}
        onAbiertaChange={(abierta) => setHoja(abierta ? "cargar" : null)}
      />
      {documento ? (
        <HojaVerDocumentoAnunciante
          documento={documento}
          pais={pais}
          detalle={fechas}
          abierta={hoja === "ver"}
          onAbiertaChange={(abierta) => setHoja(abierta ? "ver" : null)}
        />
      ) : null}
    </li>
  )
}
