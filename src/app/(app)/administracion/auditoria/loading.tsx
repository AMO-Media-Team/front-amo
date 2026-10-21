import {
  EsqueletoEncabezado,
  EsqueletoMetricasBitacora,
  EsqueletoRegistrosBitacora,
} from "@/features/auditoria/components/esqueletos"

/** Carga de Auditoría: encabezado, cuatro indicadores y la tabla. */
export default function CargandoAuditoria() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <EsqueletoEncabezado />
      <EsqueletoMetricasBitacora />
      <EsqueletoRegistrosBitacora />
    </div>
  )
}
