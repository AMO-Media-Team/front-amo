import "server-only"

import { FileLock2 } from "lucide-react"
import Link from "next/link"

import { requerirUsuario, tieneAlgunPermiso } from "@/lib/auth/dal"
import { cn } from "@/lib/utils"

import { rutaBandeja } from "../bandeja"
import { type FiltroReclamo, hayReclamoEnTramite } from "../queries"

/**
 * Leyenda «Reclamo en trámite» (Ley 1581, art. 15) para las fichas de medio,
 * anunciante y usuario: aparece mientras el titular tenga un reclamo abierto
 * (actualización, rectificación, supresión o revocatoria). Solo la ve quien
 * atiende las solicitudes (`privacidad.gestionar`); para los demás no pinta
 * nada ni consulta. Server Component: el líder la monta con el id que tenga
 * la ficha. La lleva a la bandeja filtrada por los reclamos abiertos.
 */
export async function InsigniaReclamoEnTramite({
  medioId,
  anuncianteId,
  perfilId,
  className,
}: FiltroReclamo & { className?: string }) {
  const usuario = await requerirUsuario()
  if (!tieneAlgunPermiso(usuario, ["privacidad.gestionar"])) return null
  if (!(await hayReclamoEnTramite({ medioId, anuncianteId, perfilId }))) {
    return null
  }
  return (
    <Link
      href={rutaBandeja()}
      title="Hay un reclamo de datos personales abierto: atiéndelo en Datos personales."
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full border border-warning/45 bg-warning/12 px-2.5 text-xs font-medium whitespace-nowrap text-foreground outline-none hover:bg-warning/20 focus-visible:anillo-foco",
        className
      )}
    >
      <FileLock2 aria-hidden className="size-3.5 text-warning" />
      Reclamo en trámite
    </Link>
  )
}
