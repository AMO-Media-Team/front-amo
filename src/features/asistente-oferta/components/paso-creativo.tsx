"use client"

import { CircleCheck, CircleDashed, FileWarning } from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PanelCreativo } from "@/features/creativos/components/panel-creativo"
import type { EstadoCreativo } from "@/features/creativos/tipos"
import { cn } from "@/lib/utils"

import { nombreFormato } from "../formatos"
import type { FormatoAsistente, OfertaEnCurso } from "../tipos"

export interface PropsPasoCreativo {
  ofertas: readonly OfertaEnCurso[]
  formatos: readonly FormatoAsistente[]
  creativos: Readonly<Record<string, EstadoCreativo>>
  /** Una función estable por oferta (el panel la puede usar en un efecto). */
  alCambiar: (ofertaId: string) => (estado: EstadoCreativo) => void
  /** Oferta a la vista (la que la BD señaló al enviar, por ejemplo). */
  pestana: string | null
  onPestana: (ofertaId: string) => void
}

const EDITABLES = new Set(["BORRADOR", "DEVUELTA"])

function EstadoPaquete({ estado }: { estado: EstadoCreativo | undefined }) {
  return estado?.listo ? (
    <>
      <CircleCheck aria-hidden className="size-4 text-success" />
      <span className="sr-only">(paquete listo)</span>
    </>
  ) : (
    <>
      <CircleDashed aria-hidden className="size-4 text-muted-foreground" />
      <span className="sr-only">(falta el paquete)</span>
    </>
  )
}

/**
 * El panel de creativos (paquete CR) muestra los requisitos del formato y,
 * si la oferta ya no es editable, la versión vigente y por qué.
 */
function PanelOferta({
  oferta,
  formato,
  alCambiar,
}: {
  oferta: OfertaEnCurso
  formato: FormatoAsistente
  alCambiar: (estado: EstadoCreativo) => void
}) {
  return (
    <PanelCreativo
      ofertaId={oferta.ofertaId}
      formato={formato}
      editable={EDITABLES.has(oferta.estado)}
      alCambiar={alCambiar}
    />
  )
}

/**
 * Paso 5 · Paquete creativo (ANU-008): el panel de creativos de cada oferta
 * creada (una pestaña por formato). Los originales se suben sin recomprimir y
 * se validan contra los requisitos del formato; el asistente solo sabe si
 * cada paquete está listo para mostrarlo en la revisión.
 */
export function PasoCreativo({
  ofertas,
  formatos,
  creativos,
  alCambiar,
  pestana,
  onPestana,
}: PropsPasoCreativo) {
  const conFormato = ofertas.flatMap((oferta) => {
    const formato = formatos.find((f) => f.id === oferta.formatoId)
    return formato ? [{ oferta, formato }] : []
  })

  if (conFormato.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <FileWarning aria-hidden className="mt-0.5 size-4 shrink-0" />
        Guarda primero la oferta (paso «Cuánto») para cargar su paquete
        creativo.
      </div>
    )
  }

  if (conFormato.length === 1) {
    const [{ oferta, formato }] = conFormato
    return (
      <section
        aria-label={nombreFormato(formato)}
        className="flex flex-col gap-3"
      >
        <h3 className="flex items-center gap-2 text-base font-semibold">
          {nombreFormato(formato)}
          <EstadoPaquete estado={creativos[oferta.ofertaId]} />
        </h3>
        <PanelOferta
          oferta={oferta}
          formato={formato}
          alCambiar={alCambiar(oferta.ofertaId)}
        />
      </section>
    )
  }

  const activa =
    pestana && conFormato.some(({ oferta }) => oferta.ofertaId === pestana)
      ? pestana
      : conFormato[0].oferta.ofertaId

  return (
    <Tabs
      value={activa}
      onValueChange={(valor) => onPestana(String(valor))}
      className="gap-4"
    >
      <TabsList
        aria-label="Ofertas de este asistente"
        className="h-auto w-full flex-wrap justify-start gap-1"
      >
        {conFormato.map(({ oferta, formato }) => (
          <TabsTrigger
            key={oferta.ofertaId}
            value={oferta.ofertaId}
            className={cn("h-9 flex-none px-3")}
          >
            {nombreFormato(formato)}{" "}
            <EstadoPaquete estado={creativos[oferta.ofertaId]} />
          </TabsTrigger>
        ))}
      </TabsList>
      {conFormato.map(({ oferta, formato }) => (
        <TabsContent key={oferta.ofertaId} value={oferta.ofertaId} keepMounted>
          <PanelOferta
            oferta={oferta}
            formato={formato}
            alCambiar={alCambiar(oferta.ofertaId)}
          />
        </TabsContent>
      ))}
    </Tabs>
  )
}
