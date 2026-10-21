import { Esqueleto } from "@/components/feedback/esqueletos"

/** Carga de la ficha de un rol: volver, cabecera, pestañas y matriz. */
export default function CargandoRol() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
    >
      <span className="sr-only">Cargando el rol…</span>
      <div className="flex flex-col gap-4">
        <Esqueleto className="h-7 w-40" />
        <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
            <Esqueleto className="size-14 shrink-0 rounded-2xl sm:size-16" />
            <div className="flex flex-col gap-2">
              <Esqueleto className="h-3 w-28" />
              <Esqueleto className="h-7 w-56" />
              <Esqueleto className="h-4 w-32" />
              <div className="mt-1 flex gap-2">
                <Esqueleto className="h-6 w-24 rounded-full" />
                <Esqueleto className="h-6 w-16 rounded-full" />
                <Esqueleto className="h-6 w-28 rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Esqueleto className="h-8 w-24" />
            <Esqueleto className="h-8 w-28" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Esqueleto key={i} className="h-7 w-32" />
        ))}
      </div>
      <Esqueleto className="h-20 rounded-xl" />
      <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
        <Esqueleto className="h-8 w-full lg:w-80" />
        <Esqueleto className="h-8 w-full max-w-md" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4"
          >
            <div className="flex items-center gap-3">
              <Esqueleto className="size-8 rounded-lg" />
              <Esqueleto className="h-4 w-32" />
              <Esqueleto className="ml-auto size-4 rounded-full" />
            </div>
            {Array.from({ length: 3 }, (_, j) => (
              <div
                key={j}
                className="flex items-center justify-between gap-4 border-t pt-3"
              >
                <div className="flex flex-1 flex-col gap-1.5">
                  <Esqueleto className="h-3.5 w-3/4" />
                  <Esqueleto className="h-3 w-24" />
                </div>
                <Esqueleto className="h-[18px] w-8 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
