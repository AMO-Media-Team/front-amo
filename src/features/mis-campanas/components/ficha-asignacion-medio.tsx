import {
  Ban,
  Banknote,
  CircleSlash,
  FileDown,
  History,
  ListChecks,
  Scale,
  TimerOff,
  TriangleAlert,
} from "lucide-react"
import type { ReactNode } from "react"

import { EnlaceBoton } from "@/components/layout/enlace-boton"
import {
  condicionesOferta,
  type Condicion,
} from "@/features/marketplace/presentacion"
import {
  InsigniaEstado,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import {
  AvisoFicha,
  CabeceraFicha,
  FechaRelativa,
  ListaDatos,
  TarjetaFicha,
} from "@/features/operacion/components/ficha"
import { LineaTiempoAsignacion } from "@/features/operacion/components/linea-tiempo-asignacion"
import { CAUSAS_CANCELACION } from "@/features/operacion/estados"
import { contar, formatearHandle } from "@/features/operacion/formato"
import { formatearCOP, formatearFecha, formatearFechaHora } from "@/lib/format"
import { cn } from "@/lib/utils"

import { resumenContenido } from "../contenido"
import { ESTADOS_PARA_MEDIO } from "../estados"
import { desglosePago, lineaTiempoMedio } from "../presentacion"
import { RUTA_MIS_CAMPANAS, rutaContenido } from "../rutas"
import type {
  AsignacionMedio,
  CondicionesOferta,
  EjecucionAsignacion,
} from "../tipos"

// ── Cabecera ─────────────────────────────────────────────────────────────────

/** Desistida, vencida, cancelada, en disputa o con métricas atrasadas. */
export function AvisoAsignacionMedio({
  asignacion,
}: {
  asignacion: AsignacionMedio
}) {
  switch (asignacion.estado) {
    case "CANCELADA":
      return (
        <AvisoFicha
          tono="peligro"
          icono={Ban}
          titulo="El equipo AMO canceló tu participación en esta campaña"
        >
          {[
            asignacion.causaCancelacion
              ? `Causa: ${CAUSAS_CANCELACION[asignacion.causaCancelacion].toLocaleLowerCase("es-CO")}.`
              : null,
            asignacion.motivo,
          ]
            .filter(Boolean)
            .join(" ") ||
            "Si tienes dudas sobre la cancelación, escríbele al equipo AMO."}
        </AvisoFicha>
      )
    case "RECHAZADA":
      return (
        <AvisoFicha
          tono="neutro"
          icono={CircleSlash}
          titulo="Desististe de esta campaña"
        >
          {asignacion.motivo
            ? `Tu motivo: «${asignacion.motivo}». El cupo quedó libre para otro medio.`
            : "El cupo quedó libre para otro medio."}
        </AvisoFicha>
      )
    case "VENCIDA_SIN_PUBLICAR":
      return (
        <AvisoFicha
          tono="peligro"
          icono={TimerOff}
          titulo="Venció el plazo para publicar"
        >
          {`La fecha límite era el ${formatearFechaHora(asignacion.fechaLimitePublicacion)} y no llegó la evidencia de la publicación. El cupo se liberó.`}
        </AvisoFicha>
      )
    case "EN_DISPUTA":
      return (
        <AvisoFicha tono="aviso" icono={Scale} titulo="Hay una disputa abierta">
          {asignacion.motivo ??
            "El equipo AMO la está revisando y te avisará la decisión."}
        </AvisoFicha>
      )
    case "PUBLICADA":
    case "EVIDENCIA_VALIDADA":
      return asignacion.metricasAtrasadasAt ? (
        <AvisoFicha
          tono="aviso"
          icono={TriangleAlert}
          titulo="Tienes métricas atrasadas"
        >
          Carga los cortes que faltan lo antes posible: sin ellos la campaña no
          se verifica ni entra a liquidación.
        </AvisoFicha>
      ) : null
    default:
      return null
  }
}

export function CabeceraAsignacionMedio({
  asignacion,
}: {
  asignacion: AsignacionMedio
}) {
  const { marca, anuncianteNombre } = asignacion
  return (
    <CabeceraFicha
      volver={{ href: RUTA_MIS_CAMPANAS, titulo: "Mis campañas" }}
      antetitulo={marca ?? anuncianteNombre ?? "Campaña"}
      titulo={asignacion.ofertaTitulo}
      subtitulo={
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <MarcaPlataforma plataforma={asignacion.plataforma} conNombre />
          <span aria-hidden>·</span>
          <span>{asignacion.formatoNombre}</span>
          {asignacion.handle ? (
            <>
              <span aria-hidden>·</span>
              <span>con {formatearHandle(asignacion.handle)}</span>
            </>
          ) : null}
          {marca && anuncianteNombre && marca !== anuncianteNombre ? (
            <>
              <span aria-hidden>·</span>
              <span>de {anuncianteNombre}</span>
            </>
          ) : null}
        </span>
      }
      distintivos={
        <InsigniaEstado
          catalogo={ESTADOS_PARA_MEDIO}
          estado={asignacion.estado}
        />
      }
      lateral={
        asignacion.aceptadaAt ? (
          <span>
            Aceptaste el{" "}
            <time dateTime={asignacion.aceptadaAt}>
              {formatearFechaHora(asignacion.aceptadaAt)}
            </time>
          </span>
        ) : null
      }
      aviso={<AvisoAsignacionMedio asignacion={asignacion} />}
    />
  )
}

// ── Pago ─────────────────────────────────────────────────────────────────────

/**
 * Lo que recibe, congelado al aceptar (no cambia aunque cambien las tarifas),
 * con el multiplicador de calidad aplicado y, si la configuración lo deja
 * ver, la tarifa, el valor y la comisión.
 */
export function PagoAsignacionMedio({
  asignacion,
}: {
  asignacion: AsignacionMedio
}) {
  const { lineas, comisionVisible } = desglosePago(
    asignacion.pago,
    asignacion.publicaciones
  )
  const total = asignacion.pago.montoNeto ?? asignacion.pago.montoMedio ?? null
  return (
    <TarjetaFicha
      titulo="Tu pago"
      icono={Banknote}
      descripcion={
        asignacion.aceptadaAt
          ? `Precio congelado al aceptar, el ${formatearFecha(asignacion.aceptadaAt, "largo")}.`
          : "Precio congelado al aceptar."
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            {asignacion.pago.montoNeto !== null
              ? "Recibes después de retenciones"
              : "Recibes"}
            {asignacion.publicaciones > 1
              ? ` por ${contar(asignacion.publicaciones, "publicación", "publicaciones")}`
              : ""}
          </span>
          <span className="text-3xl leading-tight font-bold cifras tracking-tight">
            {total !== null ? formatearCOP(total) : "—"}
          </span>
        </div>
        <dl className="flex flex-col divide-y rounded-xl border">
          {lineas.map((linea) => (
            <div
              key={linea.clave}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 px-3 py-2.5",
                linea.destacada && "bg-primary/6"
              )}
            >
              <dt
                className={cn(
                  "text-sm",
                  linea.destacada ? "font-semibold" : "text-muted-foreground"
                )}
              >
                {linea.etiqueta}
              </dt>
              <dd
                className={cn(
                  "text-right text-sm cifras whitespace-nowrap",
                  linea.destacada && "font-semibold"
                )}
              >
                {linea.valor}
              </dd>
              {linea.ayuda ? (
                <dd className="col-span-2 text-xs text-pretty text-muted-foreground">
                  {linea.ayuda}
                </dd>
              ) : null}
            </div>
          ))}
        </dl>
        {comisionVisible ? null : (
          <p className="text-xs text-muted-foreground">
            Las retenciones se descuentan al liquidar, según tus datos
            tributarios.
          </p>
        )}
      </div>
    </TarjetaFicha>
  )
}

// ── Contenido ────────────────────────────────────────────────────────────────

/** Qué versión descargó y el enlace a «Contenido» (instrucciones y archivos). */
export function ResumenContenido({
  asignacion,
  ejecucion,
  ahora,
}: {
  asignacion: AsignacionMedio
  ejecucion: EjecucionAsignacion
  ahora: Date
}) {
  const ultima = ejecucion.descargas.at(-1) ?? null
  let descripcion: ReactNode
  let enlace: string | null = "Ver el contenido"
  switch (resumenContenido(asignacion, ahora)) {
    case "no_disponible":
      descripcion = "El contenido de esta campaña ya no está disponible."
      enlace = null
      break
    case "fuera_de_plazo":
      descripcion = "Venció el plazo para publicar sin descargar el contenido."
      enlace = null
      break
    case "por_descargar":
      descripcion =
        "Lee las instrucciones y descarga los archivos y el texto para tu publicación."
      enlace = "Ver instrucciones y descargar"
      break
    case "descargado":
      descripcion = ultima ? (
        <>
          Descargaste{" "}
          {ultima.version ? `la versión ${ultima.version}` : "el contenido"} el{" "}
          <time dateTime={ultima.at}>{formatearFechaHora(ultima.at)}</time>.
          Puedes volver a ver los archivos y copiar el texto cuando quieras.
        </>
      ) : (
        "Ya descargaste el contenido. Puedes volver a ver los archivos y copiar el texto cuando quieras."
      )
  }
  return (
    <TarjetaFicha titulo="Contenido" icono={FileDown}>
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-pretty text-muted-foreground">
          {descripcion}
        </p>
        {enlace ? (
          <EnlaceBoton
            href={rutaContenido(asignacion.id)}
            variant="outline"
            size="sm"
          >
            {enlace}
          </EnlaceBoton>
        ) : null}
      </div>
    </TarjetaFicha>
  )
}

// ── Condiciones ──────────────────────────────────────────────────────────────

function ListaCondiciones({ condiciones }: { condiciones: Condicion[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {condiciones.map((condicion) => (
        <li key={condicion.clave} className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{condicion.titulo}</span>
          <span className="text-xs text-pretty text-muted-foreground">
            {condicion.descripcion}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Lo que aceptó: ventana, fecha límite, permanencia, cortes y exclusividad. */
export function CondicionesAsignacion({
  asignacion,
  condiciones,
}: {
  asignacion: AsignacionMedio
  condiciones: CondicionesOferta | null
}) {
  return (
    <TarjetaFicha titulo="Lo que aceptaste" icono={ListChecks}>
      <div className="flex flex-col gap-5">
        <ListaDatos
          className="sm:grid-cols-1"
          datos={[
            {
              etiqueta: "Ventana de publicación",
              valor: `Del ${formatearFechaHora(asignacion.ventanaInicio)} al ${formatearFechaHora(asignacion.ventanaFin)}`,
            },
            {
              etiqueta: "Publica y carga la evidencia a más tardar",
              valor: (
                <FechaRelativa valor={asignacion.fechaLimitePublicacion} />
              ),
            },
          ]}
        />
        <ListaCondiciones
          condiciones={condicionesOferta({
            permanenciaDias: asignacion.permanenciaMinimaDias,
            exclusividadDias: condiciones?.exclusividadDias ?? null,
            cortes: asignacion.cortesRequeridos,
          })}
        />
      </div>
    </TarjetaFicha>
  )
}

// ── Historia ─────────────────────────────────────────────────────────────────

export function HistoriaAsignacion({
  asignacion,
  ejecucion,
}: {
  asignacion: AsignacionMedio
  ejecucion: EjecucionAsignacion
}) {
  return (
    <TarjetaFicha
      titulo="Historia"
      icono={History}
      descripcion="Lo que ha pasado en esta campaña, del primer al último paso."
    >
      {/* `conBitacora`: la nota sobre la bitácora es para el equipo AMO, no para el medio. */}
      <LineaTiempoAsignacion
        eventos={lineaTiempoMedio(asignacion, ejecucion)}
        conBitacora
      />
    </TarjetaFicha>
  )
}
