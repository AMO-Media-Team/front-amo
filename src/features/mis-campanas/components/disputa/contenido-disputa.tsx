import { Info, Lock, Scale } from "lucide-react"
import type { ReactNode } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EstadoDisputa } from "@/features/disputas/components/estado-disputa"
import { HiloDisputa } from "@/features/disputas/components/hilo-disputa"
import type { ContextoDisputa } from "@/features/disputas/presentacion"
import type { MensajeDisputa } from "@/features/disputas/tipos"

import {
  type PerspectivaParte,
  SIN_PERMISO_DISPUTA,
  tituloSinPermiso,
  type VistaDisputa,
} from "../../disputa"
import { DisputasAnteriores } from "./disputas-anteriores"

export interface ContenidoDisputaProps {
  vista: VistaDisputa
  perspectiva: PerspectivaParte
  /** Hilo de la disputa vigente (abierta o la última cerrada). */
  mensajes: readonly MensajeDisputa[]
  contexto: ContextoDisputa
  /**
   * `disputas.abrir`: la parte abre una y responde mientras siga abierta. Sin
   * él, lo lee todo y se le dice por qué no puede escribir.
   */
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
 * Sin `disputas.abrir`, en lugar del formulario dice que su rol no lo permite
 * y, junto a una abierta, que la conversación es de solo lectura.
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
      return puedeEscribir ? (
        <DisputasAnteriores
          disputas={vista.anteriores}
          perspectiva={perspectiva}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <EstadoVacio
            icono={Lock}
            titulo={tituloSinPermiso(vista.modo)}
            descripcion={SIN_PERMISO_DISPUTA.descripcion}
            className="flex-none py-12"
          >
            {volver}
          </EstadoVacio>
          <DisputasAnteriores
            disputas={vista.anteriores}
            perspectiva={perspectiva}
          />
        </div>
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
          {vista.tipo === "abierta" && !puedeEscribir ? (
            <p className="flex items-start gap-2 text-sm text-pretty text-muted-foreground">
              <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
              {SIN_PERMISO_DISPUTA.lectura}
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
