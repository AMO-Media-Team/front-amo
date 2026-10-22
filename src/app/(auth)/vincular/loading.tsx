import { Esqueleto } from "@/components/feedback/esqueletos"

/** Mientras llegan el territorio y la política: la forma del formulario. */
export default function CargandoVincular() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-8">
      <span className="sr-only">Cargando el formulario…</span>
      <div className="flex flex-col gap-3">
        <Esqueleto className="h-9 w-4/5 rounded-lg" />
        <Esqueleto className="h-4 w-full rounded-md" />
        <Esqueleto className="h-4 w-3/4 rounded-md" />
      </div>
      {[0, 1].map((seccion) => (
        <div key={seccion} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Esqueleto className="size-7 rounded-full" />
            <Esqueleto className="h-5 w-32 rounded-md" />
          </div>
          <Esqueleto className="h-11 w-full rounded-lg" />
          <Esqueleto className="h-11 w-full rounded-lg" />
        </div>
      ))}
    </div>
  )
}
