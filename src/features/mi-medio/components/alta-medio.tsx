import { ArrowRight, Check, Gauge } from "lucide-react"
import { useId } from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { InsigniaNivel } from "@/features/operacion/components/distintivos"
import { formatearCOPCompacto } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  enAlta,
  NOMBRE_EN_FRASE,
  RUTAS_MI_MEDIO,
  type SituacionMedio,
} from "../alta"
import { nivelPorNumero } from "../nivel"
import { vistaAlta } from "../resumen"
import type { ResumenMiMedio } from "../tipos"
import { BotonEnviarVerificacion } from "./boton-enviar-verificacion"
import { ListaAlta } from "./lista-alta"
import { TarjetaSituacion } from "./tarjeta-situacion"

const ETAPAS = [
  {
    titulo: "Completa tu alta",
    texto: "Tu perfil, tus documentos, tu cuenta de pago y tus redes.",
  },
  {
    titulo: "AMO te verifica",
    texto:
      "Revisamos tu identidad, que las cuentas son tuyas y tu cuenta de pago.",
  },
  {
    titulo: "Recibe ofertas",
    texto:
      "Aceptas pauta de marcas para tu audiencia y te pagamos por cada publicación verificada.",
  },
] as const

function etapaActual(situacion: SituacionMedio): number {
  if (situacion.tipo === "en-revision") return 1
  if (situacion.tipo === "verificado" || situacion.tipo === "suspendido") {
    return 2
  }
  return 0
}

/** Las tres etapas, con la actual resaltada (orientación para quien empieza). */
function AsiFunciona({ situacion }: { situacion: SituacionMedio }) {
  const idTitulo = useId()
  const actual = etapaActual(situacion)
  return (
    <section
      aria-labelledby={idTitulo}
      className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5"
    >
      <h2
        id={idTitulo}
        className="font-heading text-[0.9375rem] leading-snug font-semibold"
      >
        Así funciona
      </h2>
      <ol className="flex flex-col gap-4">
        {ETAPAS.map((etapa, indice) => {
          const hecha = indice < actual
          const esActual = indice === actual
          return (
            <li
              key={etapa.titulo}
              aria-current={esActual ? "step" : undefined}
              className="flex gap-3"
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold cifras ring-1 ring-inset",
                  hecha && "bg-success/12 text-success ring-success/25",
                  esActual && "bg-primary text-primary-foreground ring-primary",
                  !hecha && !esActual && "bg-muted text-muted-foreground ring-border"
                )}
              >
                {hecha ? <Check className="size-3.5" /> : indice + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  className={cn(
                    "text-sm font-medium",
                    !esActual && !hecha && "text-muted-foreground"
                  )}
                >
                  {etapa.titulo}
                  {hecha ? <span className="sr-only"> (hecho)</span> : null}
                  {esActual ? (
                    <span className="sr-only"> (etapa actual)</span>
                  ) : null}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {etapa.texto}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Nivel actual y su tope, con el camino para subir. */
function TarjetaNivel({ resumen }: { resumen: ResumenMiMedio }) {
  const idTitulo = useId()
  const { nivel } = resumen.medio
  const actual = nivelPorNumero(resumen.niveles, nivel)
  const tope = actual?.topeAnual ?? null
  return (
    <section
      aria-labelledby={idTitulo}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-5"
    >
      <h2
        id={idTitulo}
        className="flex items-center gap-2 font-heading text-[0.9375rem] leading-snug font-semibold"
      >
        <Gauge aria-hidden className="size-4 text-primary" />
        Tu nivel
      </h2>
      <div className="flex flex-col gap-1">
        <InsigniaNivel nivel={nivel} className="font-medium" />
        {actual ? (
          <p className="text-sm text-muted-foreground">{actual.nombre}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {nivel < 1
            ? "Lo asigna el equipo de AMO al verificarte."
            : tope
              ? `Tope de ${formatearCOPCompacto(tope)} al año en negocios aceptados.`
              : "Sin tope anual."}
        </p>
      </div>
      <EnlaceBoton
        href={RUTAS_MI_MEDIO.nivel}
        variant="outline"
        className="w-full"
      >
        Ver mi nivel y cómo subir
        <ArrowRight data-icon="inline-end" aria-hidden />
      </EnlaceBoton>
    </section>
  )
}

/**
 * Situación de la verificación, lista de alta (o de información, ya
 * verificado) y la orientación de al lado. La usan «Mi medio» y el inicio del
 * medio mientras no esté verificado. En móvil, una columna en orden de
 * prioridad; desde `lg`, la lista a la izquierda y la orientación a la derecha.
 */
export function AltaMedio({
  resumen,
  className,
}: {
  resumen: ResumenMiMedio
  className?: string
}) {
  const vista = vistaAlta(resumen)
  const { situacion } = vista
  const durante = enAlta(situacion)
  const conEnvio = situacion.tipo === "alta" || situacion.tipo === "rechazado"
  const nombreNivel =
    nivelPorNumero(resumen.niveles, resumen.medio.nivel)?.nombre ?? null
  return (
    <div
      className={cn(
        "grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
        <TarjetaSituacion
          situacion={situacion}
          nombreNivel={nombreNivel}
          progreso={vista.progreso}
          pasosFaltantes={vista.porCompletar.length}
        />
        <ListaAlta
          titulo={durante ? "Lista de alta" : "Tu información"}
          descripcion={
            durante
              ? "Completa cada paso; puedes hacerlo en el orden que quieras."
              : "Mantenla al día: un documento vencido o una cuenta sin reverificar te frena."
          }
          pasos={vista.pasos}
          progreso={durante ? vista.progreso : undefined}
          acciones={
            conEnvio ? (
              <BotonEnviarVerificacion
                faltantes={vista.porCompletar.map(
                  (paso) => NOMBRE_EN_FRASE[paso.id]
                )}
                reenvio={situacion.tipo === "rechazado"}
              />
            ) : undefined
          }
        />
      </div>
      <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
        {durante ? <AsiFunciona situacion={situacion} /> : null}
        <TarjetaNivel resumen={resumen} />
      </div>
    </div>
  )
}
