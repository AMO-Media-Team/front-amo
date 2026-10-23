"use client"

import { Building2, FileText, type LucideIcon, UsersRound } from "lucide-react"
import * as m from "motion/react-m"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useShell } from "@/components/layout/contexto-shell"
import { tieneAlgunPermiso } from "@/lib/auth/autorizacion"
import { perteneceA } from "@/lib/auth/navegacion"
import type { ClavePermiso } from "@/lib/auth/permisos"
import { cn } from "@/lib/utils"

import { RUTAS_EMPRESA } from "../rutas"

interface SeccionNavegable {
  href: Route
  titulo: string
  icono: LucideIcon
  /** «Datos» es la raíz: solo se marca en `/empresa`, no en sus subpáginas. */
  exacta?: boolean
  /** Permiso que exige su página; sin él, la pestaña no se ofrece. */
  permiso?: ClavePermiso
}

const SECCIONES: readonly SeccionNavegable[] = [
  {
    href: RUTAS_EMPRESA.inicio,
    titulo: "Datos",
    icono: Building2,
    exacta: true,
    permiso: "anunciantes.editar_propio",
  },
  {
    href: RUTAS_EMPRESA.documentos,
    titulo: "Documentos",
    icono: FileText,
    permiso: "anunciantes.editar_propio",
  },
  // ANU-002: cualquier usuario de la empresa ve a sus compañeros.
  { href: RUTAS_EMPRESA.equipo, titulo: "Equipo", icono: UsersRound },
]

/**
 * Navegación entre las secciones de «Mi empresa»: hasta tres pestañas que
 * caben a 390 px, solo las que el rol puede abrir (sin permiso para editar la
 * empresa queda solo «Equipo» y no hace falta navegar). El indicador se
 * desliza entre secciones (el layout persiste al navegar) y respeta el
 * movimiento reducido (LazyMotion con `MotionConfig`).
 */
export function NavegacionEmpresa() {
  const ruta = usePathname()
  const { usuario } = useShell()
  const secciones = SECCIONES.filter(
    ({ permiso }) => !permiso || tieneAlgunPermiso(usuario, [permiso])
  )
  if (secciones.length < 2) return null
  return (
    <nav aria-label="Secciones de mi empresa" className="min-w-0">
      <ul
        className="grid gap-1 rounded-2xl border bg-muted/30 p-1 sm:inline-grid sm:w-auto sm:min-w-md"
        style={{
          gridTemplateColumns: `repeat(${secciones.length}, minmax(0, 1fr))`,
        }}
      >
        {secciones.map(({ href, titulo, icono: Icono, exacta }) => {
          const activa = exacta ? ruta === href : perteneceA(ruta, href)
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "group relative flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 py-2 text-sm transition-colors outline-none focus-visible:anillo-foco",
                  activa
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                {activa ? (
                  <m.span
                    layoutId="indicador-empresa"
                    aria-hidden
                    className="absolute inset-0 rounded-xl bg-card shadow-xs ring-1 ring-border"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                ) : null}
                <Icono
                  aria-hidden
                  className={cn(
                    "relative size-4 shrink-0",
                    activa ? "text-primary" : undefined
                  )}
                />
                <span className="relative truncate font-medium">{titulo}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
