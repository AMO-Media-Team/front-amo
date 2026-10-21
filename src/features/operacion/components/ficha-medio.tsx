import "server-only"

import {
  BadgeCheck,
  Ban,
  CircleDollarSign,
  Gauge,
  Globe2,
  Hourglass,
  MapPin,
  Megaphone,
  RadioTower,
  ShieldX,
  Star,
  Target,
  UsersRound,
} from "lucide-react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { banderaEmoji } from "@/features/accesos/catalogo"
import {
  formatearCOP,
  formatearCOPCompacto,
  formatearFecha,
  formatearFechaHora,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { type IndicadoresAsignaciones, situacionTope } from "../calculos"
import { ESTADOS_MEDIO, etiquetaNivel, TIPOS_MEDIO } from "../estados"
import {
  contar,
  formatearCalificacion,
  formatearMultiplicador,
  unirUbicacion,
} from "../formato"
import { actividadAsignaciones } from "../queries/asignaciones-comun"
import { configuracionOperacion } from "../queries/comun"
import {
  documentosDelMedio,
  type PerfilAudiencia,
  perfilAudiencia,
  topeAnualDelMedio,
} from "../queries/medios"
import { RUTAS_OPERACION } from "../rutas"
import type { CuentaSocialDetalle, MedioDetalle, TopeAnual } from "../tipos"
import {
  BarraLlenado,
  InsigniaDemo,
  InsigniaEstado,
  InsigniaNivel,
} from "./distintivos"
import {
  AvisoFicha,
  CabeceraFicha,
  FechaRelativa,
  ListaDatos,
  Monograma,
  SinDato,
  TarjetaFicha,
} from "./ficha"
import { ListaDocumentos } from "./lista-documentos"
import { MapaUbicacion } from "./mapa-ubicacion"
import { PanelPrivado } from "./panel-privado"
import { RejillaResumen, TarjetaResumen } from "./tarjeta-resumen"

function ubicacion(
  medio: Pick<MedioDetalle, "municipio" | "departamento">
): string {
  return unirUbicacion(medio.municipio, medio.departamento) ?? ""
}

/** "Verificada por AMO" → "verificada por AMO" (solo la inicial: AMO sigue en mayúsculas). */
function inicialMinuscula(texto: string): string {
  return texto.charAt(0).toLocaleLowerCase("es-CO") + texto.slice(1)
}

// ── Cabecera ─────────────────────────────────────────────────────────────────

function AvisoEstadoMedio({ medio }: { medio: MedioDetalle }) {
  switch (medio.estado) {
    case "SUSPENDIDO":
      return (
        <AvisoFicha
          tono="aviso"
          icono={Ban}
          titulo={`Suspendido${medio.suspendidoAt ? ` desde el ${formatearFecha(medio.suspendidoAt)}` : ""}`}
        >
          {medio.motivoEstado ??
            "No ve ofertas ni puede aceptar nuevas mientras siga suspendido."}
        </AvisoFicha>
      )
    case "RECHAZADO":
      return (
        <AvisoFicha
          tono="peligro"
          icono={ShieldX}
          titulo={`Verificación rechazada${medio.rechazadoAt ? ` el ${formatearFecha(medio.rechazadoAt)}` : ""}`}
        >
          {medio.motivoEstado ?? "La verificación no fue aprobada."}
        </AvisoFicha>
      )
    case "PENDIENTE":
      return (
        <AvisoFicha tono="info" icono={Hourglass} titulo="En verificación">
          Aún no ve ofertas: falta que AMO revise sus documentos y verifique sus
          cuentas.
        </AvisoFicha>
      )
    case "VERIFICADO":
      return null
  }
}

export function CabeceraMedio({ medio }: { medio: MedioDetalle }) {
  const lugar = ubicacion(medio)
  return (
    <CabeceraFicha
      volver={{ href: RUTAS_OPERACION.medios, titulo: "Medios" }}
      antetitulo={TIPOS_MEDIO[medio.tipo]}
      titulo={medio.nombre}
      visual={<Monograma texto={medio.nombre} />}
      subtitulo={
        lugar ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin aria-hidden className="size-3.5" />
            {lugar}
          </span>
        ) : null
      }
      distintivos={
        <>
          <InsigniaEstado catalogo={ESTADOS_MEDIO} estado={medio.estado} />
          <span
            title={medio.nivelNombre ?? undefined}
            className="inline-flex h-6 items-center rounded-full border bg-background/60 px-2.5"
          >
            <InsigniaNivel
              nivel={medio.nivel}
              className="text-xs font-medium"
            />
          </span>
          {medio.esDemo ? <InsigniaDemo /> : null}
        </>
      }
      lateral={
        <>
          <span>
            Registrado el{" "}
            <time
              dateTime={medio.creadoAt}
              title={formatearFechaHora(medio.creadoAt)}
            >
              {formatearFecha(medio.creadoAt)}
            </time>
          </span>
          {medio.verificadoAt ? (
            <span>
              Verificado el {formatearFecha(medio.verificadoAt)}
              {medio.verificadoPor ? ` por ${medio.verificadoPor}` : ""}
            </span>
          ) : null}
          <span>
            Actualizado{" "}
            <FechaRelativa valor={medio.actualizadoAt} estilo="medio" />
          </span>
        </>
      }
      aviso={<AvisoEstadoMedio medio={medio} />}
    />
  )
}

// ── Indicadores ──────────────────────────────────────────────────────────────

const TONO_TOPE = {
  sin_tope: "neutro",
  normal: "exito",
  alerta: "aviso",
  bloqueo: "peligro",
} as const

function TarjetaTope({
  tope,
  indice,
}: {
  tope: TopeAnual | null
  indice: number
}) {
  if (!tope) {
    return (
      <TarjetaResumen
        indice={indice}
        titulo="Tope anual"
        valor={null}
        icono={Gauge}
        detalle="Aplica desde el nivel 1 de verificación"
      />
    )
  }
  const { fraccion, situacion } = situacionTope(tope)
  return (
    <TarjetaResumen
      indice={indice}
      titulo={`Tope anual · N${tope.nivel}`}
      valor={tope.consumido}
      formato="copCompacto"
      icono={Gauge}
      tono={TONO_TOPE[situacion]}
      alerta={situacion === "alerta" || situacion === "bloqueo"}
      detalle={
        tope.tope === null
          ? "Sin tope anual en este nivel"
          : `${formatearPorcentaje(fraccion, 0)} de ${formatearCOPCompacto(tope.tope)} consumido${
              situacion === "bloqueo" ? " · no puede aceptar más" : ""
            }`
      }
    >
      {tope.tope === null ? null : (
        <BarraLlenado
          fraccion={fraccion}
          tono={situacion === "normal" ? "primario" : TONO_TOPE[situacion]}
        />
      )}
    </TarjetaResumen>
  )
}

function TarjetaCumplimiento({
  medio,
  nMinimo,
  indice,
}: {
  medio: MedioDetalle
  nMinimo: number
  indice: number
}) {
  const muestraPequena =
    medio.nCumplimiento > 0 && medio.nCumplimiento < nMinimo
  return (
    <TarjetaResumen
      indice={indice}
      titulo="Cumplimiento"
      valor={medio.tasaCumplimiento}
      formato="porcentaje"
      decimales={0}
      icono={Target}
      tono={
        medio.tasaCumplimiento !== null && medio.tasaCumplimiento < 0.8
          ? "aviso"
          : "exito"
      }
      detalle={
        medio.nCumplimiento === 0
          ? "Sin asignaciones con desenlace"
          : muestraPequena
            ? `Muestra pequeña: ${formatearNumero(medio.nCumplimiento)} de ${formatearNumero(nMinimo)} mínimas`
            : `Sobre ${contar(medio.nCumplimiento, "asignación", "asignaciones")} con desenlace`
      }
    />
  )
}

function TarjetaCalificacion({
  medio,
  indice,
}: {
  medio: MedioDetalle
  indice: number
}) {
  return (
    <TarjetaResumen
      indice={indice}
      titulo="Calificación"
      valor={medio.calificacion}
      decimales={1}
      icono={Star}
      detalle={
        medio.calificacion === null
          ? "Aún sin calificaciones"
          : `De 5, en ${contar(medio.publicacionesVerificadas, "publicación", "publicaciones")}`
      }
    />
  )
}

export function IndicadoresConAsignaciones({
  medio,
  indicadores,
  tope,
  nMinimo,
}: {
  medio: MedioDetalle
  indicadores: IndicadoresAsignaciones
  tope: TopeAnual | null
  nMinimo: number
}) {
  const abiertas =
    indicadores.porGrupo.en_curso +
    indicadores.porGrupo.por_revisar +
    indicadores.porGrupo.en_disputa
  return (
    <RejillaResumen etiqueta="Indicadores del medio" columnas={5}>
      <TarjetaResumen
        indice={0}
        titulo="GMV verificado"
        valor={indicadores.gmvVerificado}
        formato="copCompacto"
        icono={CircleDollarSign}
        tono="exito"
        detalle={
          indicadores.ticketPromedio === null
            ? "Sin asignaciones cumplidas"
            : `Ticket promedio ${formatearCOP(indicadores.ticketPromedio)}`
        }
      />
      <TarjetaResumen
        indice={1}
        titulo="Comprometido vigente"
        valor={indicadores.gmvComprometido}
        formato="copCompacto"
        icono={Megaphone}
        tono="info"
        detalle={
          abiertas > 0
            ? `${formatearNumero(abiertas)} ${abiertas === 1 ? "asignación abierta" : "asignaciones abiertas"}`
            : "Sin asignaciones abiertas"
        }
      />
      <TarjetaCumplimiento medio={medio} nMinimo={nMinimo} indice={2} />
      <TarjetaCalificacion medio={medio} indice={3} />
      <TarjetaTope tope={tope} indice={4} />
    </RejillaResumen>
  )
}

function IndicadoresSinAsignaciones({
  medio,
  cuentas,
  nMinimo,
}: {
  medio: MedioDetalle
  cuentas: readonly CuentaSocialDetalle[]
  nMinimo: number
}) {
  const verificadas = cuentas.filter((cuenta) => cuenta.verificada)
  const seguidores = verificadas.reduce(
    (suma, cuenta) => suma + (cuenta.seguidores ?? 0),
    0
  )
  return (
    <RejillaResumen etiqueta="Indicadores del medio" columnas={5}>
      <TarjetaResumen
        indice={0}
        titulo="Cuentas verificadas"
        valor={verificadas.length}
        icono={BadgeCheck}
        tono="exito"
        detalle={`De ${contar(cuentas.length, "registrada", "registradas")}`}
      />
      <TarjetaResumen
        indice={1}
        titulo="Seguidores verificados"
        valor={seguidores}
        formato="compacto"
        icono={UsersRound}
        detalle="Suma de sus cuentas verificadas"
      />
      <TarjetaCumplimiento medio={medio} nMinimo={nMinimo} indice={2} />
      <TarjetaCalificacion medio={medio} indice={3} />
      <TarjetaResumen
        indice={4}
        titulo="Publicaciones verificadas"
        valor={medio.publicacionesVerificadas}
        icono={RadioTower}
        detalle="Con evidencia y métricas aprobadas"
      />
    </RejillaResumen>
  )
}

/**
 * Indicadores del medio. Con `asignaciones.ver` suma su actividad comercial
 * (GMV, comprometido y consumo del tope anual); si no, solo su perfil.
 */
export async function SeccionIndicadoresMedio({
  medio,
  cuentas,
  verAsignaciones,
}: {
  medio: MedioDetalle
  cuentas: readonly CuentaSocialDetalle[]
  verAsignaciones: boolean
}) {
  const { nMinimoCumplimiento } = await configuracionOperacion()
  if (!verAsignaciones) {
    return (
      <IndicadoresSinAsignaciones
        medio={medio}
        cuentas={cuentas}
        nMinimo={nMinimoCumplimiento}
      />
    )
  }
  const { indicadores } = await actividadAsignaciones("medio", medio.id)
  const tope = await topeAnualDelMedio(medio, indicadores.consumidoAnio)
  return (
    <IndicadoresConAsignaciones
      medio={medio}
      indicadores={indicadores}
      tope={tope}
      nMinimo={nMinimoCumplimiento}
    />
  )
}

// ── Resumen ──────────────────────────────────────────────────────────────────

function AudienciaPorPais({
  audiencia,
}: {
  audiencia: PerfilAudiencia["audiencia"]
}) {
  if (audiencia.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        El medio aún no declara la distribución de su audiencia por país.
      </p>
    )
  }
  const declarado = audiencia.reduce((suma, pais) => suma + pais.porcentaje, 0)
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5">
        {audiencia.map((pais) => (
          <li
            key={pais.iso2}
            className="flex flex-col gap-1"
            title={pais.fuente}
          >
            <span className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="text-base leading-none">
                  {banderaEmoji(pais.iso2)}
                </span>
                <span className="truncate">{pais.nombre}</span>
              </span>
              <span className="font-medium cifras">
                {formatearPorcentaje(pais.porcentaje / 100, 1)}
              </span>
            </span>
            <BarraLlenado fraccion={pais.porcentaje / 100} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Fuente:{" "}
        {[
          ...new Set(audiencia.map((pais) => inicialMinuscula(pais.fuente))),
        ].join(" y ")}
        .
        {declarado < 99.5
          ? ` El ${formatearPorcentaje((100 - declarado) / 100, 1)} restante no está declarado.`
          : ""}
      </p>
    </div>
  )
}

function Pertinencia({
  pertinencia,
}: {
  pertinencia: PerfilAudiencia["pertinencia"]
}) {
  if (pertinencia.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin pertinencia geográfica clasificada: su multiplicador geográfico es
        neutro (1 ×) en todos los municipios.
      </p>
    )
  }
  return (
    <ul className="flex flex-col divide-y">
      {pertinencia.map((municipio) => (
        <li
          key={municipio.municipioCodigo}
          className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm">{municipio.municipio}</span>
            {municipio.notas ? (
              <span className="text-xs text-pretty text-muted-foreground">
                {municipio.notas}
              </span>
            ) : null}
          </span>
          <span
            className={cn(
              "shrink-0 text-sm font-medium cifras",
              municipio.multiplicador > 1 && "text-success",
              municipio.multiplicador < 1 && "text-warning"
            )}
          >
            {formatearMultiplicador(municipio.multiplicador)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Pestaña Resumen: ubicación y pertinencia, perfil, audiencia y contacto. */
export async function SeccionResumenMedio({
  medio,
  verSensibles,
}: {
  medio: MedioDetalle
  verSensibles: boolean
}) {
  return (
    <ResumenMedio
      medio={medio}
      perfil={await perfilAudiencia(medio.id)}
      verSensibles={verSensibles}
    />
  )
}

export function ResumenMedio({
  medio,
  perfil,
  verSensibles,
}: {
  medio: MedioDetalle
  perfil: PerfilAudiencia
  verSensibles: boolean
}) {
  const departamentosPertinentes = new Set(
    perfil.pertinencia.map((municipio) => municipio.departamentoCodigo)
  )
  const lugar = ubicacion(medio)

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="flex flex-col gap-4 lg:col-span-3">
        <TarjetaFicha titulo="Perfil del medio" icono={RadioTower}>
          <ListaDatos
            datos={[
              { etiqueta: "Tipo", valor: TIPOS_MEDIO[medio.tipo] },
              {
                etiqueta: "Nivel de verificación",
                valor: etiquetaNivel(medio.nivel),
                ayuda: medio.nivelNombre,
              },
              {
                etiqueta: "Categorías",
                valor:
                  perfil.categorias.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5">
                      {perfil.categorias.map((categoria) => (
                        <span
                          key={categoria}
                          className="rounded-full border bg-muted/50 px-2 py-0.5 text-xs"
                        >
                          {categoria}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <SinDato>Sin categorías</SinDato>
                  ),
              },
              {
                etiqueta: "Calificación promedio",
                valor:
                  medio.calificacion === null ? (
                    <SinDato>Sin calificaciones</SinDato>
                  ) : (
                    <span className="inline-flex items-center gap-1 cifras">
                      <Star
                        aria-hidden
                        className="size-3.5 fill-warning text-warning"
                      />
                      {formatearCalificacion(medio.calificacion)} de 5
                    </span>
                  ),
              },
              {
                etiqueta: "Descripción de la audiencia",
                valor: medio.descripcionAudiencia ?? (
                  <SinDato>No la ha descrito</SinDato>
                ),
              },
              {
                etiqueta: "Verificación",
                valor: medio.verificadoAt ? (
                  <FechaRelativa valor={medio.verificadoAt} estilo="medio" />
                ) : (
                  <SinDato>Aún no verificado</SinDato>
                ),
                ayuda: medio.verificadoPor
                  ? `Por ${medio.verificadoPor}`
                  : null,
              },
            ]}
          />
        </TarjetaFicha>

        <TarjetaFicha
          titulo="Audiencia por país"
          icono={Globe2}
          descripcion="Distribución de sus seguidores según el medio o la verificación de AMO."
        >
          <AudienciaPorPais audiencia={perfil.audiencia} />
        </TarjetaFicha>
      </div>

      <div className="flex flex-col gap-4 lg:col-span-2">
        <TarjetaFicha
          titulo="Ubicación y pertinencia"
          icono={MapPin}
          descripcion={lugar || "Sin municipio registrado"}
        >
          <div className="flex flex-col gap-4">
            <div className="mx-auto w-full max-w-64">
              <MapaUbicacion
                departamento={medio.departamentoCodigo}
                pertinencia={departamentosPertinentes}
                lon={medio.lon}
                lat={medio.lat}
                etiqueta={`Ubicación de ${medio.nombre}: ${lugar || "sin municipio"}`}
              />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                Multiplicador geográfico por municipio
              </h3>
              <Pertinencia pertinencia={perfil.pertinencia} />
            </div>
          </div>
        </TarjetaFicha>

        {verSensibles ? (
          <PanelPrivado
            entidad="medio"
            id={medio.id}
            grupo="contacto"
            nombre={medio.nombre}
          />
        ) : null}
      </div>
    </div>
  )
}

// ── Documentos y pagos ───────────────────────────────────────────────────────

/** Documentos (metadatos) con `medios.verificar` + `datos_sensibles.ver`; pago con lo segundo. */
export async function SeccionDocumentosMedio({
  medio,
  verDocumentos,
  verSensibles,
}: {
  medio: MedioDetalle
  verDocumentos: boolean
  verSensibles: boolean
}) {
  const documentos = verDocumentos ? await documentosDelMedio(medio.id) : null
  if (!documentos && !verSensibles) {
    return (
      <EstadoVacio
        titulo="Sin acceso a los documentos"
        descripcion="Los documentos y los datos de pago requieren permiso de verificación y de datos sensibles."
      />
    )
  }
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {documentos ? (
        <div className={cn(verSensibles ? "lg:col-span-3" : "lg:col-span-5")}>
          <ListaDocumentos
            documentos={documentos}
            descripcion="Solo metadatos de la revisión: los archivos se consultan en el flujo de verificación."
          />
        </div>
      ) : null}
      {verSensibles ? (
        <div className={cn(documentos ? "lg:col-span-2" : "lg:col-span-5")}>
          <PanelPrivado
            entidad="medio"
            id={medio.id}
            grupo="pago"
            nombre={medio.nombre}
          />
        </div>
      ) : null}
    </div>
  )
}
