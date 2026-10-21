"use client"

import { AnimatePresence, useReducedMotion } from "motion/react"
import * as m from "motion/react-m"
import { useId } from "react"

import { EASE_SUAVE } from "@/components/motion/aparecer"
import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

import type { MetricaGeo } from "../metricas"
import {
  CuerpoDetalle,
  type DatosDetalle,
  EncabezadoDetalle,
  PieDetalle,
} from "./detalle-zona"
import { CLASE_ALTO_HOJA_DETALLE, CLASE_PANEL } from "./lienzo"

export interface PropsPanelDetalle {
  datos: DatosDetalle | null
  onCerrar: () => void
  onExplorar: () => void
  onCambiarMetrica: (metrica: MetricaGeo) => void
  onReintentar: () => void
  className?: string
}

/** Detalle de la zona en un panel flotante a la derecha (escritorio). */
export function PanelDetalleLateral({
  datos,
  onCerrar,
  onExplorar,
  onCambiarMetrica,
  onReintentar,
  className,
}: PropsPanelDetalle) {
  const reducido = useReducedMotion()
  const tituloId = useId()

  return (
    <AnimatePresence initial={false}>
      {datos ? (
        <m.aside
          key="detalle"
          aria-labelledby={tituloId}
          initial={{ opacity: 0, x: reducido ? 0 : 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: reducido ? 0 : 20 }}
          transition={{ duration: 0.32, ease: EASE_SUAVE }}
          className={cn(
            CLASE_PANEL,
            "flex max-h-full min-h-0 w-[22rem] flex-col overflow-hidden",
            className
          )}
        >
          <div className="border-b border-foreground/8 px-4 pt-4 pb-3">
            <EncabezadoDetalle
              datos={datos}
              onCerrar={onCerrar}
              tituloId={tituloId}
            />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div
              key={datos.codigo}
              className="animate-aparecer-arriba px-4 py-4"
            >
              <CuerpoDetalle
                datos={datos}
                onCambiarMetrica={onCambiarMetrica}
                onReintentar={onReintentar}
              />
            </div>
          </ScrollArea>
          {/* Sin acción ni nota, PieDetalle no pinta nada y el borde se oculta. */}
          <div className="border-t border-foreground/8 p-3 empty:hidden">
            <PieDetalle datos={datos} onExplorar={onExplorar} />
          </div>
        </m.aside>
      ) : null}
    </AnimatePresence>
  )
}

/**
 * Detalle en una hoja inferior (móvil y tableta). No es modal: con la hoja
 * abierta se puede tocar otra zona y el contenido cambia sin cerrarla. La
 * acción principal va arriba, visible sin desplazarse.
 */
export function HojaDetalle({
  datos,
  onCerrar,
  onExplorar,
  onCambiarMetrica,
  onReintentar,
}: PropsPanelDetalle) {
  const tituloId = useId()
  return (
    <Drawer
      open={datos !== null}
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar()
      }}
      modal={false}
    >
      <DrawerContent
        aria-labelledby={tituloId}
        className={cn(
          "mx-auto max-w-xl vidrio border-x-0 shadow-[0_-16px_48px_-20px_rgb(0_0_0/0.5)] sm:rounded-t-2xl",
          CLASE_ALTO_HOJA_DETALLE
        )}
      >
        <span
          aria-hidden
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-foreground/20"
        />
        {datos ? (
          <>
            <div className="flex flex-col gap-3 px-4 pt-2 pb-3">
              <EncabezadoDetalle
                datos={datos}
                onCerrar={onCerrar}
                tituloId={tituloId}
              />
              <div className="empty:hidden">
                <PieDetalle datos={datos} onExplorar={onExplorar} />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-foreground/8 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div key={datos.codigo} className="animate-aparecer-arriba">
                <CuerpoDetalle
                  datos={datos}
                  onCambiarMetrica={onCambiarMetrica}
                  onReintentar={onReintentar}
                />
              </div>
            </div>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}
