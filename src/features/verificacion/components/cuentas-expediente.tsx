"use client"

import {
  ExternalLink,
  Hourglass,
  UserRoundSearch,
  UsersRound,
} from "lucide-react"
import { useState } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { Button } from "@/components/ui/button"
import { enFrase } from "@/features/cuentas-medio/franjas"
import {
  InsigniaEstado,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import { TarjetaFicha } from "@/features/operacion/components/ficha"
import {
  METODOS_VERIFICACION,
  PLATAFORMAS,
  VIGENCIAS_VERIFICACION,
} from "@/features/operacion/estados"
import { formatearHandle } from "@/features/operacion/formato"
import { formatearFecha, formatearNumero } from "@/lib/format"

import type { CuentaExpediente, ExpedienteMedio } from "../tipos"
import { HojaCuenta } from "./revision-cuenta"

function Seguidores({ cuenta }: { cuenta: CuentaExpediente }) {
  if (cuenta.seguidoresVerificados === null) {
    return <span>Sin seguidores verificados</span>
  }
  return (
    <span>
      <span className="font-medium cifras text-foreground">
        {formatearNumero(cuenta.seguidoresVerificados)}
      </span>{" "}
      verificados{cuenta.franja ? ` · franja ${cuenta.franja}` : ""}
      {cuenta.venceAt && cuenta.verificada
        ? ` · vigente hasta el ${formatearFecha(cuenta.venceAt)}`
        : ""}
    </span>
  )
}

function FilaCuenta({
  cuenta,
  onRevisar,
}: {
  cuenta: CuentaExpediente
  onRevisar: () => void
}) {
  const handle = formatearHandle(cuenta.handle)
  const plataforma = PLATAFORMAS[cuenta.plataforma]
  const { pendiente } = cuenta
  return (
    <li className="flex flex-col gap-2.5 py-3.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span aria-hidden className="mt-0.5">
            <MarcaPlataforma plataforma={cuenta.plataforma} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <a
              href={cuenta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium break-all underline-offset-4 hover:underline focus-visible:underline"
            >
              {handle}
              <ExternalLink aria-hidden className="size-3.5 shrink-0" />
              <span className="sr-only">
                {" "}
                en {plataforma} (abre en una pestaña nueva)
              </span>
            </a>
            <p className="text-xs text-muted-foreground">
              <Seguidores cuenta={cuenta} />
            </p>
          </div>
        </div>
        <InsigniaEstado
          catalogo={VIGENCIAS_VERIFICACION}
          estado={cuenta.vigencia}
        />
      </div>
      {pendiente ? (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/6 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-xs text-pretty">
            {pendiente.mimeCaptura ? (
              <UserRoundSearch
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-warning"
              />
            ) : (
              <Hourglass
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
            )}
            <span>
              {pendiente.mimeCaptura
                ? "Verificación por revisar"
                : "Pidió verificación; espera la captura"}{" "}
              · {enFrase(METODOS_VERIFICACION[pendiente.metodo])} ·{" "}
              {formatearNumero(pendiente.seguidoresReportados)} reportados
            </span>
          </p>
          <Button
            size="sm"
            variant={pendiente.mimeCaptura ? "default" : "outline"}
            onClick={onRevisar}
            aria-label={`Revisar la verificación de ${handle} en ${plataforma}`}
          >
            Revisar
          </Button>
        </div>
      ) : null}
    </li>
  )
}

/**
 * Cuentas sociales del medio con su vigencia y la verificación que tengan
 * abierta. Para verificar el medio basta una vigente (la gracia cuenta).
 */
export function CuentasExpediente({
  expediente,
}: {
  expediente: ExpedienteMedio
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const { cuentas, franjas } = expediente
  const verificacion =
    cuentas.find((cuenta) => cuenta.pendiente?.id === abierta)?.pendiente ??
    null

  return (
    <TarjetaFicha
      titulo="Cuentas sociales"
      icono={UsersRound}
      descripcion="Para verificar el medio necesita al menos una verificada y vigente."
    >
      {cuentas.length === 0 ? (
        <EstadoVacio
          variante="simple"
          icono={UsersRound}
          titulo="Aún no registra cuentas"
          descripcion="Las cuentas que agregue aparecerán aquí con su verificación."
          className="py-6"
        />
      ) : (
        <ul className="flex flex-col divide-y">
          {cuentas.map((cuenta) => (
            <FilaCuenta
              key={cuenta.id}
              cuenta={cuenta}
              onRevisar={() => setAbierta(cuenta.pendiente?.id ?? null)}
            />
          ))}
        </ul>
      )}
      {verificacion ? (
        <HojaCuenta
          key={verificacion.id}
          verificacion={verificacion}
          franjas={franjas}
          abierta
          onAbiertaChange={(valor) => {
            if (!valor) setAbierta(null)
          }}
        />
      ) : null}
    </TarjetaFicha>
  )
}
