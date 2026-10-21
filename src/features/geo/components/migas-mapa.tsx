"use client"

import { ChevronRight, CornerLeftUp, Earth } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { type EstadoNivel, migasMapa, subirNivel } from "../niveles"

interface MigasMapaProps {
  estado: EstadoNivel
  onIr: (destino: EstadoNivel) => void
  /** Solo el ícono en "Subir nivel" (móvil). */
  compacto?: boolean
  /** Incluir el botón "Subir nivel" junto a las migas. */
  conSubir?: boolean
  className?: string
}

/** "Subir nivel" (también con Esc); no se pinta en el nivel más alto. */
export function BotonSubirNivel({
  estado,
  onIr,
  compacto = false,
  className,
}: Pick<MigasMapaProps, "estado" | "onIr" | "compacto" | "className">) {
  const superior = subirNivel(estado)
  if (!superior) return null
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size={compacto ? "icon-sm" : "sm"}
            onClick={() => onIr(superior)}
            aria-label="Subir nivel"
            aria-keyshortcuts="Escape"
            className={cn(
              "shrink-0 text-muted-foreground hover:text-foreground",
              className
            )}
          />
        }
      >
        <CornerLeftUp aria-hidden />
        {compacto ? null : <span>Subir</span>}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Subir nivel <Kbd>Esc</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

/** "Mundo › Colombia › Antioquia" con "Subir nivel" (también con Esc). */
export function MigasMapa({
  estado,
  onIr,
  compacto = false,
  conSubir = true,
  className,
}: MigasMapaProps) {
  const migas = migasMapa(estado)

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <nav aria-label="Nivel del mapa" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-0.5 text-sm">
          {migas.map((miga, indice) => (
            <li
              key={miga.etiqueta}
              className={cn(
                "flex items-center gap-0.5",
                indice === migas.length - 1 ? "min-w-0" : "shrink-0"
              )}
            >
              {indice > 0 ? (
                <ChevronRight
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground/70"
                />
              ) : null}
              {miga.destino ? (
                <button
                  type="button"
                  onClick={() => miga.destino && onIr(miga.destino)}
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:anillo-foco"
                >
                  {indice === 0 ? (
                    <Earth aria-hidden className="size-3.5" />
                  ) : null}
                  {/* En móvil "Mundo" queda solo como ícono: el nivel actual necesita el espacio. */}
                  <span
                    className={cn(
                      indice === 0 && compacto && migas.length > 2 && "sr-only"
                    )}
                  >
                    {miga.etiqueta}
                  </span>
                </button>
              ) : (
                <span
                  aria-current="location"
                  // Destino del foco al cambiar de nivel (ver `useFocoTrasCambioDeNivel`).
                  data-miga-actual=""
                  tabIndex={-1}
                  className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-foreground outline-none focus-visible:anillo-foco"
                >
                  {indice === 0 ? (
                    <Earth aria-hidden className="size-3.5 shrink-0" />
                  ) : null}
                  <span className="truncate">{miga.etiqueta}</span>
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {conSubir ? (
        <BotonSubirNivel estado={estado} onIr={onIr} compacto={compacto} />
      ) : null}
    </div>
  )
}
