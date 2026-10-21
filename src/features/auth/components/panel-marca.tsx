import { Logotipo } from "@/components/brand/logotipo"
import { cn } from "@/lib/utils"

import { IlustracionColombia } from "./ilustracion-colombia"
import estilos from "./panel-marca.module.css"

const LEYENDA = [
  { etiqueta: "Capitales", marca: "capital" },
  { etiqueta: "Medios locales", marca: "medio" },
  { etiqueta: "Conexiones", marca: "conexion" },
] as const

type Marca = (typeof LEYENDA)[number]["marca"]

function MarcaLeyenda({ marca }: { marca: Marca }) {
  if (marca === "conexion") {
    return <span className="h-0.5 w-4 rounded-full bg-lila-400/70" />
  }
  return (
    <span
      className={cn(
        "rounded-full",
        marca === "capital"
          ? "size-2.5 bg-lila-50 ring-2 ring-lila-500"
          : "size-1.5 bg-lila-200/70"
      )}
    />
  )
}

/**
 * Mitad de marca de las pantallas de acceso (solo escritorio): Aurora de
 * fondo, el mapa de medios conectados y la propuesta de valor.
 */
export function PanelMarca() {
  return (
    <aside
      aria-label="AMO — Advertising Market Optimization"
      className="relative isolate hidden h-dvh flex-col overflow-hidden text-lila-50 lg:sticky lg:top-0 lg:flex"
    >
      <div aria-hidden className={estilos.fondo}>
        <div className={cn(estilos.mancha, estilos.manchaLila)} />
        <div className={cn(estilos.mancha, estilos.manchaIndigo)} />
        <div className={cn(estilos.mancha, estilos.manchaOrquidea)} />
        <div className={estilos.puntos} />
      </div>

      <div className="relative z-10 px-10 pt-10 xl:px-14 xl:pt-12">
        <Logotipo conDescriptor tono="oscuro" alto={40} />
      </div>

      {/* El mapa ocupa la derecha; su esquina inferior izquierda (Ecuador y
          Perú) queda vacía y ahí se apoya el texto. */}
      <div className="pointer-events-none absolute inset-0 flex items-start justify-end pt-[max(11vh,6.5rem)] pr-[4%]">
        <IlustracionColombia className="h-[min(76vh,45rem)] w-auto max-w-[74%]" />
      </div>
      <div aria-hidden className={estilos.vineta} />

      <div className="relative z-10 mt-auto flex max-w-[24rem] flex-col gap-4 px-10 pb-10 xl:max-w-[27rem] xl:px-14 xl:pb-12">
        <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-lila-300 uppercase">
          Pauta hiperlocal en Colombia
        </p>
        {/* Párrafo y no encabezado: el h1 de la página está en el formulario. */}
        <p className="font-heading text-[1.875rem] leading-[1.12] font-bold tracking-[-0.02em] text-balance text-white xl:text-[2.25rem]">
          Tu marca, en la voz de cada territorio.
        </p>
        <p className="text-[0.9375rem] leading-relaxed text-lila-100/75">
          Conecta anunciantes con medios locales verificados: ofertas, cupos,
          evidencias y liquidación en un solo lugar.
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-xs text-lila-100/70">
          {LEYENDA.map(({ etiqueta, marca }) => (
            <li key={marca} className="flex items-center gap-2">
              <MarcaLeyenda marca={marca} />
              {etiqueta}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
