import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { LogoAnimado } from "@/components/brand/logo-animado"
import { cn } from "@/lib/utils"

interface EncabezadoAuthProps {
  titulo: string
  descripcion?: ReactNode
  /** Icono del paso (MFA, contraseña…) en lugar del logo animado. */
  icono?: LucideIcon
  className?: string
}

/** Título de cada pantalla de acceso: logo animado (o icono del paso), h1 y apoyo. */
export function EncabezadoAuth({
  titulo,
  descripcion,
  icono: Icono,
  className,
}: EncabezadoAuthProps) {
  return (
    <header className={cn("flex flex-col gap-5", className)}>
      {Icono ? (
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Icono className="size-6" aria-hidden />
        </span>
      ) : (
        <LogoAnimado
          size={48}
          bucle={false}
          className="hidden lg:inline-flex"
        />
      )}
      <div className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] leading-tight font-bold sm:text-[2rem]">
          {titulo}
        </h1>
        {descripcion ? (
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            {descripcion}
          </p>
        ) : null}
      </div>
    </header>
  )
}
