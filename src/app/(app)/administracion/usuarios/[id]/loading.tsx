import { Esqueleto } from "@/components/feedback/esqueletos"

/** Carga de la ficha de usuario: migas, cabecera con avatar y pestañas. */
export default function CargandoFichaUsuario() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
    >
      <span className="sr-only">Cargando la ficha del usuario…</span>
      <Esqueleto className="h-4 w-64" />
      <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-5">
          <Esqueleto className="size-16 shrink-0 rounded-full sm:size-18" />
          <div className="flex flex-col gap-2">
            <Esqueleto className="h-3 w-24" />
            <Esqueleto className="h-7 w-56" />
            <Esqueleto className="h-4 w-48" />
            <div className="mt-1 flex gap-2">
              <Esqueleto className="h-6 w-20 rounded-full" />
              <Esqueleto className="h-6 w-28 rounded-full" />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Esqueleto className="h-8 w-24" />
          <Esqueleto className="h-8 w-32" />
        </div>
      </div>
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Esqueleto key={i} className="h-7 w-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Esqueleto className="h-64 rounded-xl lg:col-span-3" />
        <Esqueleto className="h-64 rounded-xl lg:col-span-2" />
      </div>
    </div>
  )
}
