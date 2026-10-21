import {
  EsqueletoMetricasAccesos,
  EsqueletoOrigenAccesos,
  EsqueletoRegistroAccesos,
  EsqueletoSeguridadAccesos,
} from "@/features/accesos/components/esqueletos"
import { EsqueletoEncabezado } from "@/features/auditoria/components/esqueletos"

/** Carga de Accesos: encabezado, indicadores, alertas y actividad, origen y registro. */
export default function CargandoAccesos() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <EsqueletoEncabezado />
      <EsqueletoMetricasAccesos />
      <EsqueletoSeguridadAccesos />
      <EsqueletoOrigenAccesos />
      <EsqueletoRegistroAccesos />
    </div>
  )
}
