import "server-only"

import { RadioTower } from "lucide-react"
import { Suspense } from "react"

import { EsqueletoTarjetaGrafico } from "@/components/charts/esqueleto-grafico"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { calidadDeCuentas } from "@/features/calidad-medio/calidad"
import { CalidadCuentas } from "@/features/calidad-medio/components/calidad-cuentas"
import { EsqueletoCalidadCuentas } from "@/features/calidad-medio/components/esqueleto-calidad"
import {
  cuentasCalidad,
  parametrosCalidad,
} from "@/features/calidad-medio/queries"
import { RUTA_GANANCIAS } from "@/features/ganancias/rutas"
import { RUTA_OFERTAS_MEDIO } from "@/features/marketplace/rutas"
import {
  enAlta,
  RUTAS_MI_MEDIO,
  situacionMedio,
} from "@/features/mi-medio/alta"
import { AltaMedio } from "@/features/mi-medio/components/alta-medio"
import { LimiteErrorMiMedio } from "@/features/mi-medio/components/limite-error-mi-medio"
import { TarjetaSituacion } from "@/features/mi-medio/components/tarjeta-situacion"
import { medioPropio, resumenMiMedio } from "@/features/mi-medio/queries"
import { RUTA_MIS_CAMPANAS } from "@/features/mis-campanas/rutas"
import { N_MINIMO_CUMPLIMIENTO_POR_DEFECTO } from "@/features/reputacion/datos"
import {
  miReputacion,
  resumenCalidadMedio,
} from "@/features/reputacion/queries"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { cn } from "@/lib/utils"

import { BloquePanel } from "../../components/bloque-panel"
import { EsqueletoLista } from "../../components/esqueletos-panel"
import { indicePorKpi, valorKpi } from "../../kpi"
import { etiquetaComparacionAmplia, type PeriodoPanel } from "../../periodo"
import {
  accionesDelInicio,
  anioDelTope,
  etiquetaNivel,
  granularidadGananciasPorDefecto,
  progresoTope,
  publicacionesPorAsignacion,
  RUTA_SUBIR_DE_NIVEL,
  serieGanancias,
  tituloGanado,
  UMBRALES_TOPE_POR_DEFECTO,
  ventanaGanancias,
} from "../datos"
import {
  asignacionesEnCurso,
  fichaMedio,
  kpisMedio,
  plazoCargaHoras,
  proximasAcciones,
  serieGananciasMedio,
} from "../queries"
import {
  EsqueletoHeroGanancias,
  EsqueletoInicioMedio,
  EsqueletoReputacion,
  EsqueletoTopeAnual,
} from "./esqueletos-medio"
import { GraficoGanancias } from "./grafico-ganancias"
import { type DestinoAcciones, ProximasAcciones } from "./proximas-acciones"
import {
  HeroGanancias,
  NegociosEnCurso,
  ProgresoTopeAnual,
  Reputacion,
} from "./tarjetas-medio"

/** Pendientes visibles en el panel. */
const LIMITE_ACCIONES = 6
/**
 * Pendientes que se consultan para ordenarlos (lo que ya se puede hacer
 * antes que los cortes aún bloqueados) y contar los que no caben.
 */
const CONSULTA_ACCIONES = 30
/** Negocios en curso visibles en el panel. */
const LIMITE_NEGOCIOS = 5
/**
 * Asignaciones en curso que se leen (una sola vez por solicitud): los
 * negocios del panel y cuántas publicaciones pide cada una para nombrar las
 * acciones.
 */
const CONSULTA_EN_CURSO = 50

interface PropsPeriodo {
  periodo: PeriodoPanel
}

/** Lo que el rol puede abrir desde el panel (cada página vuelve a exigirlo). */
interface Enlaces {
  /** Pantalla de cada acción, la ficha de la asignación o ninguna. */
  acciones: DestinoAcciones
  /** Reclamar una vencida desde su disputa (`disputas.abrir`). */
  reclamar: boolean
  /** «Mis campañas» (`asignaciones.ver_propias`). */
  misCampanas: boolean
  /** «Ofertas» (`ofertas.marketplace`). */
  ofertas: boolean
  /** «Mi medio»: nivel y cuentas (`medios.editar_propio`). */
  miMedio: boolean
  /** «Mi medio › Reputación» (`medios.editar_propio` e `inicio.medio`). */
  reputacion: boolean
  /** «Ganancias»: pagos y soportes (`liquidaciones.ver_propias`). */
  ganancias: boolean
}

function enlacesDe(usuario: UsuarioSesion): Enlaces {
  const misCampanas = tieneAlgunPermiso(usuario, ["asignaciones.ver_propias"])
  return {
    acciones: tieneAlgunPermiso(usuario, ["asignaciones.ejecutar"])
      ? "accion"
      : misCampanas
        ? "ficha"
        : null,
    reclamar: tieneAlgunPermiso(usuario, ["disputas.abrir"]),
    misCampanas,
    ofertas: tieneAlgunPermiso(usuario, ["ofertas.marketplace"]),
    miMedio: tieneAlgunPermiso(usuario, ["medios.editar_propio"]),
    reputacion:
      tieneAlgunPermiso(usuario, ["medios.editar_propio"]) &&
      tieneAlgunPermiso(usuario, ["inicio.medio"]),
    ganancias: tieneAlgunPermiso(usuario, ["liquidaciones.ver_propias"]),
  }
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

/** Asignaciones en curso (sin `asignaciones.ver_propias`, ninguna: no hay qué leer). */
function enCurso(enlaces: Enlaces) {
  return enlaces.misCampanas
    ? asignacionesEnCurso(CONSULTA_EN_CURSO)
    : Promise.resolve([])
}

async function BloqueGanancias({
  periodo,
  enlaces,
}: PropsPeriodo & { enlaces: Enlaces }) {
  const indice = indicePorKpi(await kpisDelPeriodo(periodo))
  return (
    <HeroGanancias
      titulo={tituloGanado(periodo.rango)}
      ganado={indice.get("ganado_periodo")}
      pendiente={valorKpi(indice, "pendiente_pago")}
      pagado={valorKpi(indice, "pagado_historico")}
      etiquetaComparacion={etiquetaComparacionAmplia(periodo.rango)}
      enlaceGanancias={enlaces.ganancias ? RUTA_GANANCIAS : null}
    />
  )
}

async function BloqueTope({
  periodo,
  medioId,
  enlaces,
}: PropsPeriodo & { medioId: string; enlaces: Enlaces }) {
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
      enlaceNivel={enlaces.miMedio ? RUTA_SUBIR_DE_NIVEL : null}
    />
  )
}

/**
 * El mínimo de casos para mostrar la tasa: el vigente que trae
 * `mi_reputacion()` (el medio no puede leer esa clave de `configuracion`). Es
 * un dato de apoyo: si la lectura falla, rige el valor sembrado.
 */
async function nMinimoCumplimiento(): Promise<number> {
  const reputacion = await miReputacion().catch(() => null)
  return reputacion?.nMinimo ?? N_MINIMO_CUMPLIMIENTO_POR_DEFECTO
}

/**
 * El multiplicador de «Tu reputación» es el vigente más bajo de sus cuentas
 * (el mismo cálculo que «Calidad de tus cuentas»); si esa lectura falla, se
 * usa el que trae `kpis_medio`.
 */
async function BloqueReputacion({
  periodo,
  medioId,
  ahora,
  enlaces,
}: PropsPeriodo & { medioId: string; ahora: Date; enlaces: Enlaces }) {
  const [filas, ficha, nMinimo, resumen] = await Promise.all([
    kpisDelPeriodo(periodo),
    fichaMedio(medioId),
    nMinimoCumplimiento(),
    resumenCalidadMedio(medioId, ahora),
  ])
  const indice = indicePorKpi(filas)
  return (
    <Reputacion
      cumplimiento={indice.get("tasa_cumplimiento")}
      calificacion={ficha?.calificacion ?? null}
      multiplicador={
        resumen?.valor ?? valorKpi(indice, "multiplicador_calidad")
      }
      notaMultiplicador={resumen?.nota}
      publicaciones={valorKpi(indice, "publicaciones_realizadas")}
      nMinimoCumplimiento={nMinimo}
      enlaceReputacion={enlaces.reputacion ? RUTAS_MI_MEDIO.reputacion : null}
    />
  )
}

async function BloqueCalidad({
  medioId,
  ahora,
  enlaces,
}: {
  medioId: string
  ahora: Date
  enlaces: Enlaces
}) {
  const [cuentas, parametros] = await Promise.all([
    cuentasCalidad(medioId),
    parametrosCalidad(),
  ])
  return (
    <CalidadCuentas
      calidades={calidadDeCuentas(cuentas, parametros)}
      parametros={parametros}
      ahora={ahora}
      enlaceCuentas={enlaces.miMedio ? RUTAS_MI_MEDIO.cuentas : null}
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

async function BloqueAcciones({
  ahora,
  enlaces,
}: {
  ahora: Date
  enlaces: Enlaces
}) {
  const [filas, plazo, asignaciones] = await Promise.all([
    proximasAcciones(CONSULTA_ACCIONES),
    plazoCargaHoras(),
    enCurso(enlaces),
  ])
  const acciones = accionesDelInicio(filas, {
    ahora,
    plazoCargaHoras: plazo,
    publicacionesPorAsignacion: publicacionesPorAsignacion(asignaciones),
  })
  const visibles = acciones.slice(0, LIMITE_ACCIONES)
  return (
    <ProximasAcciones
      acciones={visibles}
      ahoraServidor={ahora.getTime()}
      destino={enlaces.acciones}
      puedeReclamar={enlaces.reclamar}
      restantes={
        filas.length >= CONSULTA_ACCIONES
          ? null
          : acciones.length - visibles.length
      }
      enlaceTodas={enlaces.misCampanas ? RUTA_MIS_CAMPANAS : null}
      enlaceOfertas={enlaces.ofertas ? RUTA_OFERTAS_MEDIO : null}
      enCurso={asignaciones.length}
    />
  )
}

async function BloqueNegocios({
  periodo,
  enlaces,
}: PropsPeriodo & { enlaces: Enlaces }) {
  const [asignaciones, filas] = await Promise.all([
    enCurso(enlaces),
    kpisDelPeriodo(periodo),
  ])
  return (
    <NegociosEnCurso
      negocios={asignaciones.slice(0, LIMITE_NEGOCIOS)}
      activas={valorKpi(indicePorKpi(filas), "asignaciones_activas")}
      enlaceTodas={enlaces.misCampanas ? RUTA_MIS_CAMPANAS : null}
    />
  )
}

/**
 * Una columna en móvil, en el orden en que el medio lo necesita: cuánto gané
 * → qué tengo pendiente → historial → negocios en curso, y luego su tope, su
 * reputación y la calidad de sus cuentas. Ese es también el orden del
 * documento, así que el teclado y el lector de pantalla recorren lo mismo que
 * se ve (sin `order`: ahora casi todos los bloques tienen enlaces). Con el
 * panel desde 42 rem (tableta, 2 columnas) lo principal va a lo ancho y el
 * tope y la reputación en pareja (alturas parecidas); desde 56 rem
 * (escritorio), dos columnas reales: lo principal a la izquierda y lo de
 * consulta a la derecha. Los cortes miden el panel (`@container/panel`), no la
 * ventana: la barra lateral abierta le quita 256 px. Las columnas usan
 * `display: contents` por debajo de 56 rem, así sus bloques entran en la
 * misma rejilla.
 */
const RAIZ =
  "flex flex-col gap-4 sm:gap-5 @2xl/panel:grid @2xl/panel:grid-cols-2 @4xl/panel:grid-cols-3"
const COLUMNA =
  "contents @4xl/panel:flex @4xl/panel:min-w-0 @4xl/panel:flex-col @4xl/panel:gap-5"
const A_LO_ANCHO = "@2xl/panel:col-span-2"

interface PropsPanel {
  usuario: UsuarioSesion
  periodo: PeriodoPanel
  ahora: Date
}

/**
 * Indicadores del medio verificado, mobile-first: lo ganado (cifra héroe),
 * sus próximas acciones con cuenta regresiva y botón directo, la serie de
 * ganancias, los negocios en curso, el avance del tope anual de su nivel, su
 * reputación y la calidad de sus cuentas. Las RPC son definer y filtran por
 * su medio (`mi_medio_id()`).
 */
function IndicadoresMedio({
  usuario,
  periodo,
  ahora,
  medioId,
}: PropsPanel & { medioId: string }) {
  const enlaces = enlacesDe(usuario)

  return (
    <div className={RAIZ}>
      <div className={cn(COLUMNA, "@4xl/panel:col-span-2")}>
        <BloquePanel
          titulo="Tus ganancias del periodo"
          orden={1}
          className={A_LO_ANCHO}
          esqueleto={<EsqueletoHeroGanancias />}
        >
          <BloqueGanancias periodo={periodo} enlaces={enlaces} />
        </BloquePanel>
        <BloquePanel
          titulo="Próximas acciones"
          orden={2}
          className={A_LO_ANCHO}
          esqueleto={<EsqueletoLista filas={3} />}
        >
          <BloqueAcciones ahora={ahora} enlaces={enlaces} />
        </BloquePanel>
        <BloquePanel
          titulo="Tus ganancias"
          orden={3}
          className={A_LO_ANCHO}
          esqueleto={<EsqueletoTarjetaGrafico alto="min-h-64" />}
        >
          <BloqueSerieGanancias periodo={periodo} />
        </BloquePanel>
        {enlaces.misCampanas ? (
          <BloquePanel
            titulo="Negocios en curso"
            orden={4}
            className={cn(A_LO_ANCHO, "@4xl/panel:flex-1")}
            esqueleto={<EsqueletoLista filas={4} />}
          >
            <BloqueNegocios periodo={periodo} enlaces={enlaces} />
          </BloquePanel>
        ) : null}
      </div>

      <div className={COLUMNA}>
        <BloquePanel
          titulo="Tope anual de tu nivel"
          orden={5}
          esqueleto={<EsqueletoTopeAnual />}
        >
          <BloqueTope periodo={periodo} medioId={medioId} enlaces={enlaces} />
        </BloquePanel>
        <BloquePanel
          titulo="Tu reputación"
          orden={6}
          esqueleto={<EsqueletoReputacion />}
        >
          <BloqueReputacion
            periodo={periodo}
            medioId={medioId}
            ahora={ahora}
            enlaces={enlaces}
          />
        </BloquePanel>
        <BloquePanel
          titulo="Calidad de tus cuentas"
          orden={7}
          className={cn(A_LO_ANCHO, "@4xl/panel:flex-1")}
          esqueleto={<EsqueletoCalidadCuentas />}
        >
          <BloqueCalidad medioId={medioId} ahora={ahora} enlaces={enlaces} />
        </BloquePanel>
      </div>
    </div>
  )
}

function SinMedioVinculado() {
  return (
    <EstadoVacio
      icono={RadioTower}
      titulo="Tu cuenta aún no está vinculada a un medio"
      descripcion="Cuando el equipo de AMO la asocie a tu medio verás aquí tus ganancias, tu avance y tus pendientes."
      className="flex-none py-16"
    />
  )
}

/**
 * Mientras el medio no está verificado sus indicadores estarían vacíos: la
 * lista de alta los reemplaza (lo que le falta y el envío a verificación). Un
 * medio suspendido conserva su historia, con la situación encima.
 */
async function PanelSegunVerificacion({
  medioId,
  ...props
}: PropsPanel & { medioId: string }) {
  const medio = await medioPropio(medioId)
  if (!medio) return <SinMedioVinculado />
  const situacion = situacionMedio({
    estado: medio.estado,
    nivel: medio.nivel,
    enviadoVerificacionAt: medio.enviadoVerificacionAt,
    motivoEstado: medio.motivoEstado,
  })
  if (enAlta(situacion)) {
    const resumen = await resumenMiMedio(medioId)
    return resumen ? <AltaMedio resumen={resumen} /> : <SinMedioVinculado />
  }
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {situacion.tipo === "suspendido" ? (
        <TarjetaSituacion situacion={situacion} nombreNivel={null}>
          <EnlaceBoton
            href={RUTAS_MI_MEDIO.inicio}
            variant="outline"
            className="w-full sm:w-fit"
          >
            Ver mi medio
          </EnlaceBoton>
        </TarjetaSituacion>
      ) : null}
      <IndicadoresMedio {...props} medioId={medioId} />
    </div>
  )
}

/**
 * Panel del medio en Inicio: sus indicadores si está verificado o, durante el
 * alta, la lista de alta de «Mi medio». La situación se lee una vez (la
 * consulta se memoriza por solicitud y la comparten los bloques).
 */
export function PanelMedio(props: PropsPanel) {
  const { medioId } = props.usuario
  if (!medioId) return <SinMedioVinculado />
  return (
    <LimiteErrorMiMedio recurso="tu medio">
      <Suspense fallback={<EsqueletoInicioMedio />}>
        <PanelSegunVerificacion {...props} medioId={medioId} />
      </Suspense>
    </LimiteErrorMiMedio>
  )
}
