"use client"

import { ArrowRight, CircleSlash } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { PieAcciones } from "@/components/layout/pie-acciones"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { useAhora } from "@/components/tiempo/use-ahora"
import { Button } from "@/components/ui/button"
import { DialogoMotivo } from "@/features/usuarios/components/dialogo-motivo"
import { formatearFechaHora } from "@/lib/format"

import { desistirAsignacion } from "../actions"
import { SUGERENCIAS_DESISTIR } from "../presentacion"
import { TEXTO_BOTON_ACCION } from "../siguiente-accion"
import type { AccionMedio } from "../tipos"
import { ID_LO_QUE_SIGUE } from "./ids"
import { PlazoAccion } from "./paso-siguiente"

export interface AccionesAsignacionProps {
  asignacionId: string
  ofertaTitulo: string
  /** La acción que sigue (si el rol puede ejecutarla). */
  accion: AccionMedio | null
  /** Hasta cuándo puede desistir; `null` si ya no puede (o no tiene permiso). */
  desistirHasta: string | null
  ahoraServidor: number
}

/**
 * Pie fijo de la ficha (al alcance del pulgar): el botón de lo que sigue con
 * su plazo y, mientras se pueda, «Desistir» con motivo (MED-010). Al
 * desistir el pie desaparece: el foco pasa a «Lo que sigue», que ya cuenta
 * cómo quedó la campaña.
 */
export function AccionesAsignacion({
  asignacionId,
  ofertaTitulo,
  accion,
  desistirHasta,
  ahoraServidor,
}: AccionesAsignacionProps) {
  const ahora = useAhora(ahoraServidor)
  const [desistiendo, setDesistiendo] = useState(false)
  const desistio = useRef(false)
  // El diálogo sigue montado aunque, tras desistir, la página ya no ofrezca
  // desistir: así se cierra con normalidad y deja el foco en «Lo que sigue».
  const [plazoDesistir] = useState(desistirHasta)

  if (!accion && !desistirHasta && !plazoDesistir) return null

  return (
    <>
      {accion || desistirHasta ? (
        <PieAcciones
          etiqueta="Acciones de la campaña"
          nota={
            accion ? (
              <span className="flex flex-col gap-0.5">
                <span className="truncate text-xs text-muted-foreground">
                  {accion.etiquetaPlazo}
                </span>
                <PlazoAccion
                  accion={accion}
                  ahora={ahora}
                  ahoraServidor={ahoraServidor}
                  variante="texto"
                />
              </span>
            ) : desistirHasta ? (
              <span className="text-xs text-muted-foreground">
                Puedes desistir hasta el {formatearFechaHora(desistirHasta)}.
              </span>
            ) : null
          }
        >
          {desistirHasta ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setDesistiendo(true)}
            >
              <CircleSlash data-icon="inline-start" aria-hidden />
              Desistir
            </Button>
          ) : null}
          {accion ? (
            <EnlaceBoton href={accion.ruta}>
              {TEXTO_BOTON_ACCION[accion.tipo]}
              <ArrowRight data-icon="inline-end" aria-hidden />
            </EnlaceBoton>
          ) : null}
        </PieAcciones>
      ) : null}
      {plazoDesistir ? (
        <DialogoMotivo
          abierto={desistiendo}
          onAbiertoChange={setDesistiendo}
          titulo={`¿Desistir de «${ofertaTitulo}»?`}
          descripcion={`El cupo quedará libre para otro medio y ya no podrás publicar esta campaña. Puedes desistir hasta el ${formatearFechaHora(plazoDesistir)}, antes de descargar el contenido.`}
          textoConfirmar="Desistir"
          textoCancelar="Volver"
          destructivo
          etiqueta="¿Por qué desistes?"
          ayuda="Lo verá el equipo AMO. Nos ayuda a mejorar las ofertas que recibes."
          placeholder="Ej.: ya no tengo espacio para publicar en esas fechas."
          sugerencias={SUGERENCIAS_DESISTIR}
          focoAlCerrar={() =>
            desistio.current ? document.getElementById(ID_LO_QUE_SIGUE) : null
          }
          onConfirmar={async (motivo) => {
            const resultado = await desistirAsignacion({ asignacionId, motivo })
            if (resultado.ok) {
              desistio.current = true
              toast.success("Desististe de la campaña", {
                description: "El cupo quedó libre para otro medio.",
              })
            }
            return resultado
          }}
        />
      ) : null}
    </>
  )
}
