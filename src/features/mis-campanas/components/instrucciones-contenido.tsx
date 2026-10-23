import { BadgeCheck, ClipboardCheck, OctagonX } from "lucide-react"
import type { ReactNode } from "react"

import { condicionesOferta } from "@/features/marketplace/presentacion"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"

import type { AsignacionMedio, CondicionesOferta } from "../tipos"

function Apartado({
  titulo,
  icono,
  children,
}: {
  titulo: string
  icono: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {icono}
        {titulo}
      </h3>
      {children}
    </div>
  )
}

function TextoLibre({ valor, vacio }: { valor: string | null; vacio: string }) {
  return valor ? (
    <p className="text-sm text-pretty break-words whitespace-pre-wrap">
      {valor}
    </p>
  ) : (
    <p className="text-sm text-muted-foreground">{vacio}</p>
  )
}

/**
 * Lo que el medio lee ANTES de descargar (MED-012): las instrucciones y las
 * restricciones del anunciante y las condiciones de toda pauta (etiqueta de
 * publicidad, texto sin editar, permanencia, exclusividad y cortes).
 */
export function InstruccionesContenido({
  asignacion,
  condiciones,
}: {
  asignacion: Pick<
    AsignacionMedio,
    "permanenciaMinimaDias" | "cortesRequeridos"
  >
  condiciones: CondicionesOferta | null
}) {
  return (
    <TarjetaFicha
      titulo="Antes de publicar"
      icono={ClipboardCheck}
      descripcion="Léelo primero: la evidencia se revisa contra estas indicaciones."
    >
      <div className="flex flex-col gap-5">
        {condiciones ? (
          <>
            <Apartado
              titulo="Instrucciones del anunciante"
              icono={<BadgeCheck aria-hidden className="size-4 text-primary" />}
            >
              <TextoLibre
                valor={condiciones.instrucciones}
                vacio="El anunciante no dejó instrucciones adicionales."
              />
            </Apartado>
            <Apartado
              titulo="Restricciones"
              icono={
                <OctagonX aria-hidden className="size-4 text-destructive" />
              }
            >
              <TextoLibre
                valor={condiciones.restricciones}
                vacio="Sin restricciones adicionales."
              />
            </Apartado>
          </>
        ) : (
          <p
            role="status"
            className="rounded-lg border border-warning/40 bg-warning/8 px-3 py-2 text-sm text-pretty"
          >
            No pudimos cargar las instrucciones del anunciante. Actualiza la
            página antes de publicar.
          </p>
        )}
        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Condiciones de toda pauta</h3>
          <ul className="flex flex-col gap-3">
            {condicionesOferta({
              permanenciaDias: asignacion.permanenciaMinimaDias,
              exclusividadDias: condiciones?.exclusividadDias ?? null,
              cortes: asignacion.cortesRequeridos,
            }).map((condicion) => (
              <li key={condicion.clave} className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{condicion.titulo}</span>
                <span className="text-xs text-pretty text-muted-foreground">
                  {condicion.descripcion}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </TarjetaFicha>
  )
}
