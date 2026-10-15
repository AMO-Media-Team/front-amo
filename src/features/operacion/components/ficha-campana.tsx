import "server-only"

import {
  BarChart3,
  Building2,
  CalendarRange,
  CircleDollarSign,
  CircleSlash,
  Coins,
  Eye,
  Heart,
  Megaphone,
  MousePointerClick,
  PiggyBank,
  Radio,
  Target,
  Ticket,
  Wallet,
} from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { serializarFecha } from "@/lib/fechas"
import {
  formatearCOP,
  formatearFecha,
  formatearFechaHora,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"

import { proporcion } from "../calculos"
import { ESTADOS_CAMPANA, ESTADOS_OFERTA } from "../estados"
import {
  contar,
  contarCumplidas,
  diasDeVigencia,
  faseVigencia,
  formatearVigencia,
} from "../formato"
import { desempenoDeCampanas } from "../queries/anunciantes"
import { actividadAsignaciones } from "../queries/asignaciones-comun"
import { ofertasDeCampana } from "../queries/campanas"
import { RUTAS_OPERACION, rutaAnunciante } from "../rutas"
import type {
  ActividadAsignaciones,
  CampanaDetalle,
  DesempenoCampana,
  OfertaDetalle,
} from "../tipos"
import {
  BarraLlenado,
  InsigniaDemo,
  InsigniaEstado,
  InsigniaTono,
} from "./distintivos"
import { AvisoFicha, CabeceraFicha, EnlaceFicha, Monograma } from "./ficha"
import { RejillaResumen, TarjetaResumen } from "./tarjeta-resumen"
import { TarjetaOferta } from "./tarjeta-oferta"

const MS_DIA = 86_400_000

function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (new Date(`${hasta}T12:00:00-05:00`).getTime() -
      new Date(`${desde}T12:00:00-05:00`).getTime()) /
      MS_DIA
  )
}

/** "En curso · faltan 12 días", "Empieza en 3 días", "Terminó hace 5 días". */
function DistintivoFase({
  campana,
  hoy,
}: {
  campana: CampanaDetalle
  hoy: string
}) {
  // Finalizada, cancelada o en borrador: su estado ya lo dice todo.
  if (campana.estado !== "ACTIVA") return null
  const fase = faseVigencia(campana.fechaInicio, campana.fechaFin, hoy)
  if (fase === "por_iniciar") {
    const dias = diasEntre(hoy, campana.fechaInicio)
    return (
      <InsigniaTono
        tono="info"
        etiqueta={
          dias === 1
            ? "Empieza mañana"
            : `Empieza en ${formatearNumero(dias)} días`
        }
      />
    )
  }
  if (fase === "en_curso") {
    const dias = diasEntre(hoy, campana.fechaFin)
    return (
      <InsigniaTono
        tono="exito"
        etiqueta={
          dias === 0
            ? "Último día"
            : `En curso · ${dias === 1 ? "falta 1 día" : `faltan ${formatearNumero(dias)} días`}`
        }
      />
    )
  }
  return <InsigniaTono tono="neutro" etiqueta="Vigencia terminada" />
}

export function CabeceraCampana({
  campana,
  verAnunciante,
}: {
  campana: CampanaDetalle
  /** `anunciantes.ver`: el nombre enlaza a su ficha. */
  verAnunciante: boolean
}) {
  const hoy = serializarFecha(new Date())
  const dias = diasDeVigencia(campana.fechaInicio, campana.fechaFin)
  return (
    <CabeceraFicha
      volver={{ href: RUTAS_OPERACION.campanas, titulo: "Campañas" }}
      antetitulo={`Campaña · ${campana.marca}`}
      titulo={campana.nombre}
      visual={<Monograma icono={Megaphone} />}
      subtitulo={
        <span className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <EnlaceFicha
              href={rutaAnunciante(campana.anuncianteId)}
              permitido={verAnunciante}
              className="inline-flex items-center gap-1.5 font-medium text-foreground"
            >
              <Building2
                aria-hidden
                className="size-3.5 text-muted-foreground"
              />
              {campana.anunciante ?? "Anunciante"}
            </EnlaceFicha>
            <span className="inline-flex items-center gap-1.5 cifras">
              <CalendarRange aria-hidden className="size-3.5" />
              {formatearVigencia(campana.fechaInicio, campana.fechaFin)} ·{" "}
              {formatearNumero(dias)} {dias === 1 ? "día" : "días"}
            </span>
          </span>
          {campana.objetivo ? (
            <span
              className="line-clamp-2 max-w-2xl text-pretty"
              title={campana.objetivo}
            >
              {campana.objetivo}
            </span>
          ) : null}
        </span>
      }
      distintivos={
        <>
          <InsigniaEstado catalogo={ESTADOS_CAMPANA} estado={campana.estado} />
          <DistintivoFase campana={campana} hoy={hoy} />
          {campana.esDemo ? <InsigniaDemo /> : null}
        </>
      }
      lateral={
        <>
          <span>
            Creada el{" "}
            <time
              dateTime={campana.creadaAt}
              title={formatearFechaHora(campana.creadaAt)}
            >
              {formatearFecha(campana.creadaAt)}
            </time>
          </span>
          {campana.activadaAt ? (
            <span>Activada el {formatearFecha(campana.activadaAt)}</span>
          ) : null}
          {campana.finalizadaAt ? (
            <span>Finalizada el {formatearFecha(campana.finalizadaAt)}</span>
          ) : null}
        </>
      }
      aviso={
        campana.estado === "CANCELADA" ? (
          <AvisoFicha
            tono="peligro"
            icono={CircleSlash}
            titulo={`Campaña cancelada${campana.canceladaAt ? ` el ${formatearFecha(campana.canceladaAt)}` : ""}`}
          >
            Sus ofertas dejaron de estar disponibles; las asignaciones ya
            cumplidas se conservan.
          </AvisoFicha>
        ) : null
      }
    />
  )
}

// ── Indicadores ──────────────────────────────────────────────────────────────

const OFERTAS_VIGENTES = new Set([
  "PUBLICADA",
  "CUPOS_COMPLETOS",
  "EN_EJECUCION",
])

/**
 * Indicadores de la campaña: presupuesto y lo comprometido, ofertas y cupos
 * tomados y, con `asignaciones.ver`, el GMV verificado.
 */
export async function SeccionIndicadoresCampana({
  campana,
  verOfertas,
  verAsignaciones,
}: {
  campana: CampanaDetalle
  verOfertas: boolean
  verAsignaciones: boolean
}) {
  const [ofertas, actividad] = await Promise.all([
    verOfertas ? ofertasDeCampana(campana.id) : null,
    verAsignaciones ? actividadAsignaciones("campana", campana.id) : null,
  ])
  return (
    <IndicadoresCampana
      campana={campana}
      ofertas={ofertas}
      actividad={actividad}
    />
  )
}

export function IndicadoresCampana({
  campana,
  ofertas,
  actividad,
}: {
  campana: CampanaDetalle
  /** `null` sin `ofertas.ver`. */
  ofertas: readonly OfertaDetalle[] | null
  /** `null` sin `asignaciones.ver`. */
  actividad: ActividadAsignaciones | null
}) {
  const uso = proporcion(
    campana.presupuestoComprometido,
    campana.presupuestoTotal
  )
  const vigentes =
    ofertas?.filter((oferta) => OFERTAS_VIGENTES.has(oferta.estado)).length ?? 0
  const cupos =
    ofertas?.reduce((suma, oferta) => suma + oferta.cupos.totales, 0) ?? 0
  const ocupados =
    ofertas?.reduce((suma, oferta) => suma + oferta.cupos.ocupados, 0) ?? 0
  const llenado = proporcion(ocupados, cupos)

  return (
    <RejillaResumen etiqueta="Indicadores de la campaña" columnas={5}>
      <TarjetaResumen
        indice={0}
        titulo="Presupuesto"
        valor={campana.presupuestoTotal}
        formato="copCompacto"
        icono={PiggyBank}
        detalle={`${formatearCOP(
          Math.max(
            0,
            campana.presupuestoTotal - campana.presupuestoComprometido
          )
        )} sin comprometer`}
      />
      <TarjetaResumen
        indice={1}
        titulo="Comprometido"
        valor={campana.presupuestoComprometido}
        formato="copCompacto"
        icono={Wallet}
        tono="info"
        detalle={`${formatearPorcentaje(uso, 0)} del presupuesto, en cupos aceptados`}
      >
        <BarraLlenado fraccion={uso} tono="info" />
      </TarjetaResumen>
      <TarjetaResumen
        indice={2}
        titulo="Ofertas"
        valor={ofertas ? ofertas.length : null}
        icono={Megaphone}
        detalle={
          !ofertas
            ? "Sin permiso para ver las ofertas"
            : ofertas.length > 0
              ? `${formatearNumero(vigentes)} ${vigentes === 1 ? "vigente" : "vigentes"} en el marketplace`
              : "Aún sin ofertas"
        }
      />
      <TarjetaResumen
        indice={3}
        titulo="Cupos tomados"
        valor={ofertas ? llenado : null}
        formato="porcentaje"
        decimales={0}
        icono={Ticket}
        tono={llenado === 1 ? "exito" : "neutro"}
        detalle={
          cupos > 0
            ? `${formatearNumero(ocupados)} de ${contar(cupos, "cupo", "cupos")}`
            : "Sin cupos ofertados"
        }
      >
        <BarraLlenado
          fraccion={llenado}
          tono={llenado === 1 ? "exito" : "primario"}
        />
      </TarjetaResumen>
      <TarjetaResumen
        indice={4}
        titulo="GMV verificado"
        valor={actividad ? actividad.indicadores.gmvVerificado : null}
        formato="copCompacto"
        icono={CircleDollarSign}
        tono="exito"
        detalle={
          actividad
            ? contarCumplidas(actividad.indicadores.porGrupo.cumplidas)
            : "Requiere ver asignaciones"
        }
      />
    </RejillaResumen>
  )
}

// ── Ofertas ──────────────────────────────────────────────────────────────────

const ORDEN_OFERTAS = Object.keys(ESTADOS_OFERTA)

function ordenarOfertas(ofertas: readonly OfertaDetalle[]): OfertaDetalle[] {
  // Primero lo que está en juego (publicadas, en ejecución), luego el resto.
  const prioridad = (oferta: OfertaDetalle) =>
    OFERTAS_VIGENTES.has(oferta.estado)
      ? 0
      : ORDEN_OFERTAS.indexOf(oferta.estado) + 1
  return [...ofertas].sort((a, b) => prioridad(a) - prioridad(b))
}

/** Pestaña Ofertas: cada oferta con cupos por franja, presupuesto, ventana y segmentación. */
export async function SeccionOfertasCampana({
  campanaId,
}: {
  campanaId: string
}) {
  return <ListaOfertas ofertas={await ofertasDeCampana(campanaId)} />
}

export function ListaOfertas({
  ofertas,
}: {
  ofertas: readonly OfertaDetalle[]
}) {
  if (ofertas.length === 0) {
    return (
      <EstadoVacio
        icono={Megaphone}
        titulo="Esta campaña aún no tiene ofertas"
        descripcion="Las ofertas definen la plataforma, el formato, los cupos por franja y el presupuesto máximo que los medios pueden tomar."
      />
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {ordenarOfertas(ofertas).map((oferta, indice) => (
        <TarjetaOferta key={oferta.id} oferta={oferta} indice={indice} />
      ))}
    </div>
  )
}

// ── Desempeño ────────────────────────────────────────────────────────────────

export function IndicadoresDesempeno({
  desempeno,
}: {
  desempeno: DesempenoCampana
}) {
  return (
    <RejillaResumen etiqueta="Desempeño verificado de la campaña" columnas={4}>
      <TarjetaResumen
        indice={0}
        titulo="Alcance"
        valor={desempeno.alcance}
        formato="compacto"
        icono={Radio}
        detalle={`Último corte validado de ${contar(desempeno.nVerificadas, "publicación", "publicaciones")}`}
      />
      <TarjetaResumen
        indice={1}
        titulo="Impresiones"
        valor={desempeno.impresiones}
        formato="compacto"
        icono={Eye}
        detalle="Incluye las reproducciones de TikTok"
      />
      <TarjetaResumen
        indice={2}
        titulo="Interacciones"
        valor={desempeno.interacciones}
        formato="compacto"
        icono={Heart}
        detalle={
          desempeno.engagement === null
            ? "Sin alcance para calcular el engagement"
            : `Engagement ${formatearPorcentaje(desempeno.engagement, 1)}`
        }
      />
      <TarjetaResumen
        indice={3}
        titulo="Clics al enlace"
        valor={desempeno.clics}
        formato="compacto"
        icono={MousePointerClick}
        detalle="Donde la plataforma los reporta"
      />
      <TarjetaResumen
        indice={4}
        titulo="CPM efectivo"
        valor={desempeno.cpmEfectivo}
        formato="cop"
        icono={Coins}
        detalle="Costo por mil impresiones verificadas"
      />
      <TarjetaResumen
        indice={5}
        titulo="Costo por interacción"
        valor={desempeno.costoPorInteraccion}
        formato="cop"
        icono={CircleDollarSign}
        detalle="GMV verificado ÷ interacciones"
      />
      <TarjetaResumen
        indice={6}
        titulo="Cumplimiento"
        valor={desempeno.tasaCumplimiento}
        formato="porcentaje"
        decimales={0}
        icono={Target}
        tono={
          desempeno.tasaCumplimiento !== null &&
          desempeno.tasaCumplimiento < 0.8
            ? "aviso"
            : "exito"
        }
        detalle="Publicadas y validadas a tiempo sobre las comprometidas"
      />
      <TarjetaResumen
        indice={7}
        titulo="Llenado de cupos"
        valor={desempeno.tasaLlenado}
        formato="porcentaje"
        decimales={0}
        icono={Ticket}
        detalle="Cupos tomados de las ofertas que ya cerraron su aceptación"
      />
    </RejillaResumen>
  )
}

/** Pestaña Desempeño (`reportes.ver`): resultados verificados de la campaña. */
export async function SeccionDesempenoCampana({
  campana,
}: {
  campana: CampanaDetalle
}) {
  const porCampana = await desempenoDeCampanas(campana.anuncianteId)
  const desempeno = porCampana?.get(campana.id)
  if (!desempeno || desempeno.nVerificadas === 0) {
    return (
      <EstadoVacio
        icono={BarChart3}
        titulo="Aún sin resultados verificados"
        descripcion="Cuando AMO valide las métricas de las publicaciones de esta campaña verás aquí su alcance, interacciones, CPM y cumplimiento."
      />
    )
  }
  return <IndicadoresDesempeno desempeno={desempeno} />
}
