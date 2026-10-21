import { Esqueleto } from "@/components/feedback/esqueletos"
import {
  EsqueletoEncabezadoSeccion,
  EsqueletoNavegacion,
  EsqueletoSeccion,
} from "@/features/configuracion/components/esqueleto-seccion"
import { REJILLA_MARCO } from "@/features/configuracion/components/rejilla-marco"

/** Carga de Configuración: encabezado, navegación de secciones y tarjetas de la sección. */
export default function CargandoConfiguracion() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2.5">
          <Esqueleto className="h-7 w-48 sm:h-8" />
          <Esqueleto className="h-4 w-[30rem] max-w-full" />
        </div>
        <Esqueleto className="h-8 w-44" />
      </div>
      <div className="@container">
        <div className={REJILLA_MARCO}>
          <EsqueletoNavegacion />
          <div className="flex min-w-0 flex-col gap-6">
            <EsqueletoEncabezadoSeccion />
            <EsqueletoSeccion />
          </div>
        </div>
      </div>
    </div>
  )
}
