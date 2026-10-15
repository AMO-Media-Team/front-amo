import Link from "next/link"

import { Logotipo } from "@/components/brand/logotipo"
import { ID_CONTENIDO } from "@/components/feedback/salto-contenido"
import { SelectorTema } from "@/components/layout/selector-tema"
import { PanelMarca } from "@/features/auth/components/panel-marca"

/**
 * Pantallas de acceso: panel de marca a la izquierda (escritorio) y el
 * formulario a la derecha. En móvil, solo el formulario con el logo arriba.
 */
export default function LayoutAcceso({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      <PanelMarca />

      <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
        {/* Textura y halo Aurora discretos cuando no hay panel de marca. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 patron-puntos opacity-70 lg:hidden"
        />
        <div
          aria-hidden
          className="absolute -top-40 left-1/2 -z-10 size-[26rem] -translate-x-1/2 rounded-full bg-aurora opacity-15 blur-3xl lg:hidden dark:opacity-20"
        />

        <header className="flex items-center justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-7">
          <Link
            href="/ingresar"
            aria-label="AMO, ir al ingreso"
            className="rounded-md focus-visible:anillo-foco lg:invisible"
          >
            <Logotipo alto={30} aria-hidden />
          </Link>
          <SelectorTema />
        </header>

        <main
          id={ID_CONTENIDO}
          tabIndex={-1}
          className="flex flex-1 items-center justify-center px-5 py-10 outline-none sm:px-8"
        >
          {/* En tablet el formulario va en tarjeta para anclar la composición
              (el panel de marca solo aparece desde 1024 px). */}
          <div className="w-full max-w-[25.5rem] motion-safe:animate-aparecer-arriba md:max-w-[29rem] md:rounded-3xl md:border md:bg-card/70 md:p-10 md:shadow-glow md:backdrop-blur-sm lg:max-w-[25.5rem] lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
            {children}
          </div>
        </main>

        <footer className="flex flex-col items-center gap-1 px-5 pb-6 text-center text-xs text-muted-foreground sm:px-8">
          <p>El acceso es solo por invitación.</p>
          <p>AMO · Advertising Market Optimization</p>
        </footer>
      </div>
    </div>
  )
}
