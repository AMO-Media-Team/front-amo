import { Esqueleto, EsqueletoTabla } from "@/components/feedback/esqueletos"
import { EsqueletoSeccion } from "@/features/cuenta/components/esqueletos-cuenta"

/** Cuenta → Privacidad mientras llega: tus datos, autorizaciones, descarga y solicitudes. */
export function EsqueletoPrivacidadCuenta() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando tu privacidad…</span>
      <EsqueletoSeccion filas={3} />
      <EsqueletoSeccion filas={2} />
      <EsqueletoSeccion filas={1} />
      <EsqueletoSeccion filas={4} conPie />
    </div>
  )
}

/** Resumen del semáforo de la bandeja. */
export function EsqueletoResumenPlazos() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="grid grid-cols-2 gap-3 lg:grid-cols-5"
    >
      <span className="sr-only">Cargando el resumen de plazos…</span>
      {Array.from({ length: 5 }, (_, i) => (
        <Esqueleto key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  )
}

/** La bandeja de solicitudes de titulares. */
export function EsqueletoTablaSolicitudes() {
  return <EsqueletoTabla filas={8} />
}

/** Página completa de la bandeja (`loading.tsx`). */
export function EsqueletoBandejaPrivacidad() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
    >
      <span className="sr-only">Cargando las solicitudes de titulares…</span>
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-8 w-64 max-w-full" />
        <Esqueleto className="h-4 w-[32rem] max-w-full" />
      </div>
      <EsqueletoResumenPlazos />
      <EsqueletoTablaSolicitudes />
    </div>
  )
}

/** Ficha de una solicitud (`loading.tsx`). */
export function EsqueletoFichaSolicitud() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
    >
      <span className="sr-only">Cargando la solicitud…</span>
      <Esqueleto className="h-8 w-40" />
      <Esqueleto className="h-36 rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <Esqueleto className="h-48 rounded-xl" />
          <Esqueleto className="h-64 rounded-xl" />
        </div>
        <div className="flex flex-col gap-6">
          <Esqueleto className="h-48 rounded-xl" />
          <Esqueleto className="h-56 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
