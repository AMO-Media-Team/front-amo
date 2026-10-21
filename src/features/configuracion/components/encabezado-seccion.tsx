import { INFO_SECCIONES, type Seccion } from "../secciones"
import { InsigniaSoloLectura } from "./insignias"

/**
 * Título y contexto de la sección activa. Con `soloLectura`, avisa de que
 * quien mira puede consultar pero no cambiar nada de esta sección.
 */
export function EncabezadoSeccion({
  seccion,
  soloLectura,
}: {
  seccion: Seccion
  soloLectura: boolean
}) {
  const { titulo, descripcion } = INFO_SECCIONES[seccion]
  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="font-heading text-xl leading-tight font-semibold">
          {titulo}
        </h2>
        {soloLectura ? <InsigniaSoloLectura /> : null}
      </div>
      <p className="max-w-3xl text-sm text-pretty text-muted-foreground sm:text-[0.9375rem]">
        {descripcion}
      </p>
    </header>
  )
}
