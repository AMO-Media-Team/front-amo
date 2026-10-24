import { ArrowUpRight, UserRoundCog } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import type { ModoGestion } from "@/features/campanas/rutas-gestion"
import type { OpcionGestion } from "@/features/ofertas/acciones"
import { AccionesOferta } from "@/features/ofertas/components/acciones-oferta"
import type { EstadoOferta } from "@/features/operacion/estados"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"

/** Título del panel (las pruebas E2E lo buscan por él). */
export const TITULO_GESTION_ASISTIDA = "Gestión por cuenta del anunciante"

/**
 * Panel de la ficha interna de la oferta con lo que el equipo AMO hace por
 * cuenta del anunciante (ADM-014): editarla en el asistente, enviarla o
 * reenviarla a revisión, retirarla, cancelarla con motivo y archivarla. Va
 * separado de la decisión de moderación (otro permiso, otra
 * responsabilidad): enviar a revisión no es publicar. Dice por cuenta de quién
 * se actúa y que cada cambio queda en la bitácora y le llega a la empresa.
 */
export function PanelGestionAsistida({
  oferta,
  opciones,
  gestion,
  enlaceAnunciante,
}: {
  oferta: {
    id: string
    campanaId: string
    titulo: string
    estado: EstadoOferta
  }
  /** `accionesGestion(estado, "ADMIN", …)`, calculadas en el servidor. */
  opciones: readonly OpcionGestion[]
  gestion: Extract<ModoGestion, { modo: "asistido" }>
  /** Ficha del anunciante, si quien actúa puede verla. */
  enlaceAnunciante: Route | null
}) {
  if (opciones.length === 0) return null
  return (
    <TarjetaFicha
      titulo={TITULO_GESTION_ASISTIDA}
      icono={UserRoundCog}
      descripcion={
        <>
          Actúas por cuenta de{" "}
          {enlaceAnunciante ? (
            <Link
              href={enlaceAnunciante}
              className="inline-flex items-center gap-0.5 rounded-sm font-medium text-foreground underline underline-offset-4 outline-none focus-visible:anillo-foco"
            >
              {gestion.anunciante}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          ) : (
            <span className="font-medium text-foreground">
              {gestion.anunciante}
            </span>
          )}
          . Cada cambio queda en la bitácora a tu nombre y se le avisa a la
          empresa.
        </>
      }
    >
      <AccionesOferta
        ofertaId={oferta.id}
        campanaId={oferta.campanaId}
        titulo={oferta.titulo}
        estado={oferta.estado}
        opciones={opciones}
        gestion={gestion}
        disposicion="columna"
      />
    </TarjetaFicha>
  )
}
