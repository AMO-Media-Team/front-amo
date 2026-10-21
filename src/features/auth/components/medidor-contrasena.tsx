import { Check, Circle } from "lucide-react"

import { cn } from "@/lib/utils"

import {
  ETIQUETAS_NIVEL,
  evaluarContrasena,
  type NivelContrasena,
  REGLAS_CONTRASENA,
} from "./politica-contrasena"

const COLOR_NIVEL: Record<NivelContrasena, string> = {
  vacia: "bg-muted-foreground/30",
  debil: "bg-destructive",
  aceptable: "bg-warning",
  fuerte: "bg-success",
  excelente: "bg-success",
}

const TEXTO_NIVEL: Record<NivelContrasena, string> = {
  vacia: "text-muted-foreground",
  debil: "text-destructive",
  aceptable: "text-warning",
  fuerte: "text-success",
  excelente: "text-success",
}

interface MedidorContrasenaProps {
  valor: string
  id?: string
  className?: string
}

/**
 * Fortaleza de la contraseña y lista de reglas. El color nunca es la única
 * señal: cada regla lleva icono y el nivel se nombra con texto.
 */
export function MedidorContrasena({
  valor,
  id,
  className,
}: MedidorContrasenaProps) {
  const { cumplidas, puntaje, nivel } = evaluarContrasena(valor)
  const segmentosActivos = nivel === "excelente" ? 5 : puntaje

  return (
    <div id={id} className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-3">
        <div
          className="grid flex-1 grid-cols-5 gap-1.5"
          role="meter"
          aria-label="Seguridad de la contraseña"
          aria-valuemin={0}
          aria-valuemax={REGLAS_CONTRASENA.length}
          aria-valuenow={puntaje}
          aria-valuetext={ETIQUETAS_NIVEL[nivel]}
        >
          {REGLAS_CONTRASENA.map((regla, indice) => (
            <span
              key={regla.id}
              className={cn(
                "h-1.5 rounded-full transition-colors duration-300",
                indice < segmentosActivos ? COLOR_NIVEL[nivel] : "bg-muted"
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            "min-w-20 text-right text-xs font-medium",
            TEXTO_NIVEL[nivel]
          )}
        >
          {ETIQUETAS_NIVEL[nivel]}
        </span>
      </div>
      <ul className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        {REGLAS_CONTRASENA.map((regla) => {
          const cumple = cumplidas[regla.id]
          return (
            <li
              key={regla.id}
              className={cn(
                "flex items-center gap-2 transition-colors",
                cumple ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {cumple ? (
                <Check aria-hidden className="size-3.5 text-success" />
              ) : (
                <Circle aria-hidden className="size-3.5 opacity-50" />
              )}
              <span>
                {regla.descripcion}
                <span className="sr-only">
                  {cumple ? ": cumple" : ": pendiente"}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
