import { ArrowUpRight, ListChecks, Users } from "lucide-react"
import Link from "next/link"

import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { contarSensibles } from "../catalogo"
import { noAplicables, totalAplicables } from "../reglas"
import { rutaRol } from "../rutas"
import type { ActorRoles, RolListado } from "../tipos"
import {
  BarraCobertura,
  estiloColorRol,
  IconoRol,
  InsigniaMfa,
  InsigniaOrigen,
  InsigniaRevisar,
  InsigniaTipo,
} from "./distintivos-rol"
import { MenuAccionesRol } from "./menu-acciones-rol"

function Cifra({
  Icono,
  valor,
  etiqueta,
  titulo,
}: {
  Icono: typeof Users
  valor: string
  etiqueta: string
  titulo?: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5" title={titulo}>
      <Icono className="size-3.5 text-muted-foreground" aria-hidden />
      <span className="font-medium cifras text-foreground">{valor}</span>
      <span className="text-muted-foreground">{etiqueta}</span>
    </span>
  )
}

/**
 * Tarjeta de un rol en el listado: toda la tarjeta enlaza a su matriz de
 * permisos (enlace estirado) y el menú de acciones queda por encima.
 */
export function TarjetaRol({
  rol,
  actor,
  indice,
}: {
  rol: RolListado
  actor: ActorRoles
  indice: number
}) {
  const sensibles = contarSensibles(rol.permisos)
  const total = totalAplicables(rol.tipo)
  const ajenos = noAplicables(rol.tipo, rol.permisos).length
  const usuarios =
    rol.usuarios === null
      ? {
          valor: "—",
          etiqueta: "usuarios",
          titulo: "Necesitas «Ver usuarios» para contarlos",
        }
      : {
          valor: formatearNumero(rol.usuarios),
          etiqueta: rol.usuarios === 1 ? "usuario" : "usuarios",
        }

  return (
    <article
      style={{
        ...estiloColorRol(rol.color),
        animationDelay: `${Math.min(indice, 8) * 50}ms`,
      }}
      className={cn(
        "group/tarjeta relative isolate flex animate-aparecer-arriba flex-col overflow-hidden rounded-xl border bg-card motion-reduce:animate-none",
        "transition-[border-color,box-shadow,translate] duration-300 ease-suave hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--color-rol)_45%,var(--border))] hover:shadow-lg motion-reduce:hover:translate-y-0",
        "has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/40"
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,var(--color-rol),color-mix(in_oklab,var(--color-rol)_20%,transparent))]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -left-16 -z-10 size-48 rounded-full bg-(--color-rol) opacity-[0.07] blur-3xl transition-opacity duration-500 group-hover/tarjeta:opacity-[0.16] dark:opacity-[0.1] dark:group-hover/tarjeta:opacity-[0.22]"
      />

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <IconoRol rol={rol} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h3 className="flex items-center gap-1 text-[0.9375rem] leading-snug font-semibold">
              <Link
                href={rutaRol(rol.id)}
                className="min-w-0 truncate outline-none after:absolute after:inset-0 after:content-['']"
              >
                {rol.nombre}
              </Link>
              <ArrowUpRight
                aria-hidden
                className="size-3.5 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-[opacity,translate] duration-300 group-hover/tarjeta:translate-x-0 group-hover/tarjeta:opacity-100"
              />
            </h3>
            <code className="truncate font-mono text-[0.6875rem] tracking-wide text-muted-foreground">
              {rol.clave}
            </code>
          </div>
          <MenuAccionesRol rol={rol} actor={actor} variante="tarjeta" />
        </div>

        <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
          {rol.descripcion ?? "Sin descripción."}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <InsigniaTipo tipo={rol.tipo} />
          <InsigniaOrigen esSistema={rol.esSistema} />
          {rol.requiereMfa ? <InsigniaMfa /> : null}
          {ajenos > 0 ? <InsigniaRevisar cantidad={ajenos} /> : null}
        </div>
      </div>

      <footer className="flex flex-col gap-2.5 border-t bg-muted/25 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
          <Cifra Icono={Users} {...usuarios} />
          <Cifra
            Icono={ListChecks}
            valor={`${formatearNumero(rol.permisos.length)}/${formatearNumero(total)}`}
            etiqueta={sensibles > 0 ? `permisos · ${sensibles} ★` : "permisos"}
            titulo={
              sensibles > 0
                ? `${sensibles} de sus permisos son sensibles`
                : undefined
            }
          />
        </div>
        <BarraCobertura
          cantidad={rol.permisos.length}
          total={total}
          color={rol.color}
        />
      </footer>
    </article>
  )
}
