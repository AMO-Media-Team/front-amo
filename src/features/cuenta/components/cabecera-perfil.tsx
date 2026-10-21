import { Building2, CalendarDays, RadioTower, ShieldCheck } from "lucide-react"

import { DistintivoRol } from "@/components/layout/avatar-usuario"
import { Badge } from "@/components/ui/badge"
import { formatearFecha, formatearFechaHora } from "@/lib/format"

import type { PerfilPropio } from "../tipos"
import { EditorAvatar } from "./editor-avatar"

const TIPO_CUENTA = {
  ADMIN: "Equipo AMO",
  ANUNCIANTE: "Anunciante",
  MEDIO: "Medio",
} as const

function nombreVisible(perfil: PerfilPropio): string {
  return perfil.nombre?.trim() || perfil.email.split("@")[0] || "Tu cuenta"
}

/**
 * Tarjeta de identidad: foto editable, nombre, correo, rol y organización,
 * sobre el degradado Aurora de la marca (igual que la ficha de usuario).
 */
export function CabeceraPerfil({
  perfil,
  avataresDisponibles,
}: {
  perfil: PerfilPropio
  avataresDisponibles: boolean
}) {
  const nombre = nombreVisible(perfil)
  const organizacion = perfil.organizacion

  return (
    <section
      aria-label="Tu identidad en AMO"
      className="relative overflow-hidden rounded-2xl border bg-card shadow-xs"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-aurora [mask-image:linear-gradient(to_bottom,black,transparent_80%)] opacity-[0.16] dark:opacity-25"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 patron-puntos opacity-50"
      />
      <div className="relative p-5 sm:p-6">
        <EditorAvatar
          nombre={nombre}
          avatarUrl={perfil.avatarUrl}
          color={perfil.rol.color}
          tieneAvatar={perfil.tieneAvatar}
          disponible={avataresDisponibles}
        >
          <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-primary uppercase">
            {TIPO_CUENTA[perfil.rol.tipo]}
          </p>
          <h2 className="truncate font-heading text-2xl leading-tight font-bold sm:text-[1.75rem]">
            {nombre}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {perfil.email}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="h-6 gap-1.5 bg-background/60 px-2.5 backdrop-blur-sm"
            >
              <DistintivoRol rol={perfil.rol} />
            </Badge>
            {organizacion ? (
              <Badge
                variant="outline"
                className="h-6 gap-1.5 bg-background/60 px-2.5 backdrop-blur-sm"
              >
                {organizacion.tipo === "ANUNCIANTE" ? (
                  <Building2 aria-hidden />
                ) : (
                  <RadioTower aria-hidden />
                )}
                {organizacion.nombre ?? TIPO_CUENTA[organizacion.tipo]}
              </Badge>
            ) : null}
            {perfil.rol.requiereMfa ? (
              <Badge
                variant="outline"
                className="h-6 gap-1.5 bg-background/60 px-2.5 backdrop-blur-sm"
              >
                <ShieldCheck aria-hidden className="text-success" />
                Verificación en dos pasos
              </Badge>
            ) : null}
            <span
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              title={formatearFechaHora(perfil.miembroDesde)}
            >
              <CalendarDays aria-hidden className="size-3.5" />
              Desde el {formatearFecha(perfil.miembroDesde, "largo")}
            </span>
          </div>
        </EditorAvatar>
      </div>
    </section>
  )
}
