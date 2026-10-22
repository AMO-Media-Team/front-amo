import { ArrowRight, RadioTower } from "lucide-react"
import Link from "next/link"

import { cn } from "@/lib/utils"

import { RUTA_FORMULARIO } from "../presentacion"

/**
 * «¿Tienes un medio? Pide unirte»: la entrada al formulario público desde
 * «Ingresar». Discreta, para no competir con el ingreso.
 */
export function EnlaceVincular({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl border border-dashed bg-card/40 px-4 py-3 text-sm",
        className
      )}
    >
      <RadioTower aria-hidden className="size-4 shrink-0 text-primary" />
      <span className="text-muted-foreground">¿Tienes un medio?</span>
      <Link
        href={RUTA_FORMULARIO}
        className="group inline-flex min-h-6 items-center gap-1 rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:anillo-foco"
      >
        Pide unirte
        <ArrowRight
          aria-hidden
          className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </Link>
    </p>
  )
}
