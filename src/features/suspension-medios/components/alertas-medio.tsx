import { ArrowRight, ShieldAlert, ShieldCheck } from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import {
  InsigniaEstado,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import { PorqueAlerta } from "@/features/operacion/components/porque-alerta"
import { CORTES, ESTADOS_VALIDACION } from "@/features/operacion/estados"
import { contar, formatearHandle } from "@/features/operacion/formato"
import { rutaAsignacion } from "@/features/operacion/rutas"
import { TarjetaFicha } from "@/features/usuarios/components/tarjeta-ficha"
import { formatearFechaHora, formatearNumero } from "@/lib/format"

import { notaValidacion, resumirAlertas } from "../alertas"
import type { AlertaDelMedio } from "../tipos"

function tituloAlerta(alerta: AlertaDelMedio): string {
  const corte = alerta.corte
    ? alerta.corte === "PERSONALIZADO"
      ? "Corte personalizado"
      : `Corte de ${CORTES[alerta.corte].etiqueta}`
    : "Métrica"
  return alerta.numeroPublicacion !== null
    ? `${corte} · publicación ${formatearNumero(alerta.numeroPublicacion)}`
    : corte
}

function Alerta({ alerta }: { alerta: AlertaDelMedio }) {
  const idTitulo = `alerta-${alerta.metricaId}`
  const nota = notaValidacion(alerta)
  const oferta = alerta.oferta ?? "Oferta sin título"
  const contexto = [
    oferta,
    alerta.anunciante,
    alerta.fechaCorte
      ? `corte del ${formatearFechaHora(alerta.fechaCorte)}`
      : null,
  ].filter(Boolean)

  return (
    <li>
      <article
        aria-labelledby={idTitulo}
        className="flex flex-col gap-2.5 rounded-lg border bg-card px-4 py-3"
      >
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3
              id={idTitulo}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold"
            >
              {alerta.plataforma ? (
                <MarcaPlataforma plataforma={alerta.plataforma} />
              ) : null}
              {tituloAlerta(alerta)}
              {alerta.handle ? (
                <span className="font-normal text-muted-foreground">
                  {formatearHandle(alerta.handle)}
                </span>
              ) : null}
            </h3>
            <p className="text-xs text-pretty text-muted-foreground">
              {contexto.join(" · ")}
            </p>
          </div>
          <InsigniaEstado
            catalogo={ESTADOS_VALIDACION}
            estado={alerta.estado}
          />
        </header>

        <PorqueAlerta
          alerta={alerta.alerta}
          plataforma={alerta.plataforma}
          nivelTitulo={4}
        />

        <p className="text-xs text-pretty break-words">
          <span className="font-medium">{nota.etiqueta}:</span> {nota.texto}
        </p>

        <EnlaceBoton
          variant="outline"
          size="sm"
          className="w-fit"
          href={rutaAsignacion(alerta.asignacionId)}
        >
          Ver la asignación
          <span className="sr-only">{` de «${oferta}»`}</span>
          <ArrowRight data-icon="inline-end" aria-hidden />
        </EnlaceBoton>
      </article>
    </li>
  )
}

/**
 * Pestaña «Alertas» de la ficha del medio (INT-003, INT-004, ADM-002): sus
 * métricas que se salieron de lo esperable para su cuenta, las que esperan
 * validación primero, con el porqué y las cifras lado a lado (`PorqueAlerta`,
 * la misma explicación de la cola y de la ficha de la asignación), lo que
 * anotó quien las validó y el enlace a la asignación.
 */
export function AlertasMedio({
  alertas,
  total,
}: {
  alertas: readonly AlertaDelMedio[]
  /** Cuántas tuvo en total (se detallan las primeras). */
  total: number
}) {
  if (total === 0) {
    return (
      <EstadoVacio
        icono={ShieldCheck}
        titulo="Sin alertas"
        descripcion="Ninguna de sus métricas se ha salido de lo esperable para su cuenta."
      />
    )
  }
  const resumen = resumirAlertas(alertas)
  const conAlerta = contar(total, "métrica con alerta", "métricas con alerta")
  return (
    <TarjetaFicha
      titulo="Métricas con alerta"
      icono={ShieldAlert}
      descripcion={`${
        total > alertas.length
          ? `Se muestran ${formatearNumero(alertas.length)} de ${conAlerta}, primero las que esperan validación.`
          : `${conAlerta}: ${[
              contar(resumen.porValidar, "por validar", "por validar"),
              contar(resumen.aprobadas, "aprobada", "aprobadas"),
              contar(resumen.rechazadas, "rechazada", "rechazadas"),
            ].join(", ")}.`
      } Solo las ve el equipo AMO.`}
    >
      <ul aria-label="Métricas con alerta" className="flex flex-col gap-3">
        {alertas.map((alerta) => (
          <Alerta key={alerta.metricaId} alerta={alerta} />
        ))}
      </ul>
    </TarjetaFicha>
  )
}
