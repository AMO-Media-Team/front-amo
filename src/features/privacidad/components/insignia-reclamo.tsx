import "server-only"

import { FileLock2 } from "lucide-react"
import Link from "next/link"

import { requerirUsuario, tieneAlgunPermiso } from "@/lib/auth/dal"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { destinoReclamos } from "../bandeja"
import { type FiltroReclamo, reclamosEnTramite } from "../queries"

/**
 * Leyenda «Reclamo en trámite» (Ley 1581, art. 15) para las fichas de medio,
 * anunciante y usuario: aparece mientras el titular tenga un reclamo abierto
 * (actualización, rectificación, supresión o revocatoria). Solo la ve quien
 * atiende las solicitudes (`privacidad.gestionar`); para los demás no pinta
 * nada ni consulta. Server Component: el líder la monta con el id que tenga
 * la ficha. Con un reclamo lleva a su ficha; con varios, a la bandeja con los
 * reclamos abiertos (de ese titular, si todos son de la misma persona).
 */
export async function InsigniaReclamoEnTramite({
  medioId,
  anuncianteId,
  perfilId,
  className,
}: FiltroReclamo & { className?: string }) {
  const usuario = await requerirUsuario()
  if (!tieneAlgunPermiso(usuario, ["privacidad.gestionar"])) return null
  const reclamos = await reclamosEnTramite({ medioId, anuncianteId, perfilId })
  if (reclamos.length === 0) return null
  const varios = reclamos.length > 1
  return (
    <Link
      href={destinoReclamos(reclamos)}
      title={
        varios
          ? "Hay varios reclamos de datos personales abiertos: atiéndelos en Datos personales."
          : "Hay un reclamo de datos personales abierto: ábrelo para atenderlo."
      }
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full border border-warning/45 bg-warning/12 px-2.5 text-xs font-medium whitespace-nowrap text-foreground outline-none hover:bg-warning/20 focus-visible:anillo-foco",
        className
      )}
    >
      <FileLock2 aria-hidden className="size-3.5 text-warning" />
      {varios
        ? `${formatearNumero(reclamos.length)} reclamos en trámite`
        : "Reclamo en trámite"}
    </Link>
  )
}
