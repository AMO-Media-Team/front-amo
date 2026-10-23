import { Info, Scale } from "lucide-react"
import type { ReactNode } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EstadoDisputa } from "@/features/disputas/components/estado-disputa"
import { HiloDisputa } from "@/features/disputas/components/hilo-disputa"
import type { ContextoDisputa } from "@/features/disputas/presentacion"
import type { MensajeDisputa } from "@/features/disputas/tipos"

import type { PerspectivaParte, VistaDisputa } from "../../disputa"
import { DisputasAnteriores } from "./disputas-anteriores"

export interface ContenidoDisputaProps {
  vista: VistaDisputa
  perspectiva: PerspectivaParte
  /** Hilo de la disputa vigente (abierta o la última cerrada). */
  mensajes: readonly MensajeDisputa[]
  contexto: ContextoDisputa
  /** `disputas.abrir`: la parte responde mientras la disputa siga abierta. */
  puedeEscribir: boolean
  /** Nombre de la otra parte si fue ella quien la abrió. */
  autorApertura?: string
  /** Lo que la parte puede hacer a raíz de la disputa (junto a su estado). */
  accion?: ReactNode
  /** Regreso cuando no hay nada que ver ni abrir. */
  volver?: ReactNode
}

/**
 * Lo que el servidor sabe de la disputa de la asignación (sin el formulario,
 * que monta `PanelDisputa`): la abierta con su estado y su conversación; la
 * última cerrada con su resultado, el porqué de no poder abrir otra y su hilo
 * en solo lectura; o por qué no admite disputas. Las anteriores van debajo.
 */
export function ContenidoDisputa({
  vista,
  perspectiva,
  mensajes,
  contexto,
  puedeEscribir,
  autorApertura,
  accion,
  volver,
}: ContenidoDisputaProps) {
  switch (vista.tipo) {
    case "abrir":
      return (
        <DisputasAnteriores
          disputas={vista.anteriores}
          perspectiva={perspectiva}
        />
      )
    case "sin_disputa":
      return (
        <EstadoVacio
          icono={Scale}
          titulo="Esta publicación no admite disputas ahora"
          descripcion={vista.bloqueo}
          className="flex-none py-12"
        >
          {volver}
        </EstadoVacio>
      )
    case "abierta":
    case "cerrada":
      return (
        <div className="flex flex-col gap-5">
          <EstadoDisputa
            disputa={vista.disputa}
            perspectiva={perspectiva}
            contexto={contexto}
            accion={accion}
          />
          {vista.tipo === "cerrada" && vista.bloqueo ? (
            <p className="flex items-start gap-2 text-sm text-pretty text-muted-foreground">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {vista.bloqueo}
            </p>
          ) : null}
          <HiloDisputa
            disputa={vista.disputa}
            mensajes={mensajes}
            perspectiva={perspectiva}
            puedeEscribir={puedeEscribir}
            autorApertura={autorApertura}
          />
          <DisputasAnteriores
            disputas={vista.anteriores}
            perspectiva={perspectiva}
          />
        </div>
      )
  }
}
