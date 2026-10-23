import { History, ImageOff } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { VisorCreativo } from "@/features/creativos/components/visor-creativo"
import type { VersionCreativo } from "@/features/creativos/tipos"
import { SeccionFicha } from "@/features/ofertas/components/seccion-creativos"
import { InsigniaTono } from "@/features/operacion/components/distintivos"
import { contar, formatearFechaHoraFija } from "@/features/operacion/formato"

/** Vigente y pendiente se revisan completas; las anteriores solo se listan. */
function separar(versiones: readonly VersionCreativo[]) {
  const vigente = versiones.find((version) => version.vigente) ?? null
  const pendiente = versiones.find((version) => version.pendiente) ?? null
  const anteriores = versiones.filter(
    (version) => version !== vigente && version !== pendiente
  )
  return { vigente, pendiente, anteriores }
}

function Version({
  version,
  estado,
}: {
  version: VersionCreativo
  estado: "vigente" | "pendiente"
}) {
  const id = `creativo-version-${version.version}`
  return (
    <article
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={id} className="text-sm font-semibold">
          Versión {version.version}
        </h3>
        {estado === "vigente" ? (
          <InsigniaTono tono="exito" etiqueta="Vigente" />
        ) : (
          <InsigniaTono
            tono="aviso"
            etiqueta="Pendiente de activar"
            titulo="El anunciante la prepara; los medios aún ven la vigente."
          />
        )}
      </header>
      <VisorCreativo version={version} />
    </article>
  )
}

/**
 * Paquete creativo en la ficha interna: la versión vigente (la que
 * descargarán o descargan los medios) y la pendiente de activar, completas
 * con `VisorCreativo`; las anteriores, como referencia.
 */
export function CreativosModeracion({
  versiones,
}: {
  versiones: readonly VersionCreativo[]
}) {
  const { vigente, pendiente, anteriores } = separar(versiones)
  return (
    <SeccionFicha
      id="paquete-creativo"
      titulo="Paquete creativo"
      descripcion="Archivos, copy sugerido, hashtags, menciones y enlace de destino que reciben los medios."
    >
      {!vigente && !pendiente ? (
        <EstadoVacio
          icono={ImageOff}
          titulo="Sin paquete creativo"
          descripcion="La oferta aún no tiene una versión del creativo con archivos."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {vigente ? <Version version={vigente} estado="vigente" /> : null}
          {pendiente ? (
            <Version version={pendiente} estado="pendiente" />
          ) : null}
        </div>
      )}
      {anteriores.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <History aria-hidden className="size-3.5" />
            {contar(
              anteriores.length,
              "versión anterior",
              "versiones anteriores"
            )}
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {anteriores.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3"
              >
                <span>Versión {version.version}</span>
                <span className="text-xs cifras text-muted-foreground">
                  {version.activadoAt
                    ? `Activada el ${formatearFechaHoraFija(version.activadoAt)}`
                    : `Creada el ${formatearFechaHoraFija(version.createdAt)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SeccionFicha>
  )
}
