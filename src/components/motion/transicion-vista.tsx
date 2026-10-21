"use client"

/**
 * Único punto de uso de `ViewTransition` de React (regla de ESLint). Aísla la
 * API para poder degradarla: si React no la exporta se usa un Fragment, y con
 * `prefers-reduced-motion` se desactivan todas las animaciones.
 *
 * Con movimiento reducido NO se cambia a Fragment: alternar el tipo de
 * componente remontaría a los hijos (perdiendo estado de formularios), así que
 * se conserva el nodo y se pasan las clases a "none".
 */
import { useReducedMotion } from "motion/react"
import {
  Fragment,
  type ReactNode,
  ViewTransition,
  type ViewTransitionProps,
} from "react"

// Puede faltar en runtimes de React sin la API (p. ej. entornos de test antiguos).
const ViewTransitionNativa: typeof ViewTransition | undefined = ViewTransition

/** Tipos para `<Link transitionTypes>` / `router.push(..., { transitionTypes })`. */
export const TIPOS_TRANSICION = {
  adelante: "nav-adelante",
  atras: "nav-atras",
} as const

const SIN_ANIMACION = {
  default: "none",
  enter: "none",
  exit: "none",
  update: "none",
  share: "none",
} as const satisfies Partial<ViewTransitionProps>

export type TransicionVistaProps = ViewTransitionProps

export function TransicionVista(props: TransicionVistaProps) {
  const reducido = useReducedMotion()

  if (!ViewTransitionNativa) return <Fragment>{props.children}</Fragment>
  return (
    <ViewTransitionNativa {...props} {...(reducido ? SIN_ANIMACION : null)} />
  )
}

const CLASES_PAGINA = {
  [TIPOS_TRANSICION.adelante]: TIPOS_TRANSICION.adelante,
  [TIPOS_TRANSICION.atras]: TIPOS_TRANSICION.atras,
  default: "pagina",
}

/**
 * Envoltura de contenido de página (va en cada `page.tsx`, no en layouts: los
 * layouts persisten y nunca entran/salen). Entrada y salida con fundido y
 * desplazamiento corto; direccional si la navegación declara un tipo.
 */
export function TransicionPagina({ children }: { children: ReactNode }) {
  return (
    <TransicionVista
      enter={CLASES_PAGINA}
      exit={CLASES_PAGINA}
      update="none"
      default="none"
    >
      {children}
    </TransicionVista>
  )
}
