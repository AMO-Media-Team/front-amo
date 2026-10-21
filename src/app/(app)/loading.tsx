import {
  Esqueleto,
  EsqueletoGrafico,
  EsqueletoKpis,
} from "@/components/feedback/esqueletos"

/**
 * Carga de una sección: esqueleto del contenido (encabezado, indicadores y
 * gráfico). El AppShell ya está pintado y no se repite.
 */
export default function CargandoSeccion() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2.5">
          <Esqueleto className="h-7 w-48 sm:h-8" />
          <Esqueleto className="h-4 w-72 max-w-full" />
        </div>
        <Esqueleto className="h-9 w-36" />
      </div>
      <EsqueletoKpis />
      <div className="grid gap-4 lg:grid-cols-3">
        <EsqueletoGrafico className="lg:col-span-2" />
        <EsqueletoGrafico />
      </div>
    </div>
  )
}
