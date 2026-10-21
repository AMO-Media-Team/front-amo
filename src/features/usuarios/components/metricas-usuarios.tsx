import {
  Ban,
  type LucideIcon,
  MailPlus,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react"
import type { ReactNode } from "react"

import { NumeroAnimado } from "@/components/motion/numero-animado"
import { formatearNumero, formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { Tono } from "../presentacion"
import type { ResumenUsuarios } from "../tipos"

const TONOS_ICONO: Readonly<Record<Tono, string>> = {
  exito: "bg-success/10 text-success",
  info: "bg-info/10 text-info",
  aviso: "bg-warning/12 text-warning",
  peligro: "bg-destructive/10 text-destructive",
  neutro: "bg-primary/10 text-primary",
}

function TarjetaMetrica({
  titulo,
  valor,
  formato = "numero",
  detalle,
  Icono,
  tono,
  indice,
  children,
}: {
  titulo: string
  valor: number
  formato?: "numero" | "porcentaje"
  detalle: ReactNode
  Icono: LucideIcon
  tono: Tono
  indice: number
  children?: ReactNode
}) {
  return (
    <article
      style={{ animationDelay: `${indice * 60}ms` }}
      className="flex animate-aparecer-arriba flex-col gap-1.5 rounded-xl border bg-card p-3.5 motion-reduce:animate-none max-md:last:col-span-2 sm:gap-2 sm:p-4 md:col-span-2 xl:col-span-1 [&:nth-child(n+4)]:md:col-span-3 [&:nth-child(n+4)]:xl:col-span-1"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[0.8125rem] font-medium text-muted-foreground">
          {titulo}
        </h2>
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            TONOS_ICONO[tono]
          )}
        >
          <Icono className="size-4" aria-hidden />
        </span>
      </div>
      <p className="font-heading text-2xl leading-none font-semibold tracking-tight sm:text-[1.75rem]">
        <NumeroAnimado valor={valor} formato={formato} decimales={0} />
      </p>
      <p className="text-xs text-muted-foreground">{detalle}</p>
      {children}
    </article>
  )
}

/**
 * Indicadores del módulo: cuentas, activas, invitaciones pendientes,
 * suspendidas y adopción de la verificación en dos pasos. Las cifras se
 * animan cuando cambian (p. ej. tras suspender a alguien).
 */
export function MetricasUsuarios({ resumen }: { resumen: ResumenUsuarios }) {
  const proporcionMfa =
    resumen.activos > 0 ? resumen.activosConMfa / resumen.activos : 0

  return (
    <section
      aria-label="Resumen de usuarios"
      className="grid grid-cols-2 gap-3 md:grid-cols-6 xl:grid-cols-5"
    >
      <TarjetaMetrica
        indice={0}
        titulo="Usuarios"
        valor={resumen.total}
        Icono={Users}
        tono="neutro"
        detalle={
          resumen.desactivados > 0
            ? `${formatearNumero(resumen.desactivados)} desactivados aparte`
            : "Cuentas vigentes"
        }
      />
      <TarjetaMetrica
        indice={1}
        titulo="Activos"
        valor={resumen.activos}
        Icono={UserCheck}
        tono="exito"
        detalle={
          resumen.total > 0
            ? `${formatearPorcentaje(resumen.activos / resumen.total, 0)} del total`
            : "Sin cuentas aún"
        }
      />
      <TarjetaMetrica
        indice={2}
        titulo="Invitaciones"
        valor={resumen.invitados}
        Icono={MailPlus}
        tono="info"
        detalle={
          resumen.invitados > 0 ? "Pendientes de activar" : "Todas aceptadas"
        }
      />
      <TarjetaMetrica
        indice={3}
        titulo="Suspendidos"
        valor={resumen.suspendidos}
        Icono={Ban}
        tono={resumen.suspendidos > 0 ? "aviso" : "neutro"}
        detalle={
          resumen.suspendidos > 0 ? "Sin acceso temporalmente" : "Ninguno"
        }
      />
      <TarjetaMetrica
        indice={4}
        titulo="Con MFA"
        valor={proporcionMfa}
        formato="porcentaje"
        Icono={ShieldCheck}
        tono={proporcionMfa >= 0.8 ? "exito" : "aviso"}
        detalle={`${formatearNumero(resumen.activosConMfa)} de ${formatearNumero(resumen.activos)} activos`}
      >
        <div
          role="presentation"
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-success transition-[width] duration-700 ease-suave"
            style={{ width: `${Math.round(proporcionMfa * 100)}%` }}
          />
        </div>
      </TarjetaMetrica>
    </section>
  )
}
