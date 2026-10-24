"use client"

import {
  ChartColumn,
  CircleCheckBig,
  ClipboardList,
  Megaphone,
  SearchCheck,
  TimerOff,
  Wallet,
} from "lucide-react"
import { parseAsStringLiteral, useQueryState } from "nuqs"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RUTA_OFERTAS_MEDIO } from "@/features/marketplace/rutas"
import { contar } from "@/features/operacion/formato"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  SEGMENTOS,
  SEGMENTOS_MIS_CAMPANAS,
  type SegmentoMisCampanas,
} from "../estados"
import {
  conteoDelTablero,
  LIMITE_TABLERO,
  type TableroMisCampanas,
} from "../tablero"
import { TarjetaAsignacionMedio } from "./tarjeta-asignacion"

const ICONOS_SEGMENTO = {
  por_publicar: Megaphone,
  pendiente_metricas: ChartColumn,
  en_verificacion: SearchCheck,
  validadas: CircleCheckBig,
  terminadas: Wallet,
  caidas: TimerOff,
} as const satisfies Record<SegmentoMisCampanas, unknown>

const parseSegmento = parseAsStringLiteral(SEGMENTOS_MIS_CAMPANAS)

function IconoSegmento({
  segmento,
  className,
}: {
  segmento: SegmentoMisCampanas
  className?: string
}) {
  const Icono = ICONOS_SEGMENTO[segmento]
  return <Icono aria-hidden className={className} />
}

export interface TableroMisCampanasProps {
  tablero: TableroMisCampanas
  /** El que se abre sin `?segmento=`: el primero con algo (lo pendiente primero). */
  segmentoInicial: SegmentoMisCampanas
  ahoraServidor: number
  puedeEjecutar: boolean
  /** `disputas.abrir`: reclamar una vencida desde su tarjeta. */
  puedeDisputar: boolean
  puedeVerOfertas: boolean
  /** `false` si hay más asignaciones de las que caben (las más antiguas). */
  completas: boolean
}

/**
 * Tablero de «Mis campañas» (MED-011): segmentos con su conteo (en el
 * celular, píldoras que se acomodan en dos líneas: ninguno queda escondido)
 * y las tarjetas del elegido, lo más urgente arriba. El segmento va en la
 * URL (`?segmento=`) para volver a él; cambiarlo no viaja al servidor. Lo
 * monta `TableroMisCampanasMedio` (servidor), que le suma los avisos.
 */
export function TableroCampanasCliente({
  tablero,
  segmentoInicial,
  ahoraServidor,
  puedeEjecutar,
  puedeDisputar,
  puedeVerOfertas,
  completas,
}: TableroMisCampanasProps) {
  const [elegido, setElegido] = useQueryState("segmento", parseSegmento)
  const activo = elegido ?? segmentoInicial
  const conteo = conteoDelTablero(tablero)
  const tarjetas = SEGMENTOS_MIS_CAMPANAS.flatMap(
    (segmento) => tablero[segmento]
  )
  const pendientes = tarjetas.filter(
    (tarjeta) => tarjeta.paso.tipo === "accion"
  ).length
  const enRevision = tarjetas.some((tarjeta) => tarjeta.paso.tipo === "espera")

  if (tarjetas.length === 0) {
    return (
      <EstadoVacio
        icono={ClipboardList}
        titulo="Aún no tienes campañas"
        descripcion="Cuando aceptes una oferta, aquí verás qué publicar, para cuándo y cuánto recibes."
        className="flex-none py-16"
      >
        {puedeVerOfertas ? (
          <EnlaceBoton href={RUTA_OFERTAS_MEDIO}>Ver ofertas</EnlaceBoton>
        ) : null}
      </EstadoVacio>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {pendientes > 0
          ? `Tienes ${contar(pendientes, "campaña", "campañas")} con algo por hacer.`
          : enRevision
            ? "No tienes nada por hacer ahora: el equipo AMO está revisando lo que enviaste."
            : "No tienes nada pendiente por ahora."}
      </p>
      <Tabs
        value={activo}
        onValueChange={(valor) => {
          if (typeof valor !== "string") return
          const segmento = parseSegmento.parse(valor)
          if (!segmento) return
          void setElegido(segmento === segmentoInicial ? null : segmento)
        }}
        className="gap-4"
      >
        <TabsList
          aria-label="Campañas por estado"
          className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0 group-data-horizontal/tabs:h-auto"
        >
          {SEGMENTOS_MIS_CAMPANAS.map((segmento) => (
            <TabsTrigger
              key={segmento}
              value={segmento}
              title={SEGMENTOS[segmento].descripcion}
              aria-label={`${SEGMENTOS[segmento].etiqueta}: ${contar(conteo[segmento], "campaña", "campañas")}`}
              className={cn(
                "h-9 flex-none rounded-full border border-border bg-card px-3 text-[0.8125rem] text-muted-foreground shadow-none",
                "data-active:border-primary/55 data-active:bg-primary/10 data-active:text-foreground dark:data-active:border-primary/55 dark:data-active:bg-primary/15",
                "after:hidden"
              )}
            >
              <IconoSegmento segmento={segmento} className="size-3.5" />
              {SEGMENTOS[segmento].etiqueta}
              <span
                className={cn(
                  "ml-0.5 min-w-5 rounded-full px-1.5 text-center text-[0.6875rem] font-semibold cifras",
                  conteo[segmento] > 0
                    ? "bg-primary/15 text-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {formatearNumero(conteo[segmento])}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {SEGMENTOS_MIS_CAMPANAS.map((segmento) => {
          const tarjetas = tablero[segmento]
          const { descripcion, vacio } = SEGMENTOS[segmento]
          return (
            <TabsContent
              key={segmento}
              value={segmento}
              className="flex flex-col gap-3 rounded-lg focus-visible:anillo-foco"
            >
              <p className="text-sm text-muted-foreground">{descripcion}</p>
              {tarjetas.length === 0 ? (
                <EstadoVacio
                  icono={ICONOS_SEGMENTO[segmento]}
                  titulo={vacio.titulo}
                  descripcion={vacio.descripcion}
                  className="flex-none py-10"
                >
                  {segmento === "por_publicar" && puedeVerOfertas ? (
                    <EnlaceBoton href={RUTA_OFERTAS_MEDIO} variant="outline">
                      Ver ofertas
                    </EnlaceBoton>
                  ) : null}
                </EstadoVacio>
              ) : (
                <ul
                  aria-label={`${SEGMENTOS[segmento].etiqueta}: ${contar(tarjetas.length, "campaña", "campañas")}`}
                  className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                >
                  {tarjetas.map((tarjeta, indice) => (
                    <li key={tarjeta.id} className="min-w-0">
                      <TarjetaAsignacionMedio
                        tarjeta={tarjeta}
                        ahoraServidor={ahoraServidor}
                        puedeEjecutar={puedeEjecutar}
                        puedeDisputar={puedeDisputar}
                        indice={indice}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
      {completas ? null : (
        <p className="text-xs text-muted-foreground">
          Mostramos tus {formatearNumero(LIMITE_TABLERO)} campañas más
          recientes.
        </p>
      )}
    </div>
  )
}
