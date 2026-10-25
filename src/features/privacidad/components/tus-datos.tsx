import { ArrowRight, Database } from "lucide-react"
import Link from "next/link"

import { SeccionCuenta } from "@/features/cuenta/components/seccion-cuenta"

import type { CategoriaDatos } from "../presentacion"

/**
 * «Tus datos» (CTA-007): qué datos personales trata AMO del titular, por
 * categoría, y dónde corregirlos él mismo. Lo que no puede editar (el correo,
 * la bitácora) se pide con una solicitud.
 */
export function TusDatos({ categorias }: { categorias: CategoriaDatos[] }) {
  return (
    <SeccionCuenta
      id="tus-datos"
      titulo="Tus datos"
      icono={Database}
      descripcion="Lo que AMO trata de ti para operar la plataforma, y dónde corregirlo tú mismo."
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {categorias.map((categoria) => (
          <li
            key={categoria.id}
            className="flex min-w-0 flex-col gap-2 rounded-xl border bg-background/60 p-4"
          >
            <h3 className="text-sm font-semibold">{categoria.titulo}</h3>
            <p className="text-sm text-pretty text-muted-foreground">
              {categoria.datos.join(" · ")}
            </p>
            {categoria.nota ? (
              <p className="text-xs text-pretty text-muted-foreground">
                {categoria.nota}
              </p>
            ) : null}
            {categoria.enlace ? (
              <Link
                href={categoria.enlace.href}
                className="mt-auto inline-flex min-h-6 w-fit items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:anillo-foco"
              >
                {categoria.enlace.texto}
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </SeccionCuenta>
  )
}
