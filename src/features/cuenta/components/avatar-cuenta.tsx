import type { CSSProperties } from "react"

import { iniciales } from "@/components/layout/iniciales"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

/** Avatar grande de la cuenta: foto firmada o iniciales, anillo del color del rol. */
export function AvatarCuenta({
  nombre,
  url,
  color,
  className,
}: {
  nombre: string
  url: string | null
  color: string
  className?: string
}) {
  return (
    <Avatar
      size="lg"
      className={cn(
        "ring-2 ring-offset-4 ring-offset-card data-[size=lg]:size-20 sm:data-[size=lg]:size-24",
        className
      )}
      style={{ "--tw-ring-color": `${color}99` } as CSSProperties}
    >
      {url ? <AvatarImage src={url} alt={`Foto de ${nombre}`} /> : null}
      <AvatarFallback className="bg-primary/12 font-heading text-2xl font-bold text-lila-700 sm:text-3xl dark:text-primary">
        {iniciales(nombre)}
      </AvatarFallback>
    </Avatar>
  )
}
