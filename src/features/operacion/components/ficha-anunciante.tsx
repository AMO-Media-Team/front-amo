import "server-only"

import {
  Ban,
  Building2,
  CircleDollarSign,
  Hourglass,
  Megaphone,
  PiggyBank,
  Receipt,
  ShieldX,
  Ticket,
} from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { banderaEmoji } from "@/features/accesos/catalogo"
import {
  formatearCOP,
  formatearFecha,
  formatearFechaHora,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"

import { proporcion } from "../calculos"
import { ESTADOS_ANUNCIANTE } from "../estados"
import { contar, contarCumplidas, unirUbicacion } from "../formato"
import { actividadAsignaciones } from "../queries/asignaciones-comun"
import {
  carteraDelAnunciante,
  desempenoDeCampanas,
} from "../queries/anunciantes"
import { campanasDelAnunciante } from "../queries/campanas"
import { RUTAS_OPERACION, rutaCampanasDe } from "../rutas"
import type {
  ActividadAsignaciones,
  AnuncianteDetalle,
  CampanaFila,
  CarteraAnunciante as Cartera,
} from "../tipos"
import { BarraLlenado, InsigniaDemo, InsigniaEstado } from "./distintivos"
import {
  AvisoFicha,
  CabeceraFicha,
  FechaRelativa,
  ListaDatos,
  Monograma,
  SinDato,
  TarjetaFicha,
} from "./ficha"
import { CarteraAnunciante } from "./cartera-anunciante"
import { ListaCampanas } from "./lista-campanas"
import { PanelPrivado } from "./panel-privado"
import { RejillaResumen, TarjetaResumen } from "./tarjeta-resumen"

// ── Cabecera ─────────────────────────────────────────────────────────────────

function AvisoEstadoAnunciante({
  anunciante,
}: {
  anunciante: AnuncianteDetalle
}) {
  switch (anunciante.estado) {
    case "SUSPENDIDO":
      return (
        <AvisoFicha
          tono="aviso"
          icono={Ban}
          titulo={`Suspendido${anunciante.suspendidoAt ? ` desde el ${formatearFecha(anunciante.suspendidoAt)}` : ""}`}
        >
          {anunciante.motivoEstado ??
            "No puede publicar ofertas mientras siga suspendido."}
        </AvisoFicha>
      )
    case "RECHAZADO":
      return (
        <AvisoFicha
          tono="peligro"
          icono={ShieldX}
          titulo={`Verificación rechazada${anunciante.rechazadoAt ? ` el ${formatearFecha(anunciante.rechazadoAt)}` : ""}`}
        >
          {anunciante.motivoEstado ?? "La verificación no fue aprobada."}
        </AvisoFicha>
      )
    case "PENDIENTE":
      return (
        <AvisoFicha tono="info" icono={Hourglass} titulo="En verificación">
          Aún no puede publicar ofertas: falta que AMO valide sus documentos.
        </AvisoFicha>
      )
    case "VERIFICADO":
      return null
  }
}

function Identificacion({ anunciante }: { anunciante: AnuncianteDetalle }) {
  if (!anunciante.identificacion) {
    return <SinDato>Sin identificación registrada</SinDato>
  }
  return (
    <span className="font-mono text-[0.8125rem] tracking-tight">
      {anunciante.identificacion}
    </span>
  )
}

export function CabeceraAnunciante({
  anunciante,
}: {
  anunciante: AnuncianteDetalle
}) {
  const bandera = banderaEmoji(anunciante.paisIso2)
  return (
    <CabeceraFicha
      volver={{ href: RUTAS_OPERACION.anunciantes, titulo: "Anunciantes" }}
      antetitulo={anunciante.sector ?? "Anunciante"}
      titulo={anunciante.nombreComercial}
      visual={
        anunciante.logoUrl ? (
          <Avatar className="size-14 shrink-0 rounded-2xl ring-1 ring-border after:rounded-2xl sm:size-16">
            <AvatarImage
              src={anunciante.logoUrl}
              alt={`Logo de ${anunciante.nombreComercial}`}
              className="rounded-2xl bg-white object-contain"
            />
            <AvatarFallback className="rounded-2xl">
              <Building2 aria-hidden className="size-6" />
            </AvatarFallback>
          </Avatar>
        ) : (
          <Monograma texto={anunciante.nombreComercial} />
        )
      }
      subtitulo={
        <span className="flex flex-col gap-x-2 gap-y-1 sm:flex-row sm:flex-wrap sm:items-center">
          <span>{anunciante.razonSocial}</span>
          <span aria-hidden className="max-sm:hidden">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5">
            {anunciante.tipoIdentificacion}
            <Identificacion anunciante={anunciante} />
          </span>
        </span>
      }
      distintivos={
        <>
          <InsigniaEstado
            catalogo={ESTADOS_ANUNCIANTE}
            estado={anunciante.estado}
          />
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full border bg-background/60 px-2.5 text-xs font-medium">
            {bandera ? <span aria-hidden>{bandera}</span> : null}
            {anunciante.pais}
          </span>
          {anunciante.esDemo ? <InsigniaDemo /> : null}
        </>
      }
      lateral={
        <>
          <span>
            Registrado el{" "}
            <time
              dateTime={anunciante.creadoAt}
              title={formatearFechaHora(anunciante.creadoAt)}
            >
              {formatearFecha(anunciante.creadoAt)}
            </time>
          </span>
          {anunciante.verificadoAt ? (
            <span>
              Verificado el {formatearFecha(anunciante.verificadoAt)}
              {anunciante.verificadoPor
                ? ` por ${anunciante.verificadoPor}`
                : ""}
            </span>
          ) : null}
        </>
      }
      aviso={<AvisoEstadoAnunciante anunciante={anunciante} />}
    />
  )
}

// ── Indicadores ──────────────────────────────────────────────────────────────

type CampoSumable =
  | "presupuestoTotal"
  | "presupuestoComprometido"
  | "cuposTotales"
  | "cuposOcupados"

function sumar(campanas: readonly CampanaFila[], campo: CampoSumable): number {
  return campanas.reduce((suma, campana) => suma + campana[campo], 0)
}

/**
 * Indicadores del anunciante: campañas, inversión comprometida y cupos
 * tomados; con `asignaciones.ver`, el GMV verificado, y con `facturas.ver`,
 * el saldo por cobrar.
 */
export async function SeccionIndicadoresAnunciante({
  anunciante,
  verCampanas,
  verAsignaciones,
  verCartera,
}: {
  anunciante: AnuncianteDetalle
  verCampanas: boolean
  verAsignaciones: boolean
  verCartera: boolean
}) {
  const [campanas, actividad, cartera] = await Promise.all([
    campanasDelAnunciante(anunciante.id),
    verAsignaciones ? actividadAsignaciones("anunciante", anunciante.id) : null,
    verCartera ? carteraDelAnunciante(anunciante.id) : null,
  ])
  return (
    <IndicadoresAnunciante
      anunciante={anunciante}
      campanas={campanas}
      actividad={actividad}
      cartera={cartera}
      conEnlaceCampanas={verCampanas}
    />
  )
}

export function IndicadoresAnunciante({
  anunciante,
  campanas,
  actividad,
  cartera,
  conEnlaceCampanas = true,
}: {
  anunciante: AnuncianteDetalle
  campanas: readonly CampanaFila[]
  /** `null` sin `asignaciones.ver`. */
  actividad: ActividadAsignaciones | null
  /** `null` sin `facturas.ver`. */
  cartera: Cartera | null
  /** `campanas.ver`: la tarjeta abre el listado de sus campañas. */
  conEnlaceCampanas?: boolean
}) {
  const activas = campanas.filter(
    (campana) => campana.estado === "ACTIVA"
  ).length
  const presupuesto = sumar(campanas, "presupuestoTotal")
  const comprometido = sumar(campanas, "presupuestoComprometido")
  const cupos = sumar(campanas, "cuposTotales")
  const ocupados = sumar(campanas, "cuposOcupados")
  const llenado = proporcion(ocupados, cupos)
  const columnas = (3 + (actividad ? 1 : 0) + (cartera ? 1 : 0)) as 3 | 4 | 5

  return (
    <RejillaResumen etiqueta="Indicadores del anunciante" columnas={columnas}>
      <TarjetaResumen
        indice={0}
        titulo="Campañas"
        valor={campanas.length}
        icono={Megaphone}
        href={conEnlaceCampanas ? rutaCampanasDe(anunciante.id) : undefined}
        detalle={
          campanas.length > 0
            ? `${formatearNumero(activas)} ${activas === 1 ? "activa" : "activas"}`
            : "Aún no crea campañas"
        }
      />
      <TarjetaResumen
        indice={1}
        titulo="Inversión comprometida"
        valor={comprometido}
        formato="copCompacto"
        icono={PiggyBank}
        tono="info"
        detalle={
          presupuesto > 0
            ? `${formatearPorcentaje(proporcion(comprometido, presupuesto), 0)} de ${formatearCOP(presupuesto)} presupuestados`
            : "Sin presupuesto asignado"
        }
      >
        <BarraLlenado
          fraccion={proporcion(comprometido, presupuesto)}
          tono="info"
        />
      </TarjetaResumen>
      <TarjetaResumen
        indice={2}
        titulo="Cupos tomados"
        valor={llenado}
        formato="porcentaje"
        decimales={0}
        icono={Ticket}
        detalle={
          cupos > 0
            ? `${formatearNumero(ocupados)} de ${contar(cupos, "cupo ofertado", "cupos ofertados")}`
            : "Sin cupos ofertados"
        }
      >
        <BarraLlenado
          fraccion={llenado}
          tono={llenado === 1 ? "exito" : "primario"}
        />
      </TarjetaResumen>
      {actividad ? (
        <TarjetaResumen
          indice={3}
          titulo="GMV verificado"
          valor={actividad.indicadores.gmvVerificado}
          formato="copCompacto"
          icono={CircleDollarSign}
          tono="exito"
          detalle={contarCumplidas(actividad.indicadores.porGrupo.cumplidas)}
        />
      ) : null}
      {cartera ? (
        <TarjetaResumen
          indice={4}
          titulo="Cartera por cobrar"
          valor={cartera.resumen.saldo}
          formato="copCompacto"
          icono={Receipt}
          tono={cartera.resumen.facturasVencidas > 0 ? "aviso" : "neutro"}
          alerta={cartera.resumen.facturasVencidas > 0}
          detalle={
            cartera.resumen.facturasVencidas > 0
              ? `${formatearNumero(cartera.resumen.facturasVencidas)} ${
                  cartera.resumen.facturasVencidas === 1
                    ? "factura vencida"
                    : "facturas vencidas"
                }`
              : cartera.resumen.saldo > 0
                ? "Al día"
                : "Sin saldo pendiente"
          }
        />
      ) : null}
    </RejillaResumen>
  )
}

// ── Pestañas ─────────────────────────────────────────────────────────────────

function SiNo({ valor }: { valor: boolean | null }) {
  if (valor === null) return <SinDato>No informado</SinDato>
  return <>{valor ? "Sí" : "No"}</>
}

/** Pestaña Resumen: datos de la empresa, facturación y contacto protegido. */
export function SeccionResumenAnunciante({
  anunciante,
  verSensibles,
}: {
  anunciante: AnuncianteDetalle
  verSensibles: boolean
}) {
  const ubicacion = unirUbicacion(anunciante.ciudad, anunciante.departamento)
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <TarjetaFicha
        titulo="Empresa"
        icono={Building2}
        className="lg:col-span-3"
      >
        <ListaDatos
          datos={[
            { etiqueta: "Nombre comercial", valor: anunciante.nombreComercial },
            { etiqueta: "Razón social", valor: anunciante.razonSocial },
            {
              etiqueta: anunciante.tipoIdentificacion,
              valor: <Identificacion anunciante={anunciante} />,
            },
            { etiqueta: "Sector", valor: anunciante.sector ?? <SinDato /> },
            {
              etiqueta: "País",
              valor:
                `${banderaEmoji(anunciante.paisIso2) ?? ""} ${anunciante.pais}`.trim(),
            },
            { etiqueta: "Ciudad", valor: ubicacion || <SinDato /> },
            {
              etiqueta: "Verificación",
              valor: anunciante.verificadoAt ? (
                <FechaRelativa valor={anunciante.verificadoAt} estilo="medio" />
              ) : (
                <SinDato>Aún no verificado</SinDato>
              ),
              ayuda: anunciante.verificadoPor
                ? `Por ${anunciante.verificadoPor}`
                : null,
            },
            {
              etiqueta: "Registro",
              valor: (
                <FechaRelativa valor={anunciante.creadoAt} estilo="medio" />
              ),
            },
          ]}
        />
      </TarjetaFicha>
      <div className="flex flex-col gap-4 lg:col-span-2">
        <TarjetaFicha titulo="Facturación" icono={Receipt}>
          <ListaDatos
            className="sm:grid-cols-1 xl:grid-cols-2"
            datos={[
              {
                etiqueta: "Correo de facturación",
                valor: anunciante.facturacion.email ?? (
                  <SinDato>No informado</SinDato>
                ),
              },
              {
                etiqueta: "Régimen",
                valor: anunciante.facturacion.regimen ?? (
                  <SinDato>No informado</SinDato>
                ),
              },
              {
                etiqueta: "Gran contribuyente",
                valor: (
                  <SiNo valor={anunciante.facturacion.granContribuyente} />
                ),
              },
              {
                etiqueta: "Autorretenedor",
                valor: <SiNo valor={anunciante.facturacion.autorretenedor} />,
              },
            ]}
          />
        </TarjetaFicha>
        {verSensibles ? (
          <PanelPrivado
            entidad="anunciante"
            id={anunciante.id}
            grupo="contacto"
            nombre={anunciante.nombreComercial}
          />
        ) : null}
      </div>
    </div>
  )
}

/** Pestaña Campañas: todas las del anunciante, con su desempeño si se puede ver. */
export async function SeccionCampanasAnunciante({
  anunciante,
}: {
  anunciante: AnuncianteDetalle
}) {
  const [campanas, desempeno] = await Promise.all([
    campanasDelAnunciante(anunciante.id),
    desempenoDeCampanas(anunciante.id),
  ])
  if (campanas.length === 0) {
    return (
      <EstadoVacio
        icono={Megaphone}
        titulo="Aún no hay campañas"
        descripcion="Cuando el anunciante cree campañas y publique ofertas, aparecerán aquí con su presupuesto y su desempeño."
      />
    )
  }
  return (
    <TarjetaFicha
      titulo="Campañas"
      icono={Megaphone}
      descripcion={
        desempeno
          ? "Presupuesto comprometido, cupos y resultados verificados de todo su historial."
          : "Presupuesto comprometido y cupos tomados de cada campaña."
      }
      acciones={
        <EnlaceBoton
          variant="outline"
          size="sm"
          href={rutaCampanasDe(anunciante.id)}
        >
          Ver en el listado
        </EnlaceBoton>
      }
    >
      <ListaCampanas campanas={campanas} desempeno={desempeno} />
    </TarjetaFicha>
  )
}

/** Pestaña Cartera (`facturas.ver`). */
export async function SeccionCarteraAnunciante({
  anuncianteId,
}: {
  anuncianteId: string
}) {
  return (
    <CarteraAnunciante cartera={await carteraDelAnunciante(anuncianteId)} />
  )
}
