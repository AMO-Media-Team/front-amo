"use client"

import { Menu } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { type ReactNode, useSyncExternalStore } from "react"

import { useSidebar } from "@/components/ui/sidebar"
import { useConteoNoLeidas } from "@/features/notificaciones/fuente"
import { perteneceA } from "@/lib/auth/navegacion"
import { cn } from "@/lib/utils"

import { useShell } from "./contexto-shell"
import {
  type DestinoBarra,
  destinosBarraInferior,
} from "./destinos-barra-inferior"

const MAXIMO_CONTEO = 9

const suscribirNada = () => () => {}

/** El conteo solo se pinta ya en el navegador (igual que la campana). */
function useHidratado(): boolean {
  return useSyncExternalStore(
    suscribirNada,
    () => true,
    () => false
  )
}

const PESTANA =
  "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 pt-1.5 pb-1 text-[0.6875rem] leading-none font-medium transition-colors outline-none focus-visible:anillo-foco active:bg-muted/60"

function ContenidoPestana({
  activa,
  icono,
  titulo,
  insignia,
}: {
  activa: boolean
  icono: ReactNode
  titulo: string
  insignia?: number
}) {
  return (
    <>
      {/* Indicador superior de la pestaña activa (además del color y del peso). */}
      <span
        aria-hidden
        className={cn(
          "absolute top-0 h-0.5 w-8 rounded-full bg-primary transition-opacity duration-200",
          activa ? "opacity-100" : "opacity-0"
        )}
      />
      <span className="relative">
        {icono}
        {insignia ? (
          <span
            aria-hidden
            className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.625rem] leading-none font-semibold cifras text-primary-foreground ring-2 ring-background"
          >
            {insignia > MAXIMO_CONTEO ? `${MAXIMO_CONTEO}+` : insignia}
          </span>
        ) : null}
      </span>
      <span className="max-w-full truncate">{titulo}</span>
    </>
  )
}

function Destino({
  destino,
  activa,
  noLeidas,
}: {
  destino: DestinoBarra
  activa: boolean
  noLeidas: number
}) {
  const Icono = destino.item.icono
  const insignia = destino.id === "notificaciones" ? noLeidas : 0
  const etiqueta =
    insignia > 0
      ? `${destino.titulo}, ${insignia === 1 ? "1 sin leer" : `${insignia} sin leer`}`
      : undefined
  return (
    <li className="min-w-0">
      <Link
        href={destino.item.href}
        aria-current={activa ? "page" : undefined}
        aria-label={etiqueta}
        className={cn(
          PESTANA,
          activa
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <ContenidoPestana
          activa={activa}
          icono={
            <Icono
              aria-hidden
              className="size-5"
              strokeWidth={activa ? 2.25 : 1.75}
            />
          }
          titulo={destino.titulo}
          insignia={insignia}
        />
      </Link>
    </li>
  )
}

/**
 * Clase que reserva en el `<main>` el alto de la barra (pestañas de 56 px,
 * borde y área segura del teléfono) para que no tape el final de la página.
 */
export const RESERVA_BARRA_INFERIOR =
  "max-md:pb-[calc(3.5rem+1px+env(safe-area-inset-bottom))]"

/**
 * Barra de navegación inferior en móvil (< 768 px) para el rol MEDIO: sus
 * destinos del día a día al alcance del pulgar y "Menú" para el resto (abre
 * la barra lateral). Los destinos salen de la navegación ya filtrada por
 * permisos. La monta `ShellAplicacion`, fija al pie y en todas las secciones;
 * el `<main>` reserva su alto con `RESERVA_BARRA_INFERIOR`.
 */
export function BarraInferior() {
  const { navegacion } = useShell()
  const { openMobile, setOpenMobile } = useSidebar()
  const ruta = usePathname()
  const hidratado = useHidratado()
  const conteo = useConteoNoLeidas()
  const noLeidas = hidratado ? (conteo.data?.total ?? 0) : 0
  const destinos = destinosBarraInferior(navegacion)

  return (
    <nav
      // Distinto de «Principal» (la barra lateral): dos regiones de
      // navegación con casi el mismo nombre no se distinguen al listarlas.
      aria-label="Accesos directos"
      style={{ viewTransitionName: "amo-barra-inferior" }}
      // Casi opaca: con más transparencia el texto que pasa por debajo se
      // confundía con los rótulos de las pestañas.
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
    >
      <ul
        className="mx-auto grid max-w-md gap-1 px-2"
        style={{
          gridTemplateColumns: `repeat(${destinos.length + 1}, minmax(0, 1fr))`,
        }}
      >
        {destinos.map((destino) => (
          <Destino
            key={destino.id}
            destino={destino}
            activa={perteneceA(ruta, destino.item.href)}
            noLeidas={noLeidas}
          />
        ))}
        <li className="min-w-0">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={openMobile}
            onClick={() => setOpenMobile(true)}
            className={cn(
              PESTANA,
              "w-full text-muted-foreground hover:text-foreground"
            )}
          >
            <ContenidoPestana
              activa={false}
              icono={<Menu aria-hidden className="size-5" strokeWidth={1.75} />}
              titulo="Menú"
            />
          </button>
        </li>
      </ul>
    </nav>
  )
}
