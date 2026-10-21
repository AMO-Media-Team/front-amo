import {
  KeyRound,
  ListChecks,
  type LucideIcon,
  ShieldCheck,
  Users,
} from "lucide-react"

import { NumeroAnimado } from "@/components/motion/numero-animado"
import { CLAVES_PERMISO, PERMISOS } from "@/lib/auth/permisos"
import { cn } from "@/lib/utils"

import { pluralizar } from "../presentacion"
import type { RolListado } from "../tipos"

const TONOS = {
  marca: "bg-primary/10 text-primary",
  exito: "bg-success/10 text-success",
  info: "bg-info/10 text-info",
  aviso: "bg-warning/12 text-warning",
} as const

function Metrica({
  titulo,
  valor,
  detalle,
  Icono,
  tono,
  indice,
}: {
  titulo: string
  valor: number | null
  detalle: string
  Icono: LucideIcon
  tono: keyof typeof TONOS
  indice: number
}) {
  return (
    <article
      style={{ animationDelay: `${indice * 60}ms` }}
      className="flex animate-aparecer-arriba flex-col gap-1.5 rounded-xl border bg-card p-3.5 motion-reduce:animate-none sm:gap-2 sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[0.8125rem] font-medium text-muted-foreground">
          {titulo}
        </h2>
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            TONOS[tono]
          )}
        >
          <Icono className="size-4" aria-hidden />
        </span>
      </div>
      <p className="font-heading text-2xl leading-none font-semibold tracking-tight sm:text-[1.75rem]">
        {valor === null ? "—" : <NumeroAnimado valor={valor} />}
      </p>
      <p className="text-xs text-muted-foreground">{detalle}</p>
    </article>
  )
}

const SENSIBLES = CLAVES_PERMISO.filter((clave) => PERMISOS[clave].esSensible)
const MODULOS = new Set(CLAVES_PERMISO.map((clave) => PERMISOS[clave].modulo))

/** Indicadores del módulo: roles, cuentas asignadas, catálogo y MFA. */
export function MetricasRoles({ roles }: { roles: readonly RolListado[] }) {
  const deSistema = roles.filter((rol) => rol.esSistema).length
  const personalizados = roles.length - deSistema
  const conteos = roles.map((rol) => rol.usuarios)
  const cuentas = conteos.every((valor) => valor !== null)
    ? conteos.reduce<number>((suma, valor) => suma + (valor ?? 0), 0)
    : null
  const rolesConCuentas = roles.filter((rol) => (rol.usuarios ?? 0) > 0).length
  const conMfa = roles.filter((rol) => rol.requiereMfa).length

  return (
    <section
      aria-label="Resumen de roles"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <Metrica
        indice={0}
        titulo="Roles"
        valor={roles.length}
        Icono={ShieldCheck}
        tono="marca"
        detalle={`${deSistema} de sistema · ${pluralizar(personalizados, "personalizado", "personalizados")}`}
      />
      <Metrica
        indice={1}
        titulo="Cuentas con rol"
        valor={cuentas}
        Icono={Users}
        tono="info"
        detalle={
          cuentas === null
            ? "Necesitas «Ver usuarios»"
            : `Repartidas en ${pluralizar(rolesConCuentas, "rol", "roles")}`
        }
      />
      <Metrica
        indice={2}
        titulo="Permisos"
        valor={CLAVES_PERMISO.length}
        Icono={ListChecks}
        tono="aviso"
        detalle={`${SENSIBLES.length} sensibles ★ · ${MODULOS.size} módulos`}
      />
      <Metrica
        indice={3}
        titulo="Exigen MFA"
        valor={conMfa}
        Icono={KeyRound}
        tono="exito"
        detalle={`De ${pluralizar(roles.length, "rol", "roles")}: todos los internos`}
      />
    </section>
  )
}
