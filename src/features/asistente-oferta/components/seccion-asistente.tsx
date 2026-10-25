import {
  ArrowLeft,
  Building2,
  FileLock2,
  MegaphoneOff,
  MessageSquareWarning,
} from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"

import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { TituloMiga } from "@/components/layout/titulo-miga"
import { AvisoModoAsistido } from "@/features/campanas/components/aviso-modo-asistido"
import { situacionEmpresa } from "@/features/campanas/queries"
import {
  esAsistido,
  GESTION_PROPIA,
  type ModoGestion,
  modoAsistido,
  rutasGestion,
} from "@/features/campanas/rutas-gestion"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { formatearFechaHora } from "@/lib/format"

import { CAMPANA_SIN_OFERTAS, SIN_EMPRESA } from "../errores"
import { valoresDesdeOfertas, valoresNuevos } from "../persistencia"
import {
  campanaParaAsistente,
  catalogoAsistente,
  configuracionAsistente,
  estadoCreativos,
  estadoEmpresa,
  formatosRetirados,
  mediosExcluidos,
  ofertasParaAsistente,
} from "../queries"
import type { EstadoAnunciante, OfertaGuardadaBd } from "../tipos"
import { AsistenteOferta } from "./asistente-oferta"

type PropsSeccion = {
  usuario: UsuarioSesion
  campanaId: string
  /**
   * El equipo AMO por cuenta del anunciante dueño de la campaña (ADM-014):
   * sin empresa propia, con los enlaces de Operación y el aviso visible.
   */
  asistido?: boolean
} & (
  | { modo: "nueva"; ofertaIds: readonly string[] }
  | { modo: "editar"; ofertaId: string }
)

function Encabezado({
  volver,
  antetitulo,
  titulo,
  descripcion,
}: {
  volver: { href: Route; titulo: string }
  antetitulo: string
  titulo: string
  descripcion: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={volver.href}
        className="-ml-1 inline-flex min-h-9 w-fit max-w-full items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:anillo-foco"
      >
        <ArrowLeft aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{volver.titulo}</span>
      </Link>
      <EncabezadoPagina
        antetitulo={antetitulo}
        titulo={titulo}
        descripcion={descripcion}
      />
    </div>
  )
}

function Devolucion({
  oferta,
  asistido,
}: {
  oferta: OfertaGuardadaBd
  asistido: boolean
}) {
  return (
    <section
      aria-labelledby="asistente-devolucion"
      className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/8 p-4 sm:p-5"
    >
      <MessageSquareWarning
        aria-hidden
        className="mt-0.5 size-5 shrink-0 text-warning"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <h2
          id="asistente-devolucion"
          className="text-[0.9375rem] font-semibold"
        >
          {asistido ? "La moderación pidió ajustes" : "AMO te pidió ajustes"}
        </h2>
        {oferta.comentarioModeracion ? (
          <p className="text-sm break-words whitespace-pre-line">
            «{oferta.comentarioModeracion}»
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {oferta.devueltaAt
            ? `Devuelta el ${formatearFechaHora(oferta.devueltaAt)}. `
            : ""}
          {asistido
            ? "Corrige lo que piden y vuelve a enviarla a revisión al final del asistente."
            : "Corrige lo que te piden y vuelve a enviarla a revisión al final del asistente."}
        </p>
      </div>
    </section>
  )
}

/**
 * La empresa por cuya cuenta actúa el equipo AMO (ADM-014): su nombre y su
 * verificación si quien actúa puede verla (`anunciantes.ver`); si no, se
 * nombra genéricamente y no se anticipa el bloqueo (decide la BD).
 */
async function gestionAsistida(
  anuncianteId: string
): Promise<{ gestion: ModoGestion; estado: EstadoAnunciante | null }> {
  const empresa = await situacionEmpresa(anuncianteId)
  return {
    gestion: modoAsistido(anuncianteId, empresa?.nombre),
    estado: empresa?.estado ?? null,
  }
}

/**
 * Datos y asistente de oferta (servidor). La campaña y las ofertas se leen
 * con la sesión (RLS: solo las de la empresa; en la gestión asistida, las
 * que el rol interno puede ver); lo que no existe o no se ve es un 404, sin
 * revelar si es de otra empresa.
 */
export async function SeccionAsistente(props: PropsSeccion) {
  const { usuario, campanaId } = props
  const asistido = props.asistido === true
  const anuncianteId = asistido ? null : usuario.anuncianteId
  if (!asistido && !anuncianteId) {
    return (
      <EstadoVacio
        icono={Building2}
        titulo="Tu cuenta no tiene empresa"
        descripcion={SIN_EMPRESA}
      />
    )
  }
  const ofertaEditada = props.modo === "editar" ? props.ofertaId : undefined
  const [campana, catalogo, configuracion, estadoPropio] = await Promise.all([
    campanaParaAsistente(campanaId, ofertaEditada),
    catalogoAsistente(),
    configuracionAsistente(),
    anuncianteId ? estadoEmpresa(anuncianteId) : null,
  ])
  if (!campana) notFound()
  const { gestion, estado } = asistido
    ? await gestionAsistida(campana.anuncianteId)
    : { gestion: GESTION_PROPIA, estado: estadoPropio }
  const rutas = rutasGestion(gestion)
  const aviso = esAsistido(gestion) ? (
    <AvisoModoAsistido
      anunciante={gestion.anunciante}
      estado={estado}
      enlace={estado ? rutas.empresa : null}
    />
  ) : null

  const ofertas = await ofertasParaAsistente(
    campanaId,
    props.modo === "editar" ? [props.ofertaId] : props.ofertaIds
  )
  const volverCampana = {
    href: rutas.ofertasCampana(campana.id),
    titulo: campana.nombre,
  }

  if (props.modo === "editar") {
    const [oferta] = ofertas
    if (!oferta) notFound()
    if (!["BORRADOR", "DEVUELTA"].includes(oferta.estado)) {
      return (
        <>
          <TituloMiga titulo="Editar oferta" />
          <Encabezado
            volver={{
              href: rutas.oferta(campana.id, oferta.ofertaId),
              titulo: oferta.titulo,
            }}
            antetitulo={campana.nombre}
            titulo="Editar oferta"
            descripcion={oferta.titulo}
          />
          <EstadoVacio
            icono={FileLock2}
            titulo="Esta oferta ya no se edita"
            descripcion={
              oferta.estado === "EN_REVISION"
                ? asistido
                  ? "Está en revisión. Si hay que cambiarla, retírala de revisión desde su ficha y vuelve a editarla."
                  : "Está en revisión. Si necesitas cambiarla, retírala de revisión desde su ficha y vuelve a editarla."
                : "Ya pasó por la moderación. Para cambiar su contenido, carga una nueva versión del paquete creativo desde su ficha."
            }
          >
            <EnlaceBoton href={rutas.oferta(campana.id, oferta.ofertaId)}>
              Ver la oferta
            </EnlaceBoton>
          </EstadoVacio>
        </>
      )
    }
  } else if (
    ofertas.length === 0 &&
    !["BORRADOR", "ACTIVA"].includes(campana.estado)
  ) {
    return (
      <>
        <TituloMiga titulo="Nueva oferta" />
        <Encabezado
          volver={{ href: rutas.campana(campana.id), titulo: campana.nombre }}
          antetitulo={campana.nombre}
          titulo="Nueva oferta"
          descripcion="Crea una oferta de pauta para esta campaña."
        />
        <EstadoVacio
          icono={MegaphoneOff}
          titulo="Esta campaña no admite ofertas nuevas"
          descripcion={CAMPANA_SIN_OFERTAS}
        >
          <EnlaceBoton href={rutas.campana(campana.id)} variant="outline">
            Volver a la campaña
          </EnlaceBoton>
        </EstadoVacio>
      </>
    )
  }

  // Formatos que AMO retiró después de crear la oferta: el asistente los
  // nombra y explica cómo seguir (no los ofrece).
  const sinCatalogo = ofertas
    .map((oferta) => oferta.formatoId)
    .filter((formatoId) => !catalogo.formatos.some((f) => f.id === formatoId))
  const [excluidos, creativos, retirados] = await Promise.all([
    mediosExcluidos(ofertas[0]?.mediosExcluidos ?? []),
    estadoCreativos(ofertas, catalogo.formatos),
    formatosRetirados(sinCatalogo),
  ])
  const ahora = new Date()
  const valores =
    valoresDesdeOfertas({ ofertas, catalogo, excluidos }) ??
    valoresNuevos({ campana, configuracion, ahora })
  const devuelta = ofertas.find((oferta) => oferta.estado === "DEVUELTA")
  const titulo = props.modo === "nueva" ? "Nueva oferta" : "Editar oferta"

  return (
    <>
      <TituloMiga titulo={titulo} />
      <Encabezado
        volver={
          props.modo === "editar" && ofertas[0]
            ? {
                href: rutas.oferta(campana.id, ofertas[0].ofertaId),
                titulo: ofertas[0].titulo,
              }
            : volverCampana
        }
        antetitulo={campana.nombre}
        titulo={titulo}
        descripcion={
          props.modo === "nueva"
            ? asistido
              ? "Define qué se publica, a quién le llega, cuándo y cuánto invierte la empresa. El precio de cada medio lo calcula AMO."
              : "Define qué se publica, a quién le llega, cuándo y cuánto inviertes. El precio de cada medio lo calcula AMO."
            : "Ajusta la oferta y vuelve a enviarla a revisión."
        }
      />
      {aviso}
      {devuelta ? <Devolucion oferta={devuelta} asistido={asistido} /> : null}
      <AsistenteOferta
        key={ofertas.map((oferta) => oferta.ofertaId).join() || "nueva"}
        modo={props.modo}
        campana={campana}
        empresaVerificada={
          estado === "VERIFICADO" || (asistido && estado === null)
        }
        catalogo={catalogo}
        formatosRetirados={retirados}
        configuracion={configuracion}
        valoresIniciales={valores}
        ofertasIniciales={ofertas.map(
          ({ ofertaId, formatoId, estado: e, actualizadaAt }) => ({
            ofertaId,
            formatoId,
            estado: e,
            actualizadaAt,
          })
        )}
        creativosIniciales={creativos}
        ahora={ahora.toISOString()}
        gestion={gestion}
      />
    </>
  )
}
