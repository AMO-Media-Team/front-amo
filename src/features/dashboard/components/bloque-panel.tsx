import { type CSSProperties, type ReactNode, Suspense } from "react"

import { cn } from "@/lib/utils"

import { LimiteErrorBloque } from "./limite-error-bloque"

/*
 * Rejillas de los paneles. Miden el panel (`@container/panel`, en
 * `ContenidoPanel`) y no la ventana: la barra lateral abierta le quita 256 px
 * al contenido, y a 1280 px de ventana el panel mide ~950 px.
 *
 * - Menos de 56 rem: una columna.
 * - De 56 a 68 rem: parejas iguales (un gráfico junto a su lista).
 * - Desde 68 rem: tres columnas, el bloque principal en dos (cada tercio
 *   ≥ 340 px: con menos, la dona parte los nombres de su leyenda y el embudo
 *   recorta sus rótulos).
 */

/** Fila de un bloque principal y su acompañante. */
export const FILA_PRINCIPAL =
  "@4xl/panel:grid-cols-2 @[68rem]/panel:grid-cols-3"
/** El bloque principal de `FILA_PRINCIPAL`: dos tercios en la rejilla de tres. */
export const PRINCIPAL = "@[68rem]/panel:col-span-2"
/**
 * Fila de tres bloques del mismo peso: el primero a lo ancho y los otros dos
 * en pareja desde 42 rem; los tres en fila desde 68 rem.
 */
export const FILA_TERCIOS = "@2xl/panel:grid-cols-2 @[68rem]/panel:grid-cols-3"
export const PRIMERO_DE_TERCIOS =
  "@2xl/panel:col-span-2 @[68rem]/panel:col-span-1"

/**
 * Celda de la rejilla del panel: límite de error propio + Suspense con un
 * esqueleto fiel. Cada bloque consulta en paralelo y aparece en cuanto llega
 * (con un fundido ascendente escalonado por `orden`). La celda es un
 * contenedor de consultas de tamaño (`@…/bloque:`): su contenido se acomoda
 * al ancho de la celda, sea una columna de tres o la fila completa.
 */
export function BloquePanel({
  titulo,
  esqueleto,
  orden = 0,
  className,
  children,
}: {
  titulo: string
  esqueleto: ReactNode
  /** Posición visual: escalona la entrada cuando varios llegan a la vez. */
  orden?: number
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "@container/bloque flex min-w-0 flex-col *:flex-1",
        className
      )}
    >
      <LimiteErrorBloque titulo={titulo}>
        <Suspense fallback={esqueleto}>
          <EntradaBloque orden={orden}>{children}</EntradaBloque>
        </Suspense>
      </LimiteErrorBloque>
    </div>
  )
}

/** Animación CSS (no motion): se pinta en SSR sin esperar a hidratar. */
function EntradaBloque({
  orden,
  children,
}: {
  orden: number
  children: ReactNode
}) {
  const estilo: CSSProperties = {
    animationDelay: `${Math.min(orden, 8) * 45}ms`,
  }
  return (
    <div
      className="flex min-w-0 animate-aparecer-arriba flex-col *:flex-1 motion-reduce:animate-none"
      style={estilo}
    >
      {children}
    </div>
  )
}
