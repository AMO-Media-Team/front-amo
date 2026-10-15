"use client"

import { createContext, type ReactNode, use } from "react"

import type { GrupoNavegacion } from "@/lib/auth/navegacion"
import type { UsuarioSesion } from "@/lib/auth/tipos"

interface ValorShell {
  usuario: UsuarioSesion
  /** Navegación ya filtrada por los permisos del usuario. */
  navegacion: readonly GrupoNavegacion[]
  /** Abre el menú de comandos (⌘K). */
  abrirComandos: () => void
}

const ContextoShell = createContext<ValorShell | null>(null)

export function ProveedorShell({
  valor,
  children,
}: {
  valor: ValorShell
  children: ReactNode
}) {
  return <ContextoShell value={valor}>{children}</ContextoShell>
}

export function useShell(): ValorShell {
  const valor = use(ContextoShell)
  if (!valor)
    throw new Error("useShell debe usarse dentro de <ShellAplicacion>.")
  return valor
}
