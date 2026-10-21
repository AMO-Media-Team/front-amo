import { ArrowLeft, ListChecks, Star, Users } from "lucide-react"
import type { ReactNode } from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { TituloMiga } from "@/components/layout/titulo-miga"
import {
  formatearFecha,
  formatearFechaHora,
  formatearRelativo,
} from "@/lib/format"

import { contarSensibles } from "../catalogo"
import { pluralizar, TIPOS_ROL_ETIQUETA } from "../presentacion"
import { noAplicables, totalAplicables } from "../reglas"
import { RUTA_ROLES } from "../rutas"
import type { ActorRoles, RolDetalle } from "../tipos"
import {
  estiloColorRol,
  IconoRol,
  InsigniaMfa,
  InsigniaOrigen,
  InsigniaPropio,
  InsigniaRevisar,
} from "./distintivos-rol"
import { MenuAccionesRol } from "./menu-acciones-rol"

function Dato({
  Icono,
  children,
}: {
  Icono: typeof Users
  children: ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icono className="size-4 shrink-0" aria-hidden />
      {children}
    </span>
  )
}

/**
 * Cabecera de la ficha de un rol: identidad con su color, tipo, origen
 * (sistema o personalizado), MFA, cifras y acciones permitidas.
 */
export function CabeceraRol({
  rol,
  actor,
  esPropio,
}: {
  rol: RolDetalle
  actor: ActorRoles
  esPropio: boolean
}) {
  const sensibles = contarSensibles(rol.permisos)
  const ajenos = noAplicables(rol.tipo, rol.permisos).length

  return (
    <div className="flex flex-col gap-4">
      <TituloMiga titulo={rol.nombre} />
      <EnlaceBoton
        href={RUTA_ROLES}
        variant="ghost"
        size="sm"
        className="group/volver -ml-2 w-fit text-muted-foreground"
      >
        <ArrowLeft
          data-icon="inline-start"
          aria-hidden
          className="transition-transform duration-200 group-hover/volver:-translate-x-0.5"
        />
        Roles y permisos
      </EnlaceBoton>
      <header
        style={estiloColorRol(rol.color)}
        className="relative isolate overflow-hidden rounded-2xl border bg-card"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_140%_at_0%_0%,color-mix(in_oklab,var(--color-rol)_26%,transparent),transparent_60%)] dark:bg-[radial-gradient(120%_140%_at_0%_0%,color-mix(in_oklab,var(--color-rol)_30%,transparent),transparent_60%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 patron-puntos opacity-40"
        />
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--color-rol),color-mix(in_oklab,var(--color-rol)_10%,transparent))]"
        />
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
            <IconoRol rol={rol} tamano="lg" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-primary uppercase">
                {TIPOS_ROL_ETIQUETA[rol.tipo]}
              </p>
              <h1 className="min-w-0 text-2xl leading-tight font-bold break-words sm:text-[1.75rem]">
                {rol.nombre}
              </h1>
              <code className="w-fit rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-xs tracking-wide text-muted-foreground">
                {rol.clave}
              </code>
              {rol.descripcion ? (
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  {rol.descripcion}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                {esPropio ? <InsigniaPropio /> : null}
                <InsigniaOrigen esSistema={rol.esSistema} />
                {rol.requiereMfa ? <InsigniaMfa /> : null}
                {ajenos > 0 ? <InsigniaRevisar cantidad={ajenos} /> : null}
                <Dato Icono={ListChecks}>
                  <span className="font-medium cifras text-foreground">
                    {rol.permisos.length}/{totalAplicables(rol.tipo)}
                  </span>{" "}
                  permisos
                </Dato>
                {sensibles > 0 ? (
                  <Dato Icono={Star}>
                    <span className="font-medium cifras text-foreground">
                      {sensibles}
                    </span>{" "}
                    {sensibles === 1 ? "sensible" : "sensibles"}
                  </Dato>
                ) : null}
                {rol.usuarios !== null ? (
                  <Dato Icono={Users}>
                    <span className="font-medium cifras text-foreground">
                      {pluralizar(rol.usuarios, "cuenta", "cuentas")}
                    </span>
                  </Dato>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <MenuAccionesRol rol={rol} actor={actor} variante="ficha" />
            <p className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground lg:flex-col lg:items-end lg:text-right">
              <span>
                {rol.esSistema
                  ? "Incluido con la plataforma"
                  : `Creado el ${formatearFecha(rol.creadoAt, "largo")}`}
              </span>
              <span aria-hidden className="lg:hidden">
                ·
              </span>
              <span title={formatearFechaHora(rol.actualizadoAt)}>
                Actualizado {formatearRelativo(rol.actualizadoAt)}
              </span>
            </p>
          </div>
        </div>
      </header>
    </div>
  )
}
