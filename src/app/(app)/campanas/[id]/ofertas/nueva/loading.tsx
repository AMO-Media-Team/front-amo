import { EsqueletoAsistente } from "@/features/asistente-oferta/components/esqueleto-asistente"

/** Mismo contenedor que `ContenedorPagina` estrecho (sin la transición). */
export default function CargandoNuevaOferta() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <EsqueletoAsistente />
    </div>
  )
}
