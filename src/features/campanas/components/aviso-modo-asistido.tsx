import { ArrowUpRight, UserRoundCog } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import { ESTADOS_ANUNCIANTE } from "@/features/operacion/estados"
import { cn } from "@/lib/utils"

import { notaVerificacionAsistida } from "../gestion"
import type { EstadoAnunciante } from "../tipos"

/** Nombre accesible de la nota (las pruebas la buscan por él). */
export const ETIQUETA_AVISO_ASISTIDO = "Gestión asistida"

/**
 * Aviso de las pantallas de la gestión asistida (ADM-014): quien la ve actúa
 * por cuenta de un anunciante, cada cambio queda en la bitácora a su nombre y
 * se le avisa a la empresa. Si la empresa no está verificada, dice hasta
 * dónde se puede llegar (borradores sí; activar y enviar a revisión, no). La
 * nota de verificación es una región viva: en el alta cambia al elegir otra
 * empresa. Sin anunciante elegido, pide elegirlo.
 */
export function AvisoModoAsistido({
  anunciante,
  estado,
  enlace,
  className,
}: {
  /** Nombre comercial; `null` mientras no se elija. */
  anunciante: string | null
  /** Verificación de la empresa; `null` si no se pudo leer. */
  estado: EstadoAnunciante | null
  /** Ficha del anunciante, si quien actúa puede verla. */
  enlace?: Route | null
  className?: string
}) {
  const nota = anunciante ? notaVerificacionAsistida(estado) : null
  return (
    <div
      role="note"
      aria-label={ETIQUETA_AVISO_ASISTIDO}
      className={cn(
        "flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/6 p-3.5 text-sm sm:p-4 dark:bg-primary/10",
        className
      )}
    >
      <UserRoundCog
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-primary"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {anunciante ? (
          <p className="text-pretty">
            Estás actuando por cuenta de{" "}
            {enlace ? (
              <Link
                href={enlace}
                className="inline-flex items-center gap-0.5 rounded-sm font-semibold text-foreground underline underline-offset-4 outline-none focus-visible:anillo-foco"
              >
                {anunciante}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </Link>
            ) : (
              <span className="font-semibold">{anunciante}</span>
            )}
            . Cada cambio queda en la bitácora a tu nombre y se le avisa a la
            empresa.
          </p>
        ) : (
          <p className="text-pretty">
            Elige la empresa por cuenta de la cual actúas. Cada cambio queda en
            la bitácora a tu nombre y se le avisa a la empresa.
          </p>
        )}
        <div
          aria-live="polite"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 not-empty:mt-1.5"
        >
          {nota ? (
            <>
              {estado ? (
                <InsigniaEstado catalogo={ESTADOS_ANUNCIANTE} estado={estado} />
              ) : null}
              <span className="text-pretty text-muted-foreground">{nota}</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
