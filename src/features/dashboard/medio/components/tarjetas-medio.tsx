import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  Gauge,
  Handshake,
  Info,
  Lock,
  type LucideIcon,
  ShieldCheck,
  Star,
  TrendingUp,
} from "lucide-react"
import { type CSSProperties, useId } from "react"

import { Sparkline } from "@/components/charts/sparkline"
import { presentarDelta, type TonoDelta } from "@/components/kpi/delta"
import type { FilaKpi } from "@/components/kpi/tipos"
import { NumeroAnimado } from "@/components/motion/numero-animado"
import { NOMBRES_PLATAFORMA } from "@/features/dashboard/insights/textos"
import type { Plataforma } from "@/features/dashboard/insights/tipos"
import {
  formatearCOP,
  formatearCOPCompacto,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { TarjetaPanel } from "../../components/tarjeta-panel"
import {
  etiquetaEstado,
  ESTADOS_EN_CURSO,
  formatoMonto,
  META_CUMPLIMIENTO,
  type NegocioEnCurso,
  type ProgresoTope,
  pasoEstado,
} from "../datos"

/** Pesos exactos; abreviado solo desde cien millones (`formatoMonto`). */
function dinero(valor: number | null): string {
  if (valor === null) return "—"
  return formatoMonto(valor) === "cop"
    ? formatearCOP(valor)
    : formatearCOPCompacto(valor)
}

const TONOS: Readonly<Record<TonoDelta, string>> = {
  positivo: "bg-success/12 text-success",
  negativo: "bg-destructive/12 text-destructive",
  neutro: "bg-muted text-muted-foreground",
}

function FlechaDelta({ tendencia }: { tendencia: string }) {
  if (tendencia === "sube")
    return <ArrowUpRight aria-hidden className="size-3.5" />
  if (tendencia === "baja")
    return <ArrowDownRight aria-hidden className="size-3.5" />
  return <ArrowRight aria-hidden className="size-3.5" />
}

function Monto({
  etiqueta,
  valor,
  nota,
}: {
  etiqueta: string
  valor: number | null
  nota: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border bg-card/70 p-3 backdrop-blur-sm">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd
        className="font-heading text-lg leading-tight font-semibold tracking-tight sm:text-xl"
        title={valor === null ? undefined : formatearCOP(valor)}
      >
        {dinero(valor)}
      </dd>
      <dd className="text-[0.6875rem] leading-snug text-muted-foreground">
        {nota}
      </dd>
    </div>
  )
}

const UMBRAL_HEROE_COMPACTO = 10_000_000

/**
 * La cifra que el medio viene a ver: lo ganado en el periodo (cifra héroe,
 * animada), su variación y tendencia, y lo pendiente y lo ya pagado.
 */
export function HeroGanancias({
  titulo,
  ganado,
  pendiente,
  pagado,
  etiquetaComparacion,
  className,
}: {
  titulo: string
  ganado: FilaKpi | undefined
  pendiente: number | null
  pagado: number | null
  etiquetaComparacion: string
  className?: string
}) {
  const valor = ganado?.valor ?? 0
  const delta = presentarDelta({
    valor,
    valorAnterior: ganado?.valor_anterior,
    variacion: ganado?.variacion,
    unidad: "COP",
    sentido: "mayor",
  })
  const serie = ganado?.serie ?? null
  const conSerie = (serie?.filter((v) => v !== null && v > 0).length ?? 0) > 1
  const idTitulo = useId()
  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        "relative isolate flex flex-col gap-5 overflow-hidden rounded-2xl border bg-card p-5 sm:p-6",
        className
      )}
    >
      {/* Aurora de marca, tenue: jerarquía de la cifra principal. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full bg-aurora opacity-25 blur-3xl dark:opacity-30"
      />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h2
            id={idTitulo}
            className="text-sm font-medium text-muted-foreground"
          >
            {titulo}
          </h2>
          <p
            className="font-heading text-5xl leading-none font-bold tracking-tight sm:text-6xl"
            title={formatearCOP(valor)}
          >
            {/* A este tamaño, ocho cifras ya no caben en 390 px. */}
            <NumeroAnimado
              valor={valor}
              formato={valor >= UMBRAL_HEROE_COMPACTO ? "copCompacto" : "cop"}
            />
            <span className="sr-only"> ({formatearCOP(valor)})</span>
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {delta.tipo === "sin-comparativo" ? (
              // Sin base de comparación, un "→ —" no dice nada: se explica.
              valor === 0 ? (
                "Se suma al verificarse cada negocio · antes de retenciones"
              ) : (
                "Antes de retenciones"
              )
            ) : (
              <>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold cifras",
                    TONOS[delta.tono]
                  )}
                >
                  <FlechaDelta tendencia={delta.tendencia} />
                  <span aria-hidden>{delta.texto}</span>
                  <span className="sr-only">{delta.descripcion}</span>
                </span>
                {etiquetaComparacion} · antes de retenciones
              </>
            )}
          </p>
        </div>
        {conSerie && serie ? (
          <Sparkline
            valores={serie}
            ancho={120}
            alto={48}
            tono="exito"
            className="mt-1 hidden w-28 sm:block"
          />
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-2.5 sm:gap-3">
        <Monto
          etiqueta="Pendiente de pago"
          valor={pendiente}
          nota="Estimado: las retenciones se calculan al liquidar"
        />
        <Monto
          etiqueta="Pagado a la fecha"
          valor={pagado}
          nota="Neto recibido, después de retenciones"
        />
      </dl>
    </section>
  )
}

const ESTILOS_TOPE = {
  normal: {
    relleno: "bg-primary",
    pista: "bg-primary/15",
    texto: "text-muted-foreground",
  },
  alerta: {
    relleno: "bg-warning",
    pista: "bg-warning/15",
    texto: "text-warning",
  },
  bloqueo: {
    relleno: "bg-destructive",
    pista: "bg-destructive/15",
    texto: "text-destructive",
  },
  "sin-tope": {
    relleno: "bg-primary",
    pista: "bg-primary/15",
    texto: "text-muted-foreground",
  },
} as const

function mensajeTope(progreso: ProgresoTope, bloqueo: number): string {
  switch (progreso.estado) {
    case "sin-tope":
      return "Tu nivel de verificación no tiene tope anual."
    case "normal":
      return `Puedes aceptar ofertas por ${formatearCOPCompacto(progreso.margenHastaBloqueo)} más este año antes del umbral del ${formatearPorcentaje(bloqueo, 0)}.`
    case "alerta":
      return `Estás cerca del tope de tu nivel: te quedan ${formatearCOPCompacto(progreso.margenHastaBloqueo)} antes del bloqueo al ${formatearPorcentaje(bloqueo, 0)}. Sube de nivel para ampliar tu tope.`
    case "bloqueo":
      return `Alcanzaste el ${formatearPorcentaje(bloqueo, 0)} del tope: no podrás aceptar nuevas ofertas hasta subir de nivel.`
  }
}

/** Avance del tope anual del nivel (§7.1.1), con el umbral de bloqueo marcado. */
export function ProgresoTopeAnual({
  progreso,
  consumido,
  tope,
  nivel,
  alerta,
  bloqueo,
  className,
}: {
  progreso: ProgresoTope
  consumido: number
  tope: number | null
  nivel: string
  alerta: number
  bloqueo: number
  className?: string
}) {
  const estilo = ESTILOS_TOPE[progreso.estado]
  const marca = (fraccion: number): CSSProperties => ({
    left: `${fraccion * 100}%`,
  })
  return (
    <TarjetaPanel
      titulo="Tope anual de tu nivel"
      descripcion={nivel}
      icono={Gauge}
      className={className}
    >
      <div className="flex flex-col gap-3">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span
            className="font-heading text-2xl font-semibold tracking-tight"
            title={
              tope
                ? `${formatearCOP(consumido)} de ${formatearCOP(tope)}`
                : formatearCOP(consumido)
            }
          >
            {formatearCOPCompacto(consumido)}
            {tope ? (
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                de {formatearCOPCompacto(tope)}
              </span>
            ) : null}
          </span>
          {progreso.porcentaje !== null ? (
            <span className={cn("text-sm font-semibold cifras", estilo.texto)}>
              {formatearPorcentaje(progreso.porcentaje, 0)}
            </span>
          ) : null}
        </p>
        {tope ? (
          <div className="relative pt-1 pb-5">
            <div
              role="meter"
              aria-label="Avance del tope anual"
              aria-valuemin={0}
              aria-valuemax={tope}
              aria-valuenow={Math.min(consumido, tope)}
              aria-valuetext={`${formatearCOP(consumido)} de ${formatearCOP(tope)} (${formatearPorcentaje(progreso.porcentaje, 0)})`}
              className={cn("h-3 overflow-hidden rounded-full", estilo.pista)}
            >
              <div
                className={cn(
                  "h-full origin-left rounded-full transition-[width] duration-700 ease-suave motion-reduce:transition-none",
                  estilo.relleno
                )}
                style={{ width: `${progreso.fraccion * 100}%` }}
              />
            </div>
            {/* Solo la cifra bajo cada marca: centrada en el 95 % no se sale
                de la barra (el texto de abajo dice qué pasa en cada umbral). */}
            {[
              { fraccion: alerta, bloquea: false },
              { fraccion: bloqueo, bloquea: true },
            ].map((umbral) => (
              <span
                key={umbral.fraccion}
                aria-hidden
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                style={marca(umbral.fraccion)}
              >
                <span className="h-5 w-0.5 rounded-full bg-foreground/50" />
                <span className="mt-0.5 inline-flex items-center gap-0.5 text-[0.625rem] cifras whitespace-nowrap text-muted-foreground">
                  {umbral.bloquea ? <Lock className="size-2.5" /> : null}
                  {formatearPorcentaje(umbral.fraccion, 0)}
                </span>
              </span>
            ))}
          </div>
        ) : null}
        <p className={cn("flex gap-2 text-xs leading-relaxed", estilo.texto)}>
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {mensajeTope(progreso, bloqueo)}
        </p>
      </div>
    </TarjetaPanel>
  )
}

interface DatoReputacion {
  etiqueta: string
  Icono: LucideIcon
  valor: string
  nota: string
  destacado?: boolean
}

/**
 * Reputación (§7.1.8): cumplimiento en 180 días, calificación y multiplicador.
 * Una fila por dato (nombre y nota a la izquierda, cifra a la derecha): en
 * tres casillas, a 390 px y en la columna angosta de escritorio, las notas se
 * partían en tres líneas de dos palabras.
 */
export function Reputacion({
  cumplimiento,
  calificacion,
  multiplicador,
  publicaciones,
  nMinimoCumplimiento,
  className,
}: {
  cumplimiento: FilaKpi | undefined
  calificacion: number | null
  multiplicador: number | null
  publicaciones: number | null
  nMinimoCumplimiento: number
  className?: string
}) {
  const tasa = cumplimiento?.valor ?? null
  const n = cumplimiento?.n ?? 0
  const datos: DatoReputacion[] = [
    {
      etiqueta: "Cumplimiento",
      Icono: ShieldCheck,
      valor: tasa === null ? "—" : formatearPorcentaje(tasa, 0),
      nota:
        tasa === null
          ? `Sin historial suficiente (${formatearNumero(n)} de ${formatearNumero(nMinimoCumplimiento)} negocios)`
          : `Últimos 180 días · ${formatearNumero(n)} ${n === 1 ? "negocio" : "negocios"}`,
      destacado: tasa !== null && tasa >= META_CUMPLIMIENTO,
    },
    {
      etiqueta: "Calificación",
      Icono: Star,
      valor:
        calificacion === null ? "—" : `${formatearNumero(calificacion, 1)} / 5`,
      nota:
        calificacion === null
          ? "Aún sin calificaciones"
          : "Promedio de los anunciantes",
    },
    {
      etiqueta: "Multiplicador",
      Icono: TrendingUp,
      valor:
        multiplicador === null ? "—" : `${formatearNumero(multiplicador, 2)} ×`,
      nota: "Ajusta tu tarifa según tu desempeño",
    },
  ]
  return (
    <TarjetaPanel
      titulo="Tu reputación"
      descripcion="Lo que ven los anunciantes y lo que mueve tu tarifa."
      icono={Award}
      className={className}
      pie={
        publicaciones !== null
          ? `${formatearNumero(publicaciones)} ${publicaciones === 1 ? "publicación aprobada" : "publicaciones aprobadas"} en el periodo.`
          : null
      }
    >
      <dl className="flex flex-col divide-y">
        {datos.map(({ etiqueta, Icono, valor, nota, destacado }) => (
          <div
            key={etiqueta}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 py-3 first:pt-0 last:pb-0"
          >
            <dt className="flex items-center gap-1.5 text-[0.8125rem] font-medium">
              <Icono aria-hidden className="size-3.5 shrink-0 text-primary" />
              {etiqueta}
            </dt>
            <dd
              className={cn(
                "col-start-2 row-span-2 row-start-1 font-heading text-xl leading-tight font-semibold tracking-tight whitespace-nowrap",
                destacado && "text-success"
              )}
            >
              {valor}
            </dd>
            <dd className="col-start-1 text-[0.6875rem] leading-snug text-muted-foreground">
              {nota}
            </dd>
          </div>
        ))}
      </dl>
    </TarjetaPanel>
  )
}

function esPlataforma(valor: string): valor is Plataforma {
  return valor in NOMBRES_PLATAFORMA
}

function nombrePlataforma(plataforma: string): string {
  return esPlataforma(plataforma) ? NOMBRES_PLATAFORMA[plataforma] : plataforma
}

/**
 * Negocios en ejecución con su paso (descargar → publicar → métricas). Cada
 * uno se nombra por su oferta; el estado y la red van debajo. Sin el nombre
 * (rol sin marketplace), el estado hace de título.
 */
export function NegociosEnCurso({
  negocios,
  activas,
  className,
}: {
  negocios: readonly NegocioEnCurso[]
  activas: number | null
  className?: string
}) {
  const pasos = ESTADOS_EN_CURSO.length
  const ocultos = Math.max(0, (activas ?? 0) - negocios.length)
  return (
    <TarjetaPanel
      titulo="Negocios en curso"
      descripcion="Aceptados y aún sin verificar."
      icono={Handshake}
      className={className}
      acciones={
        activas ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold cifras text-primary">
            <span className="sr-only">Negocios en curso: </span>
            {formatearNumero(activas)}
          </span>
        ) : null
      }
      pie={
        ocultos > 0
          ? `Y ${formatearNumero(ocultos)} más en curso (se muestran los más recientes).`
          : null
      }
    >
      {negocios.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-background/40 p-4 text-[0.8125rem] text-muted-foreground">
          No tienes negocios en curso. Las ofertas que aceptes aparecerán aquí
          hasta que se verifiquen sus métricas.
        </p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {negocios.map((negocio) => {
            const paso = pasoEstado(negocio.estado)
            const estado = etiquetaEstado(negocio.estado)
            const plataforma = nombrePlataforma(negocio.plataforma)
            return (
              <li key={negocio.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3 text-[0.8125rem]">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className="truncate font-medium"
                      title={negocio.titulo ?? undefined}
                    >
                      {negocio.titulo ?? estado}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[
                        negocio.titulo ? estado : null,
                        negocio.marca,
                        plataforma,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span
                    className="shrink-0 font-semibold cifras"
                    title="Valor para ti, antes de retenciones"
                  >
                    {dinero(negocio.montoMedio)}
                  </span>
                </div>
                <div
                  className="flex gap-1"
                  role="img"
                  aria-label={`Paso ${paso} de ${pasos}: ${estado}`}
                >
                  {ESTADOS_EN_CURSO.map((etapa, indice) => (
                    <span
                      key={etapa}
                      className={cn(
                        "h-1 flex-1 rounded-full",
                        indice < paso ? "bg-primary" : "bg-primary/15"
                      )}
                    />
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </TarjetaPanel>
  )
}
