"use client"

import { FileStack, Info } from "lucide-react"
import { useEffect, useEffectEvent } from "react"

import { EstadoError } from "@/components/feedback/estado-error"
import { EstadoVacio } from "@/components/feedback/estado-vacio"

import { nombreFormato } from "../formatos"
import { evaluarPaquete } from "../paquete"
import type { DatosCreativo, EstadoCreativo, FormatoOferta } from "../tipos"
import { useDatosCreativo } from "./consultas"
import { EditorCreativo } from "./editor-creativo"
import { EsqueletoCreativo } from "./esqueleto-creativo"
import { VisorCreativo } from "./visor-creativo"

export interface PropsPanelCreativo {
  ofertaId: string
  formato: FormatoOferta
  editable: boolean
  alCambiar?: (estado: EstadoCreativo) => void
}

/** Sin permiso o con la oferta en un estado que no lo admite: la vigente, para consultarla. */
function SoloLectura({
  datos,
  motivo,
  alCambiar,
}: {
  datos: DatosCreativo
  motivo: string | null
  alCambiar?: (estado: EstadoCreativo) => void
}) {
  const vigente = datos.vigente
  const estado = evaluarPaquete({
    formato: datos.formato,
    tipo: vigente?.tipo ?? null,
    archivos: vigente?.archivos ?? [],
  })
  const avisar = useEffectEvent((actual: EstadoCreativo) => alCambiar?.(actual))
  const firma = JSON.stringify(estado)
  useEffect(() => {
    avisar(JSON.parse(firma) as EstadoCreativo)
  }, [firma])

  return (
    <div className="flex flex-col gap-4">
      {motivo ? (
        <p className="flex items-start gap-2.5 rounded-lg border border-info/30 bg-info/6 px-3 py-2.5 text-sm text-pretty">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
          {motivo}
        </p>
      ) : null}
      {vigente ? (
        <VisorCreativo version={vigente} />
      ) : (
        <EstadoVacio
          variante="simple"
          icono={FileStack}
          titulo="Aún no hay paquete creativo"
          descripcion="Esta oferta todavía no tiene archivos ni textos para los medios."
        />
      )}
    </div>
  )
}

/**
 * Paquete creativo de UNA oferta (un formato): lo monta el asistente de oferta
 * en el paso «Paquete creativo», una pestaña por formato (el asistente pone el
 * título; la región se nombra «Paquete creativo: <formato>»). Lee la oferta con la
 * sesión (estado, formato vigente, topes de configuración) y, si se puede,
 * edita la versión editable; si no, muestra la vigente y explica por qué.
 * `alCambiar({ listo, archivos, faltan })` le dice al asistente qué falta.
 *
 * Mientras sube un archivo, desmontarlo cancela la subida: el asistente debe
 * mantener montadas las pestañas (`keepMounted`) o esperar a `listo`.
 */
export function PanelCreativo({
  ofertaId,
  formato,
  editable,
  alCambiar,
}: PropsPanelCreativo) {
  const consulta = useDatosCreativo(ofertaId)
  const datos = consulta.data
  const nombre = nombreFormato(datos?.formato ?? formato)

  return (
    <section
      aria-label={`Paquete creativo: ${nombre}`}
      className="flex min-w-0 flex-col gap-4"
    >
      {consulta.isPending ? (
        <EsqueletoCreativo />
      ) : consulta.isError || !datos ? (
        <EstadoError
          compacto
          nivelTitulo="h3"
          titulo="No pudimos cargar el paquete creativo"
          descripcion={consulta.error?.message}
          onReintentar={() => void consulta.refetch()}
        />
      ) : editable && !datos.bloqueo ? (
        <EditorCreativo datos={datos} alCambiar={alCambiar} />
      ) : (
        <SoloLectura
          datos={datos}
          motivo={datos.bloqueo}
          alCambiar={alCambiar}
        />
      )}
    </section>
  )
}
