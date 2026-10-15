import type { VariantProps } from "class-variance-authority"
import Link from "next/link"
import type { ComponentProps } from "react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type EstiloBoton = VariantProps<typeof buttonVariants>

/**
 * Enlace con aspecto de botón. Úsalo siempre que el «botón» lleve a otra
 * página: es un `<a>` de verdad, así el lector de pantalla lo anuncia como
 * enlace y funcionan abrir en pestaña nueva o copiar la dirección.
 *
 * No uses `<Button render={<Link />} nativeButton={false}>`: Base UI le pone
 * `role="button"` al `<a>` y la navegación se anuncia como un botón.
 */
export function EnlaceBoton({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & EstiloBoton) {
  return (
    <Link
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

/**
 * Lo mismo con un `<a>` nativo, para lo que el enrutador de Next no debe
 * interceptar: otros esquemas (`otpauth:`, `mailto:`) y sitios externos.
 */
export function EnlaceBotonExterno({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"a"> & EstiloBoton) {
  return (
    <a
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
