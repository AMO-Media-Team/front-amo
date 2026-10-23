import {
  BadgeCheck,
  FileWarning,
  Lock,
  type LucideIcon,
  RadioTower,
  Upload,
} from "lucide-react"
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { TituloMiga } from "@/components/layout/titulo-miga"
import {
  CabeceraEjecucion,
  NavegacionCortes,
  NavegacionPublicaciones,
} from "@/features/ejecucion/components/cabecera-ejecucion"
import { CorteEnEspera } from "@/features/ejecucion/components/corte-en-espera"
import { EstadoEjecucion } from "@/features/ejecucion/components/estado-ejecucion"
import {
  FormularioMetricas,
  type ModoMetricas,
} from "@/features/ejecucion/components/formulario-metricas"
import { OtrosCortes } from "@/features/ejecucion/components/otros-cortes"
import { ResumenMetrica } from "@/features/ejecucion/components/resumen-metrica"
import { cortesDeLaOferta, tituloCorte } from "@/features/ejecucion/cortes"
import { MENSAJES_EJECUCION } from "@/features/ejecucion/errores"
import {
  admiteGuardar,
  type SituacionMetricas,
  situacionMetricas,
} from "@/features/ejecucion/metricas"
import { textoSituacionMetricas } from "@/features/ejecucion/presentacion"
import { contextoMetricas } from "@/features/ejecucion/queries"
import { rutaMetricaPersonalizada } from "@/features/ejecucion/rutas"
import type {
  ContextoMetricas,
  Corte,
  EstadoValidacion,
  MetricaEjecucion,
} from "@/features/ejecucion/tipos"
import {
  rutaAsignacionMedio,
  rutaEvidencia,
  rutaMetricas,
} from "@/features/mis-campanas/rutas"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso } from "@/lib/auth/dal"
import { Constants } from "@/types/database.types"

export const metadata: Metadata = { title: "Métricas de la publicación" }

const CORTES: readonly string[] = Constants.public.Enums.corte_metrica

function comoCorte(valor: string | string[] | undefined): Corte | null {
  const texto = Array.isArray(valor) ? valor[0] : valor
  return texto && CORTES.includes(texto) ? (texto as Corte) : null
}

function comoId(valor: string | string[] | undefined): string | null {
  const texto = Array.isArray(valor) ? valor[0] : valor
  return texto && UUID.test(texto) ? texto : null
}

const ICONOS: Partial<Record<SituacionMetricas["tipo"], LucideIcon>> = {
  "corte-no-pedido": FileWarning,
  "sin-evidencia": Upload,
  "evidencia-rechazada": Upload,
  "faltan-evidencias": Upload,
  aprobada: BadgeCheck,
  cerrada: Lock,
}

function modoDe(situacion: SituacionMetricas): ModoMetricas {
  if (situacion.tipo === "corregir") return "corregir"
  return situacion.tipo === "en-revision" ? "revision" : "cargar"
}

/** Ruta de un corte ya cargado (los personalizados, por id). */
function rutaDeMetrica(
  asignacionId: string,
  numero: number,
  metrica: MetricaEjecucion
) {
  return metrica.corte === "PERSONALIZADO"
    ? rutaMetricaPersonalizada(asignacionId, numero, metrica.id)
    : rutaMetricas(asignacionId, numero, metrica.corte)
}

/** Acción que sigue cuando el corte no se puede cargar ni corregir. */
function AccionSiguiente({
  contexto,
  situacion,
}: {
  contexto: ContextoMetricas
  situacion: SituacionMetricas
}) {
  const { asignacion, numero } = contexto
  switch (situacion.tipo) {
    case "sin-evidencia":
    case "evidencia-rechazada":
      return (
        <EnlaceBoton href={rutaEvidencia(asignacion.id, numero)}>
          <Upload data-icon="inline-start" aria-hidden />
          Ir a la evidencia
        </EnlaceBoton>
      )
    case "faltan-evidencias":
      return (
        <EnlaceBoton href={rutaEvidencia(asignacion.id)}>
          <Upload data-icon="inline-start" aria-hidden />
          Completar la evidencia
        </EnlaceBoton>
      )
    case "corte-no-pedido": {
      const primero = cortesDeLaOferta(asignacion.cortesRequeridos)[0]
      return (
        <EnlaceBoton
          href={
            primero
              ? rutaMetricas(asignacion.id, numero, primero)
              : rutaMetricaPersonalizada(asignacion.id, numero)
          }
        >
          Ver los cortes de la oferta
        </EnlaceBoton>
      )
    }
    default:
      return (
        <EnlaceBoton
          href={rutaAsignacionMedio(asignacion.id)}
          variant="outline"
        >
          Volver a la campaña
        </EnlaceBoton>
      )
  }
}

/**
 * Métricas de un corte (MED-014, INT-001, INT-005): las cifras de la
 * plataforma con la captura del panel, la coherencia con los demás cortes en
 * pantalla, el corte bloqueado hasta su hora, la corrección de uno pendiente
 * o rechazado y el corte personalizado (`?metrica=` para corregir uno ya
 * cargado). `?numero=N&corte=X`.
 */
export default async function PaginaMetricas({
  params,
  searchParams,
}: PageProps<"/mis-campanas/[id]/metricas">) {
  const usuario = await requerirPermiso("asignaciones.ejecutar")
  const { id } = await params
  if (!UUID.test(id)) notFound()
  if (!usuario.medioId) {
    return (
      <ContenedorPagina ancho="estrecho">
        <EstadoVacio
          icono={RadioTower}
          titulo="Tu usuario no está vinculado a un medio"
          descripcion={MENSAJES_EJECUCION.sinMedio}
        />
      </ContenedorPagina>
    )
  }
  const consulta = await searchParams
  const corte = comoCorte(consulta.corte)
  if (!corte) {
    // Sin corte (o uno que no existe): el primero que pide la oferta.
    const base = await contextoMetricas(
      id,
      consulta.numero,
      "PERSONALIZADO",
      null
    )
    if (!base) notFound()
    const primero = cortesDeLaOferta(base.asignacion.cortesRequeridos)[0]
    redirect(
      primero
        ? rutaMetricas(id, base.numero, primero)
        : rutaMetricaPersonalizada(id, base.numero)
    )
  }
  const metricaId = corte === "PERSONALIZADO" ? comoId(consulta.metrica) : null
  const contexto = await contextoMetricas(id, consulta.numero, corte, metricaId)
  if (!contexto) notFound()
  if (metricaId && !contexto.metrica) notFound()

  const ahora = new Date().getTime()
  const { asignacion, numero, publicacion, publicaciones, metrica } = contexto
  const situacion = situacionMetricas(
    asignacion,
    publicacion,
    corte,
    metrica,
    new Date(ahora)
  )
  const varias = asignacion.publicaciones > 1
  const titulo = `${tituloCorte(corte)}${varias ? ` · publicación ${numero}` : ""}`
  const texto = textoSituacionMetricas(situacion, corte)
  const estadosCortes = new Map<Corte, EstadoValidacion>(
    [metrica, ...contexto.otros]
      .filter(
        (m): m is MetricaEjecucion => m !== null && m.corte !== "PERSONALIZADO"
      )
      .map((m) => [m.corte, m.estado])
  )

  return (
    <ContenedorPagina ancho="estrecho" className="gap-5">
      <TituloMiga titulo={titulo} />
      <CabeceraEjecucion
        asignacion={asignacion}
        titulo={titulo}
        descripcion={
          corte === "PERSONALIZADO"
            ? "Reporta las cifras de un periodo que elijas. No reemplaza los cortes que pide la oferta."
            : `${asignacion.ofertaTitulo}. Escribe las cifras que muestra el panel de estadísticas y adjunta la captura.`
        }
      />
      <NavegacionPublicaciones
        total={asignacion.publicaciones}
        actual={numero}
        estados={new Map(publicaciones.map((p) => [p.numero, p.estado]))}
        ruta={(otro) =>
          corte === "PERSONALIZADO"
            ? rutaMetricaPersonalizada(asignacion.id, otro)
            : rutaMetricas(asignacion.id, otro, corte)
        }
      />
      {publicacion ? (
        <NavegacionCortes
          cortes={cortesDeLaOferta(asignacion.cortesRequeridos)}
          actual={corte}
          estados={estadosCortes}
          ruta={(otro) =>
            otro === "PERSONALIZADO"
              ? rutaMetricaPersonalizada(asignacion.id, numero)
              : rutaMetricas(asignacion.id, numero, otro)
          }
        />
      ) : null}

      {situacion.tipo === "bloqueada" && texto ? (
        <CorteEnEspera
          desde={situacion.desde}
          texto={texto}
          ahoraServidor={ahora}
        />
      ) : publicacion && admiteGuardar(situacion) ? (
        <FormularioMetricas
          // Otro corte u otra publicación es otro formulario.
          key={`${numero}-${corte}-${metrica?.id ?? "nuevo"}`}
          asignacion={asignacion}
          numero={numero}
          publicacion={publicacion}
          corte={corte}
          metrica={metrica}
          otros={contexto.otros}
          toleranciaCortes={contexto.toleranciaCortes}
          plazoCargaHoras={contexto.plazoCargaHoras}
          modo={modoDe(situacion)}
          ahoraServidor={ahora}
        />
      ) : (
        <>
          {texto ? (
            <EstadoEjecucion
              texto={texto}
              icono={ICONOS[situacion.tipo] ?? Lock}
            >
              <AccionSiguiente contexto={contexto} situacion={situacion} />
            </EstadoEjecucion>
          ) : null}
          {metrica ? (
            <ResumenMetrica
              metrica={metrica}
              plataforma={asignacion.plataforma}
              formato={asignacion.formatoClave}
              titulo={tituloCorte(corte)}
            />
          ) : null}
        </>
      )}

      {publicacion ? (
        <OtrosCortes
          metricas={contexto.otros}
          plataforma={asignacion.plataforma}
          ruta={(otra) => rutaDeMetrica(asignacion.id, numero, otra)}
        />
      ) : null}
    </ContenedorPagina>
  )
}
