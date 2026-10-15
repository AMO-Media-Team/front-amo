import "server-only"

import { RadioTower } from "lucide-react"

import { EsqueletoTarjetaGrafico } from "@/components/charts/esqueleto-grafico"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { cn } from "@/lib/utils"

import { BloquePanel } from "../../components/bloque-panel"
import { EsqueletoLista } from "../../components/esqueletos-panel"
import { indicePorKpi, valorKpi } from "../../kpi"
import { etiquetaComparacionAmplia, type PeriodoPanel } from "../../periodo"
import {
  anioDelTope,
  etiquetaNivel,
  granularidadGananciasPorDefecto,
  negociosEnCurso,
  ofertasDistintas,
  progresoTope,
  serieGanancias,
  tituloGanado,
  UMBRALES_TOPE_POR_DEFECTO,
  ventanaGanancias,
} from "../datos"
import {
  asignacionesEnCurso,
  fichaMedio,
  kpisMedio,
  nMinimoCumplimiento,
  ofertasDeNegocios,
  proximasAcciones,
  serieGananciasMedio,
} from "../queries"
import {
  EsqueletoHeroGanancias,
  EsqueletoReputacion,
  EsqueletoTopeAnual,
} from "./esqueletos-medio"
import { GraficoGanancias } from "./grafico-ganancias"
import { ProximasAcciones } from "./proximas-acciones"
import {
  HeroGanancias,
  NegociosEnCurso,
  ProgresoTopeAnual,
  Reputacion,
} from "./tarjetas-medio"

/** Pendientes visibles en el panel (la RPC ordena del plazo más próximo). */
const LIMITE_ACCIONES = 6
/** Negocios en curso visibles en el panel. */
const LIMITE_NEGOCIOS = 5

interface PropsPeriodo {
  periodo: PeriodoPanel
}

/** Una sola llamada a `kpis_medio` por solicitud (memorizada): la comparten los bloques. */
function kpisDelPeriodo(periodo: PeriodoPanel) {
  return kpisMedio(
    periodo.desde,
    periodo.hasta,
    periodo.desdeAnterior,
    periodo.hastaAnterior
  )
}

async function BloqueGanancias({ periodo }: PropsPeriodo) {
  const indice = indicePorKpi(await kpisDelPeriodo(periodo))
  return (
    <HeroGanancias
      titulo={tituloGanado(periodo.rango)}
      ganado={indice.get("ganado_periodo")}
      pendiente={valorKpi(indice, "pendiente_pago")}
      pagado={valorKpi(indice, "pagado_historico")}
      etiquetaComparacion={etiquetaComparacionAmplia(periodo.rango)}
    />
  )
}

async function BloqueTope({
  periodo,
  medioId,
}: PropsPeriodo & { medioId: string }) {
  const [filas, ficha] = await Promise.all([
    kpisDelPeriodo(periodo),
    fichaMedio(medioId),
  ])
  const indice = indicePorKpi(filas)
  const consumido = valorKpi(indice, "consumido_tope") ?? 0
  const tope = valorKpi(indice, "tope_anual")
  const alerta = ficha?.porcentajeAlerta ?? UMBRALES_TOPE_POR_DEFECTO.alerta
  const bloqueo = ficha?.porcentajeBloqueo ?? UMBRALES_TOPE_POR_DEFECTO.bloqueo
  const nivel = ficha
    ? etiquetaNivel(ficha.nivel, ficha.nombreNivel)
    : "Tu nivel de verificación"
  return (
    <ProgresoTopeAnual
      progreso={progresoTope({ consumido, tope, alerta, bloqueo })}
      consumido={consumido}
      tope={tope}
      nivel={`${nivel} · año ${anioDelTope(periodo.hasta)}`}
      alerta={alerta}
      bloqueo={bloqueo}
    />
  )
}

async function BloqueReputacion({
  periodo,
  medioId,
}: PropsPeriodo & { medioId: string }) {
  const [filas, ficha, nMinimo] = await Promise.all([
    kpisDelPeriodo(periodo),
    fichaMedio(medioId),
    nMinimoCumplimiento(),
  ])
  const indice = indicePorKpi(filas)
  return (
    <Reputacion
      cumplimiento={indice.get("tasa_cumplimiento")}
      calificacion={ficha?.calificacion ?? null}
      multiplicador={valorKpi(indice, "multiplicador_calidad")}
      publicaciones={valorKpi(indice, "publicaciones_realizadas")}
      nMinimoCumplimiento={nMinimo}
    />
  )
}

async function BloqueSerieGanancias({ periodo }: PropsPeriodo) {
  const semanas = ventanaGanancias(periodo.desde, periodo.hasta, "semana")
  const meses = ventanaGanancias(periodo.desde, periodo.hasta, "mes")
  const [porSemana, porMes] = await Promise.all([
    serieGananciasMedio(semanas.desde, semanas.hasta, "semana"),
    serieGananciasMedio(meses.desde, meses.hasta, "mes"),
  ])
  return (
    <GraficoGanancias
      series={{
        semana: serieGanancias(porSemana, "semana"),
        mes: serieGanancias(porMes, "mes"),
      }}
      porDefecto={granularidadGananciasPorDefecto(periodo.dias)}
    />
  )
}

async function BloqueAcciones({ ahora }: { ahora: Date }) {
  const acciones = await proximasAcciones(LIMITE_ACCIONES)
  return (
    <ProximasAcciones acciones={acciones} ahoraServidor={ahora.getTime()} />
  )
}

async function BloqueNegocios({
  periodo,
  conOfertas,
}: PropsPeriodo & {
  /** Con `ofertas.marketplace`: cada negocio lleva el nombre de su oferta. */
  conOfertas: boolean
}) {
  const [asignaciones, filas] = await Promise.all([
    asignacionesEnCurso(LIMITE_NEGOCIOS),
    kpisDelPeriodo(periodo),
  ])
  const ofertas = conOfertas
    ? await ofertasDeNegocios(ofertasDistintas(asignaciones))
    : []
  return (
    <NegociosEnCurso
      negocios={negociosEnCurso(asignaciones, ofertas)}
      activas={valorKpi(indicePorKpi(filas), "asignaciones_activas")}
    />
  )
}

/**
 * Una columna en móvil, en orden de prioridad: cuánto gané → qué tengo
 * pendiente → cuánto me queda del tope → historial → negocios en curso →
 * reputación. Con el panel desde 42 rem (tableta, 2 columnas) las acciones
 * ocupan dos filas junto al tope y la reputación (alturas parecidas, sin
 * tarjetas estiradas), y el gráfico y los negocios van a lo ancho. Desde
 * 56 rem (escritorio), dos columnas reales: lo principal a la izquierda y lo
 * de consulta rápida a la derecha. Los cortes miden el panel
 * (`@container/panel`), no la ventana: la barra lateral abierta le quita
 * 256 px. Las columnas usan `display: contents` por debajo de 56 rem, así sus
 * bloques se reordenan con `order` en la misma rejilla. Ningún bloque tiene
 * controles enfocables salvo el gráfico, por eso el orden visual no altera
 * el del teclado.
 */
const RAIZ =
  "flex flex-col gap-4 sm:gap-5 @2xl/panel:grid @2xl/panel:grid-cols-2 @4xl/panel:grid-cols-3"
const COLUMNA =
  "contents @4xl/panel:flex @4xl/panel:min-w-0 @4xl/panel:flex-col @4xl/panel:gap-5"

/**
 * Panel del medio, mobile-first: lo ganado (cifra héroe), el avance del tope
 * anual de su nivel, sus próximas acciones con cuenta regresiva, la serie de
 * ganancias, los negocios en curso y su reputación. Las RPC son definer y
 * filtran por su medio (`mi_medio_id()`).
 */
export function PanelMedio({
  usuario,
  periodo,
  ahora,
}: {
  usuario: UsuarioSesion
  periodo: PeriodoPanel
  ahora: Date
}) {
  const { medioId } = usuario
  if (!medioId) {
    return (
      <EstadoVacio
        icono={RadioTower}
        titulo="Tu cuenta aún no está vinculada a un medio"
        descripcion="Cuando el equipo de AMO la asocie a tu medio verás aquí tus ganancias, tu avance y tus pendientes."
        className="flex-none py-16"
      />
    )
  }
  const conNegocios = tieneAlgunPermiso(usuario, ["asignaciones.ver_propias"])

  return (
    <div className={RAIZ}>
      <div className={cn(COLUMNA, "@4xl/panel:col-span-2")}>
        <BloquePanel
          titulo="Tus ganancias del periodo"
          orden={1}
          className="order-1 @2xl/panel:col-span-2"
          esqueleto={<EsqueletoHeroGanancias />}
        >
          <BloqueGanancias periodo={periodo} />
        </BloquePanel>
        <BloquePanel
          titulo="Tus ganancias"
          orden={4}
          className="order-4 @2xl/panel:order-5 @2xl/panel:col-span-2"
          esqueleto={<EsqueletoTarjetaGrafico alto="min-h-64" />}
        >
          <BloqueSerieGanancias periodo={periodo} />
        </BloquePanel>
        {conNegocios ? (
          <BloquePanel
            titulo="Negocios en curso"
            orden={5}
            className="order-5 @2xl/panel:order-6 @2xl/panel:col-span-2 @4xl/panel:flex-1"
            esqueleto={<EsqueletoLista filas={4} />}
          >
            <BloqueNegocios
              periodo={periodo}
              conOfertas={tieneAlgunPermiso(usuario, ["ofertas.marketplace"])}
            />
          </BloquePanel>
        ) : null}
      </div>

      <div className={COLUMNA}>
        <BloquePanel
          titulo="Próximas acciones"
          orden={2}
          className="order-2 @2xl/panel:row-span-2"
          esqueleto={<EsqueletoLista filas={3} />}
        >
          <BloqueAcciones ahora={ahora} />
        </BloquePanel>
        <BloquePanel
          titulo="Tope anual de tu nivel"
          orden={3}
          className="order-3"
          esqueleto={<EsqueletoTopeAnual />}
        >
          <BloqueTope periodo={periodo} medioId={medioId} />
        </BloquePanel>
        <BloquePanel
          titulo="Tu reputación"
          orden={6}
          className="order-6 @2xl/panel:order-4 @4xl/panel:flex-1"
          esqueleto={<EsqueletoReputacion />}
        >
          <BloqueReputacion periodo={periodo} medioId={medioId} />
        </BloquePanel>
      </div>
    </div>
  )
}
