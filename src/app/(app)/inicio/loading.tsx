import { EsqueletoTarjetaGrafico } from "@/components/charts/esqueleto-grafico"
import { Esqueleto } from "@/components/feedback/esqueletos"
import {
  FILA_PRINCIPAL,
  PRINCIPAL,
} from "@/features/dashboard/components/bloque-panel"
import { EsqueletoLista } from "@/features/dashboard/components/esqueletos-panel"
import { EsqueletoTarjetasKpi } from "@/features/dashboard/components/tarjetas-kpi"
import { EsqueletoHeroGanancias } from "@/features/dashboard/medio/components/esqueletos-medio"
import { cn } from "@/lib/utils"

/**
 * Carga de Inicio mientras el servidor confirma la sesión: aún no se sabe el
 * rol, así que la primera franja sigue al dispositivo. En móvil, la del panel
 * del medio (cifra héroe y próximas acciones: los medios entran desde el
 * teléfono); desde tableta, la de los paneles general y del anunciante
 * (indicadores y gráficos). Al llegar la página, cada bloque trae su propio
 * esqueleto fiel. Las rejillas miden el mismo contenedor que el panel
 * (`@container/panel`), así el esqueleto y el contenido coinciden con la
 * barra lateral abierta o plegada.
 */
export default function CargandoInicio() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <Esqueleto className="h-3 w-40" />
          <Esqueleto className="h-7 w-3/4 max-w-72 sm:h-8" />
          <Esqueleto className="h-4 w-11/12 max-w-96" />
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
          <Esqueleto className="h-9 w-full sm:w-48" />
          <Esqueleto className="h-3 w-52" />
        </div>
      </div>
      <div className="@container/panel">
        <div className="flex flex-col gap-4 md:hidden">
          <EsqueletoHeroGanancias />
          <EsqueletoLista filas={3} />
        </div>
        <div className="flex flex-col gap-4 max-md:hidden sm:gap-5">
          <EsqueletoTarjetasKpi />
          <div className={cn("grid gap-4 sm:gap-5", FILA_PRINCIPAL)}>
            <EsqueletoTarjetaGrafico alto="min-h-80" className={PRINCIPAL} />
            <EsqueletoTarjetaGrafico alto="min-h-80" />
          </div>
        </div>
      </div>
    </div>
  )
}
