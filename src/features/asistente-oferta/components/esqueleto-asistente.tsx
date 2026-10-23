import { Esqueleto } from "@/components/feedback/esqueletos"

/**
 * Esqueleto fiel del asistente de oferta: vuelta a la campaña, encabezado,
 * indicador de seis pasos y el primer paso, para que la página no salte al
 * llegar los datos.
 */
export function EsqueletoAsistente({
  etiqueta = "Cargando el asistente de oferta…",
}: {
  etiqueta?: string
}) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{etiqueta}</span>
      <div className="flex flex-col gap-3" aria-hidden>
        <Esqueleto className="h-5 w-40" />
        <Esqueleto className="h-3 w-28" />
        <Esqueleto className="h-8 w-3/5 max-w-72" />
        <Esqueleto className="h-4 w-11/12 max-w-xl" />
      </div>
      <div className="flex items-start" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <Esqueleto className="size-8 rounded-full" />
            <Esqueleto className="hidden h-3.5 w-20 md:block" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-5" aria-hidden>
        <div className="flex flex-col gap-2">
          <Esqueleto className="h-3 w-24" />
          <Esqueleto className="h-6 w-48" />
          <Esqueleto className="h-4 w-4/5" />
        </div>
        {[0, 1].map((grupo) => (
          <div key={grupo} className="flex flex-col gap-2">
            <Esqueleto className="h-4 w-28" />
            <div className="grid gap-2 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Esqueleto key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          </div>
        ))}
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_14rem]">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Esqueleto className="h-4 w-32" />
              <Esqueleto className="h-9 w-full" />
            </div>
          ))}
        </div>
        <Esqueleto className="h-14 w-full rounded-2xl" />
      </div>
    </div>
  )
}
