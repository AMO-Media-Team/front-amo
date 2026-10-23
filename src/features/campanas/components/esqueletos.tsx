import { Esqueleto } from "@/components/feedback/esqueletos"

/** Carga del formulario de campaña (crear o editar): dos secciones y el pie. */
export function EsqueletoFormularioCampana({ etiqueta }: { etiqueta: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
    >
      <span className="sr-only">{etiqueta}</span>
      <div className="flex flex-col gap-2.5">
        <Esqueleto className="h-3 w-24" />
        <Esqueleto className="h-7 w-56 sm:h-8" />
        <Esqueleto className="h-4 w-full max-w-md" />
      </div>
      {[3, 3].map((campos, seccion) => (
        <div
          key={seccion}
          className="flex flex-col gap-5 rounded-2xl border bg-card p-4 sm:p-6"
        >
          <div className="flex items-start gap-3.5">
            <Esqueleto className="size-9 shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Esqueleto className="h-4 w-40" />
              <Esqueleto className="h-3 w-3/4" />
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {Array.from({ length: campos }, (_, indice) => (
              <div key={indice} className="flex flex-col gap-2">
                <Esqueleto className="h-3.5 w-28" />
                <Esqueleto className="h-9 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Esqueleto className="h-8 w-24" />
        <Esqueleto className="h-8 w-36" />
      </div>
    </div>
  )
}
