import {
  EsqueletoCentroReportes,
  EsqueletoEncabezadoReporte,
} from "@/features/reportes/components/esqueletos"

/** Carga del centro de reportes: encabezado y tarjetas por grupo. */
export default function CargandoReportes() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <EsqueletoEncabezadoReporte conAccion={false} />
      <EsqueletoCentroReportes />
    </div>
  )
}
