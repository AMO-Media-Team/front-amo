"use client"

import {
  LockKeyhole,
  type LucideIcon,
  SlidersHorizontal,
  UserRound,
} from "lucide-react"
import * as m from "motion/react-m"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { perteneceA, RUTA_PERFIL, RUTA_SEGURIDAD } from "@/lib/auth/navegacion"
import { cn } from "@/lib/utils"

const RUTA_PREFERENCIAS: Route = "/cuenta/preferencias"

interface SeccionNavegable {
  href: Route
  titulo: string
  descripcion: string
  icono: LucideIcon
}

const SECCIONES: readonly SeccionNavegable[] = [
  {
    href: RUTA_PERFIL,
    titulo: "Perfil",
    descripcion: "Nombre, celular y foto",
    icono: UserRound,
  },
  {
    href: RUTA_SEGURIDAD,
    titulo: "Seguridad",
    descripcion: "Contraseña y sesiones",
    icono: LockKeyhole,
  },
  {
    href: RUTA_PREFERENCIAS,
    titulo: "Preferencias",
    descripcion: "Tema, densidad y cifras",
    icono: SlidersHorizontal,
  },
]

/**
 * Navegación entre las secciones de «Mi cuenta»: lista vertical fija en
 * escritorio y fila desplazable en móvil. El indicador se desliza entre
 * secciones (el layout persiste al navegar).
 */
export function NavegacionCuenta() {
  const ruta = usePathname()

  return (
    <nav
      aria-label="Secciones de mi cuenta"
      className="min-w-0 lg:sticky lg:top-20 lg:self-start"
    >
      <ul className="grid grid-cols-3 gap-1 rounded-2xl border bg-muted/30 p-1 lg:flex lg:flex-col lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
        {SECCIONES.map(({ href, titulo, descripcion, icono: Icono }) => {
          const activa = perteneceA(ruta, href)
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "group relative flex items-center justify-center gap-2 rounded-xl px-2 py-2 text-sm transition-colors outline-none focus-visible:anillo-foco sm:gap-2.5 lg:justify-start lg:gap-3 lg:px-3 lg:py-2.5",
                  activa
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                {activa ? (
                  <m.span
                    layoutId="indicador-cuenta"
                    aria-hidden
                    className="absolute inset-0 rounded-xl bg-card shadow-xs ring-1 ring-border"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                ) : null}
                <span
                  aria-hidden
                  className={cn(
                    "relative hidden size-7 shrink-0 place-items-center rounded-lg transition-colors sm:grid",
                    activa
                      ? "bg-primary/12 text-primary"
                      : "bg-muted/70 text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  <Icono className="size-4" />
                </span>
                <span className="relative flex min-w-0 flex-col">
                  <span className="truncate font-medium">{titulo}</span>
                  <span className="hidden text-xs text-muted-foreground lg:block">
                    {descripcion}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
