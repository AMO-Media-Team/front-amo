import { History, TriangleAlert } from "lucide-react"
import { useId } from "react"

import { cn } from "@/lib/utils"

import {
  type AlertaMetrica,
  datosMotivo,
  type DatoMotivo,
  explicarMotivo,
  type MotivoAlerta,
  motivosAlerta,
  motivosAlertaPrevia,
  textoHistorial,
  TITULOS_ALERTA,
  tituloMotivo,
} from "../alertas"
import type { Plataforma } from "../estados"

function Comparacion({ datos }: { datos: readonly DatoMotivo[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 @lg:grid-cols-4">
      {datos.map((dato) => (
        <div key={dato.etiqueta} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{dato.etiqueta}</dt>
          <dd
            className={cn(
              "text-sm font-semibold cifras",
              dato.destacado && "text-warning"
            )}
          >
            {dato.valor}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function ListaMotivos({ motivos }: { motivos: readonly MotivoAlerta[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {motivos.map((motivo, indice) => {
        const datos = datosMotivo(motivo)
        return (
          <li key={`${motivo.tipo}-${indice}`} className="flex flex-col gap-2">
            <p className="text-sm font-medium">{tituloMotivo(motivo)}</p>
            <p className="text-sm text-pretty">{explicarMotivo(motivo)}</p>
            {datos.length > 0 ? <Comparacion datos={datos} /> : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Por qué la métrica tiene alerta (ADM-008 c1): cada razón explicada con sus
 * cifras —reportado, mediana histórica, factor, seguidores, múltiplo y
 * límite— para compararlas con la captura. Si el medio corrigió las cifras,
 * también la alerta que tuvo antes. La misma explicación en la cola de
 * validación, la ficha de la asignación y la ficha del medio; nada si no hay
 * razones que explicar.
 */
export function PorqueAlerta({
  alerta,
  plataforma,
  nivelTitulo = 3,
  className,
}: {
  alerta: AlertaMetrica
  /** `null` si no se ve: se habla de alcance e impresiones. */
  plataforma: Plataforma | null
  /** Nivel del encabezado según dónde se monta (3 por omisión). */
  nivelTitulo?: 3 | 4
  className?: string
}) {
  const idTitulo = useId()
  const motivos = motivosAlerta(alerta, plataforma)
  const previos = motivosAlertaPrevia(alerta, plataforma)
  if (motivos.length === 0 && previos.length === 0) return null
  const historial = textoHistorial(
    alerta.cifras.nHistorial ?? alerta.previa?.cifras.nHistorial ?? null
  )
  const Titulo = nivelTitulo === 4 ? "h4" : "h3"
  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        "@container flex flex-col gap-4 rounded-xl border border-warning/45 bg-warning/8 p-4",
        className
      )}
    >
      <Titulo
        id={idTitulo}
        className="flex items-center gap-2 text-sm font-semibold"
      >
        <TriangleAlert aria-hidden className="size-4 shrink-0 text-warning" />
        {motivos.length > 0 ? TITULOS_ALERTA.actual : TITULOS_ALERTA.previa}
      </Titulo>
      {motivos.length > 0 ? <ListaMotivos motivos={motivos} /> : null}
      {motivos.length > 0 && previos.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-warning/30 pt-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <History aria-hidden className="size-4 shrink-0 text-warning" />
            {TITULOS_ALERTA.previaTambien}
          </p>
          <ListaMotivos motivos={previos} />
        </div>
      ) : motivos.length === 0 ? (
        <ListaMotivos motivos={previos} />
      ) : null}
      {historial ? (
        <p className="text-xs text-muted-foreground">{historial}</p>
      ) : null}
    </section>
  )
}
