import {
  ChevronDown,
  CircleHelp,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import type { Route } from "next"
import { useId } from "react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { TarjetaPanel } from "@/features/dashboard/components/tarjeta-panel"
import {
  InsigniaTono,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import { formatearHandle } from "@/features/operacion/formato"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  type CalidadCuenta,
  explicacionCalidad,
  formatearFactor,
  ID_CALIDAD_CUENTAS,
  pasosDelCalculo,
  presentarSituacion,
  textoBaseCalculo,
  textoCambio,
} from "../calidad"
import type { ParametrosCalidad } from "../tipos"

/** «Franja 30.000 – 60.000 · 48.000 seguidores». */
function detalleCuenta(calidad: CalidadCuenta): string {
  const { franja, seguidores } = calidad.cuenta
  return [
    franja ? `Franja ${franja.nombre}` : "Sin franja asignada",
    seguidores !== null
      ? `${formatearNumero(seguidores)} ${seguidores === 1 ? "seguidor" : "seguidores"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

function Cuenta({
  calidad,
  parametros,
  ahora,
}: {
  calidad: CalidadCuenta
  parametros: ParametrosCalidad
  ahora: Date
}) {
  const idNombre = useId()
  const { cuenta, vigente, cambio, situacion } = calidad
  const distintivo = presentarSituacion(situacion)
  const aviso = textoCambio(calidad, parametros, ahora)
  const sube = cambio?.direccion === "sube"
  const IconoCambio = sube ? TrendingUp : TrendingDown
  return (
    <li
      aria-labelledby={idNombre}
      className="flex min-w-0 flex-col gap-3 rounded-lg border bg-background/40 p-3 sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3
            id={idNombre}
            className="flex min-w-0 items-center gap-2 text-sm font-semibold"
          >
            <MarcaPlataforma plataforma={cuenta.plataforma} />{" "}
            <span className="truncate" title={formatearHandle(cuenta.handle)}>
              {formatearHandle(cuenta.handle)}
            </span>
          </h3>
          <p className="text-xs text-muted-foreground">
            {detalleCuenta(calidad)}
          </p>
        </div>
        <dl className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          <dt className="text-[0.6875rem] text-muted-foreground">
            Multiplicador hoy
          </dt>
          <dd className="font-heading text-2xl leading-none font-semibold cifras tracking-tight">
            {formatearFactor(vigente)} ×
          </dd>
        </dl>
      </div>

      <InsigniaTono tono={distintivo.tono} etiqueta={distintivo.etiqueta} />

      {aviso ? (
        <p
          className={cn(
            "flex gap-2 rounded-md border p-2.5 text-xs leading-relaxed",
            sube
              ? "border-success/30 bg-success/8"
              : "border-warning/40 bg-warning/8"
          )}
        >
          <IconoCambio
            aria-hidden
            className={cn(
              "mt-0.5 size-3.5 shrink-0",
              sube ? "text-success" : "text-warning"
            )}
          />
          <span>
            <span className="font-semibold">
              Próximo: {formatearFactor(cambio?.proximo ?? vigente)} ×.
            </span>{" "}
            {aviso}
          </span>
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {explicacionCalidad(calidad, parametros)}
      </p>
      <p className="text-[0.6875rem] leading-snug text-muted-foreground">
        {textoBaseCalculo(cuenta, parametros, ahora)}
      </p>
    </li>
  )
}

/** Paso a paso del cálculo, plegado: es consulta, no lo primero que se lee. */
function ComoSeCalcula({ parametros }: { parametros: ParametrosCalidad }) {
  return (
    <Collapsible className="border-t pt-2">
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="group/calculo -mx-2 h-9 w-[calc(100%+1rem)] justify-between px-2 text-muted-foreground"
          />
        }
      >
        <span className="flex items-center gap-2">
          <CircleHelp aria-hidden />
          ¿Cómo se calcula?
        </span>
        <ChevronDown
          aria-hidden
          className="transition-transform duration-200 group-aria-expanded/calculo:rotate-180 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="flex list-decimal flex-col gap-2 pt-2 pl-5 text-xs leading-relaxed text-muted-foreground marker:text-foreground/60">
          {pasosDelCalculo(parametros).map((paso) => (
            <li key={paso}>{paso}</li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * «Calidad de tus cuentas» (PRC-003, PRC-004): por cada cuenta verificada, el
 * multiplicador que rige hoy en su precio, el cambio anunciado y desde cuándo,
 * y por qué (su alcance frente a la mediana de su franja, o las publicaciones
 * que le faltan). El tono del distintivo se acompaña siempre de su texto.
 */
export function CalidadCuentas({
  calidades,
  parametros,
  ahora,
  enlaceCuentas,
  className,
}: {
  calidades: readonly CalidadCuenta[]
  parametros: ParametrosCalidad
  /** Instante del servidor al pintar (decide si una fecha lleva el año). */
  ahora: Date
  /** «Mis cuentas» de «Mi medio», si el rol puede abrirla. */
  enlaceCuentas?: Route | null
  className?: string
}) {
  return (
    <div
      id={ID_CALIDAD_CUENTAS}
      className={cn("flex min-w-0 scroll-mt-24 flex-col *:flex-1", className)}
    >
      <TarjetaPanel
        titulo="Calidad de tus cuentas"
        descripcion="El multiplicador que ajusta lo que te pagan en cada cuenta."
        icono={Sparkles}
        enlace={
          enlaceCuentas
            ? { href: enlaceCuentas, texto: "Ver mis cuentas" }
            : undefined
        }
      >
        {calidades.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg border border-dashed bg-background/40 p-4 text-[0.8125rem] text-muted-foreground">
              Aún no tienes cuentas verificadas. Cuando verifiques una, aquí
              verás su multiplicador de calidad y cómo se calcula.
            </p>
            <ComoSeCalcula parametros={parametros} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <ul
              aria-label="Multiplicador por cuenta"
              className="grid gap-3 @lg/bloque:grid-cols-2"
            >
              {calidades.map((calidad) => (
                <Cuenta
                  key={calidad.cuenta.id}
                  calidad={calidad}
                  parametros={parametros}
                  ahora={ahora}
                />
              ))}
            </ul>
            <ComoSeCalcula parametros={parametros} />
          </div>
        )}
      </TarjetaPanel>
    </div>
  )
}
