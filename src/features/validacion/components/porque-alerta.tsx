import { History, TriangleAlert } from "lucide-react"
import { useId } from "react"

import type { Plataforma } from "@/features/operacion/estados"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  type AlertaMetrica,
  explicarMotivo,
  type MotivoAlerta,
  motivosAlerta,
  motivosAlertaPrevia,
  textoHistorial,
} from "../alertas"

const TITULOS: Readonly<Record<MotivoAlerta["tipo"], string>> = {
  multiplo: "Alcance excesivo frente a los seguidores",
  desviacion: "Desviación frente al histórico de la cuenta",
  "desviacion-sin-detalle": "Desviación frente al histórico de la cuenta",
}

function cifra(valor: number | null, decimales = 0): string {
  return valor === null ? "—" : formatearNumero(valor, decimales)
}

function factor(valor: number | null): string {
  return valor === null
    ? "—"
    : `${formatearNumero(valor, valor % 1 === 0 ? 0 : 1)} ×`
}

function Comparacion({
  datos,
}: {
  datos: readonly { etiqueta: string; valor: string; destacado?: boolean }[]
}) {
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

function datosDe(motivo: MotivoAlerta) {
  switch (motivo.tipo) {
    case "multiplo":
      return [
        {
          etiqueta: `${motivo.nombre} reportado`,
          valor: cifra(motivo.reportado),
          destacado: true,
        },
        { etiqueta: "Seguidores al aceptar", valor: cifra(motivo.seguidores) },
        { etiqueta: "Múltiplo permitido", valor: factor(motivo.multiplo) },
        { etiqueta: "Límite", valor: cifra(motivo.limite) },
      ]
    case "desviacion":
      return [
        {
          etiqueta: `${motivo.nombre} reportado`,
          valor: cifra(motivo.reportado),
          destacado: true,
        },
        { etiqueta: "Mediana histórica", valor: cifra(motivo.mediana) },
        { etiqueta: "Factor", valor: factor(motivo.factor) },
        {
          etiqueta: "Rango sin alerta",
          valor: `${cifra(Math.ceil(motivo.minimo))} – ${cifra(Math.floor(motivo.maximo))}`,
        },
      ]
    case "desviacion-sin-detalle":
      return []
  }
}

function ListaMotivos({ motivos }: { motivos: readonly MotivoAlerta[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {motivos.map((motivo, indice) => {
        const datos = datosDe(motivo)
        return (
          <li key={`${motivo.tipo}-${indice}`} className="flex flex-col gap-2">
            <p className="text-sm font-medium">{TITULOS[motivo.tipo]}</p>
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
 * límite— para compararlas con la captura que se ve al lado. Si el medio
 * corrigió las cifras, también la alerta que tuvo antes.
 */
export function PorqueAlerta({
  alerta,
  plataforma,
  className,
}: {
  alerta: AlertaMetrica
  plataforma: Plataforma
  className?: string
}) {
  const idTitulo = useId()
  const motivos = motivosAlerta(alerta, plataforma)
  const previos = motivosAlertaPrevia(alerta, plataforma)
  if (motivos.length === 0 && previos.length === 0) return null
  const historial = textoHistorial(
    alerta.cifras.nHistorial ?? alerta.previa?.cifras.nHistorial ?? null
  )
  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        "@container flex flex-col gap-4 rounded-xl border border-warning/45 bg-warning/8 p-4",
        className
      )}
    >
      <h3
        id={idTitulo}
        className="flex items-center gap-2 text-sm font-semibold"
      >
        <TriangleAlert aria-hidden className="size-4 shrink-0 text-warning" />
        {motivos.length > 0
          ? "Por qué tiene alerta"
          : "Tuvo alerta antes de corregirse"}
      </h3>
      {motivos.length > 0 ? <ListaMotivos motivos={motivos} /> : null}
      {motivos.length > 0 && previos.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-warning/30 pt-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <History aria-hidden className="size-4 shrink-0 text-warning" />
            Antes de corregirse también tenía alerta
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
