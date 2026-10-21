import { Esqueleto } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

/** Encabezado de una tarjeta de ajustes: icono, título y descripción. */
function EncabezadoEsqueleto({
  anchoTitulo = "w-40",
}: {
  anchoTitulo?: string
}) {
  return (
    <div className="flex items-start gap-3.5">
      <Esqueleto className="size-9 shrink-0 rounded-xl" />
      <div className="flex flex-1 flex-col gap-2 pt-0.5">
        <Esqueleto className={cn("h-4", anchoTitulo)} />
        <Esqueleto className="h-3.5 w-64 max-w-full" />
      </div>
    </div>
  )
}

function PieEsqueleto({
  anchoPrincipal = "w-32",
}: {
  anchoPrincipal?: string
}) {
  return (
    <div className="flex justify-end gap-2 border-t bg-muted/30 px-5 py-3.5 sm:px-6">
      <Esqueleto className="h-8 w-24" />
      <Esqueleto className={cn("h-8", anchoPrincipal)} />
    </div>
  )
}

/** Tarjeta de ajustes en carga: encabezado con icono, filas y pie opcional. */
export function EsqueletoSeccion({
  filas = 3,
  conPie = false,
  className,
}: {
  filas?: number
  conPie?: boolean
  className?: string
}) {
  return (
    <div
      className={cn("overflow-hidden rounded-2xl border bg-card", className)}
    >
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <EncabezadoEsqueleto />
      </div>
      <div
        className={cn(
          "flex flex-col gap-4 px-5 sm:px-6",
          filas > 0 ? "py-5 sm:py-6" : "pb-5 sm:pb-6"
        )}
      >
        {Array.from({ length: filas }, (_, indice) => (
          <div key={indice} className="flex items-center gap-3">
            <Esqueleto className="size-9 shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Esqueleto
                className={cn("h-3.5", indice % 2 ? "w-1/2" : "w-2/3")}
              />
              <Esqueleto className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
      {conPie ? <PieEsqueleto /> : null}
    </div>
  )
}

/** Carga de Perfil: tarjeta de identidad y formulario. */
export function EsqueletoPerfil() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando tu perfil…</span>
      <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <Esqueleto className="size-20 shrink-0 rounded-full sm:size-24" />
        <div className="flex flex-1 flex-col gap-2">
          <Esqueleto className="h-3 w-24" />
          <Esqueleto className="h-7 w-56 max-w-full" />
          <Esqueleto className="h-4 w-48 max-w-full" />
          <div className="mt-1 flex gap-2">
            <Esqueleto className="h-6 w-32 rounded-full" />
            <Esqueleto className="h-6 w-40 rounded-full" />
          </div>
        </div>
        <Esqueleto className="h-8 w-32" />
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <EncabezadoEsqueleto />
        </div>
        <div className="grid gap-x-6 gap-y-5 px-5 py-5 sm:px-6 sm:py-6 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, indice) => (
            <div key={indice} className="flex flex-col gap-2">
              <Esqueleto className="h-3.5 w-28" />
              <Esqueleto className="h-10 w-full rounded-lg" />
              <Esqueleto className="h-3 w-2/3" />
            </div>
          ))}
        </div>
        <PieEsqueleto anchoPrincipal="w-36" />
      </div>
    </div>
  )
}

/** Carga de Seguridad: contraseña, verificación, sesiones y actividad. */
export function EsqueletoSeguridad() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando la seguridad de tu cuenta…</span>
      <EsqueletoSeccion filas={0} conPie />
      <EsqueletoSeccion filas={1} conPie />
      <EsqueletoSeccion filas={2} conPie />
      <EsqueletoSeccion filas={4} />
    </div>
  )
}

/** Tarjeta con opciones de vista previa (tema, densidad, números). */
function EsqueletoOpciones({ columnas }: { columnas: 2 | 3 }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card p-5 sm:p-6">
      <EncabezadoEsqueleto anchoTitulo="w-28" />
      <div
        className={cn(
          "mt-5 grid gap-2 sm:gap-3",
          columnas === 3 ? "grid-cols-3" : "grid-cols-2"
        )}
      >
        {Array.from({ length: columnas }, (_, indice) => (
          <Esqueleto
            key={indice}
            className="h-[6.5rem] rounded-xl sm:h-40 lg:h-[11.5rem]"
          />
        ))}
      </div>
    </div>
  )
}

/** Carga de Preferencias: el mismo orden y las mismas rejillas del panel. */
export function EsqueletoPreferencias() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando tus preferencias…</span>
      <Esqueleto className="h-4 w-80 max-w-full" />
      <EsqueletoOpciones columnas={3} />
      <EsqueletoOpciones columnas={3} />
      <EsqueletoSeccion filas={1} />
      <EsqueletoOpciones columnas={2} />
    </div>
  )
}
