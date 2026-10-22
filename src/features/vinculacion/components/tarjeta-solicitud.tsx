import {
  ExternalLink,
  Hourglass,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  TriangleAlert,
  UserRound,
  Users,
} from "lucide-react"
import type { Route } from "next"
import type { ReactNode } from "react"

import {
  InsigniaEstado,
  MarcaPlataforma,
} from "@/features/operacion/components/distintivos"
import { EnlaceFicha, Monograma } from "@/features/operacion/components/ficha"
import { ESTADOS_MEDIO, TIPOS_MEDIO } from "@/features/operacion/estados"
import {
  formatearFechaHora,
  formatearNumero,
  formatearRelativo,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { arroba, urlPerfil } from "../cuentas"
import {
  enlaceTelefono,
  enlaceWhatsapp,
  ESTADOS_SOLICITUD,
  lecturaSeguidores,
  textoSeguidores,
} from "../presentacion"
import type {
  CuentaDeclarada,
  MedioCoincidente,
  SolicitudVinculacion,
} from "../tipos"

function rutaMedio(id: string): Route {
  return `/operacion/medios/${id}` as Route
}

function Fecha({ valor, prefijo }: { valor: string; prefijo: string }) {
  return (
    <span title={formatearFechaHora(valor)}>
      {prefijo} <time dateTime={valor}>{formatearRelativo(valor)}</time>
    </span>
  )
}

function Subtitulo({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </h4>
  )
}

function FilaCuenta({ cuenta }: { cuenta: CuentaDeclarada }) {
  return (
    <li className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
      <a
        href={urlPerfil(cuenta.plataforma, cuenta.usuario)}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex min-w-0 items-center gap-2 rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:anillo-foco"
      >
        {/* La marca ya nombra la red para el lector («Instagram @medio»). */}
        <MarcaPlataforma plataforma={cuenta.plataforma} />{" "}
        <span className="min-w-0 break-all">{arroba(cuenta.usuario)}</span>
        <ExternalLink
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground"
        />
        <span className="sr-only"> (se abre en otra pestaña)</span>
      </a>
      <span
        className={cn(
          "text-xs cifras",
          cuenta.seguidores === null
            ? "text-muted-foreground"
            : "text-foreground"
        )}
        title={
          cuenta.seguidores === null
            ? undefined
            : `${formatearNumero(cuenta.seguidores)} seguidores declarados`
        }
      >
        {textoSeguidores(cuenta.seguidores)}
      </span>
    </li>
  )
}

function AvisoSeguidores({
  cuentas,
  umbral,
}: {
  cuentas: readonly CuentaDeclarada[]
  umbral: number
}) {
  const lectura = lecturaSeguidores(cuentas, umbral)
  if (lectura.tipo === "alcanza") return null
  return (
    <p className="flex items-start gap-1.5 text-xs text-pretty text-warning">
      <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
      {lectura.tipo === "bajo"
        ? `Ninguna cuenta declarada llega a ${formatearNumero(umbral)} seguidores.`
        : "No declaró seguidores: revísalos en sus perfiles."}
    </p>
  )
}

function Contacto({ solicitud }: { solicitud: SolicitudVinculacion }) {
  const whatsapp = enlaceWhatsapp(solicitud.celular)
  const enlace =
    "inline-flex min-h-9 min-w-0 items-center gap-2 rounded-sm text-sm underline-offset-4 hover:underline focus-visible:anillo-foco [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
  return (
    <ul className="flex flex-col">
      <li className="flex min-h-9 items-center gap-2 text-sm font-medium">
        <UserRound
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 break-words">{solicitud.contactoNombre}</span>
      </li>
      <li>
        <a href={`mailto:${solicitud.email}`} className={enlace}>
          <Mail aria-hidden />
          <span className="min-w-0 break-all">{solicitud.email}</span>
        </a>
      </li>
      {solicitud.celular ? (
        <li className="flex flex-wrap items-center gap-x-4">
          <a href={enlaceTelefono(solicitud.celular)} className={enlace}>
            <Phone aria-hidden />
            <span className="cifras">{solicitud.celular}</span>
          </a>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={enlace}
            >
              <MessageCircle aria-hidden />
              WhatsApp
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          ) : null}
        </li>
      ) : null}
    </ul>
  )
}

function Coincidencias({
  coincidencias,
  verMedios,
}: {
  coincidencias: readonly MedioCoincidente[]
  verMedios: boolean
}) {
  if (coincidencias.length === 0) return null
  const desdeSolicitud = coincidencias.some((medio) => medio.desdeSolicitud)
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/6 p-3">
      <p className="flex items-start gap-2 text-sm font-medium">
        <TriangleAlert
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-warning"
        />
        {desdeSolicitud
          ? "El medio ya quedó registrado en un intento anterior: al invitar se usará ese registro."
          : coincidencias.length === 1
            ? "Ya hay un medio registrado con este nombre. Revisa si es el mismo antes de invitar."
            : `Ya hay ${coincidencias.length} medios registrados con este nombre. Revisa si alguno es el mismo antes de invitar.`}
      </p>
      <ul className="flex flex-col gap-1.5 pl-6">
        {coincidencias.map((medio) => (
          <li
            key={medio.id}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
          >
            <EnlaceFicha
              href={rutaMedio(medio.id)}
              permitido={verMedios}
              className="font-medium"
            >
              {medio.nombre}
            </EnlaceFicha>
            <span className="text-xs text-muted-foreground">
              {medio.municipio}
            </span>
            <InsigniaEstado catalogo={ESTADOS_MEDIO} estado={medio.estado} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Solicitud pendiente: el medio, lo que declaró (redes y seguidores), cómo
 * contactar a la persona y, si ya existe un medio con el mismo nombre, el
 * aviso para no duplicarlo. Las acciones llegan como `acciones`.
 */
export function TarjetaSolicitud({
  solicitud,
  umbral,
  verMedios,
  acciones,
}: {
  solicitud: SolicitudVinculacion
  umbral: number
  verMedios: boolean
  acciones: ReactNode
}) {
  const idTitulo = `solicitud-${solicitud.id}`
  return (
    <article
      aria-labelledby={idTitulo}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <header className="flex items-start gap-3">
        <Monograma
          texto={solicitud.nombreMedio}
          className="size-11 rounded-xl text-sm sm:size-12 sm:text-base"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h3
            id={idTitulo}
            className="text-[0.9375rem] font-semibold break-words"
          >
            {solicitud.nombreMedio}
          </h3>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
            <span>
              {solicitud.tipo
                ? TIPOS_MEDIO[solicitud.tipo]
                : "Tipo sin indicar"}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden />
              {solicitud.ubicacion}
            </span>
            <span className="inline-flex items-center gap-1">
              <Hourglass aria-hidden />
              <Fecha valor={solicitud.recibidaAt} prefijo="Recibida" />
            </span>
          </p>
        </div>
      </header>

      {/* Bloques sin nombre accesible (no son regiones): con decenas de
          tarjetas, el lector de pantalla repetiría «Redes» y «Contacto» en su
          lista de regiones. Los subtítulos ya los separan. */}
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <div className="flex flex-col gap-1.5">
          <Subtitulo>
            <span className="inline-flex items-center gap-1.5">
              <Users aria-hidden className="size-3.5" />
              Redes que declaró
            </span>
          </Subtitulo>
          <ul className="flex flex-col">
            {solicitud.cuentas.map((cuenta) => (
              <FilaCuenta
                key={`${cuenta.plataforma}:${cuenta.usuario}`}
                cuenta={cuenta}
              />
            ))}
          </ul>
          <AvisoSeguidores cuentas={solicitud.cuentas} umbral={umbral} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Subtitulo>Contacto</Subtitulo>
          <Contacto solicitud={solicitud} />
        </div>
      </div>

      {solicitud.mensaje ? (
        <figure className="flex flex-col gap-1.5">
          <figcaption>
            <Subtitulo>Su mensaje</Subtitulo>
          </figcaption>
          <blockquote className="border-l-2 border-primary/40 pl-3 text-sm leading-relaxed break-words whitespace-pre-line text-foreground/90">
            {solicitud.mensaje}
          </blockquote>
        </figure>
      ) : null}

      <Coincidencias
        coincidencias={solicitud.coincidencias}
        verMedios={verMedios}
      />

      <footer className="border-t pt-4">{acciones}</footer>
    </article>
  )
}

/** Solicitud ya atendida (referencia): quién, cuándo y con qué resultado. */
export function FilaAtendida({
  solicitud,
  verMedios,
}: {
  solicitud: SolicitudVinculacion
  verMedios: boolean
}) {
  const { resolucion } = solicitud
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border bg-card/60 px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 text-sm font-medium break-words">
          {solicitud.nombreMedio}
          <span className="font-normal text-muted-foreground">
            {" "}
            · {solicitud.ubicacion}
          </span>
        </span>
        <InsigniaEstado
          catalogo={ESTADOS_SOLICITUD}
          estado={solicitud.estado}
        />
      </div>
      {resolucion ? (
        <p className="text-xs text-muted-foreground">
          <Fecha valor={resolucion.at} prefijo="Atendida" />
          {resolucion.por ? ` por ${resolucion.por}` : null}
        </p>
      ) : null}
      {resolucion?.motivo ? (
        <p className="text-sm break-words text-foreground/90">
          <span className="text-muted-foreground">Motivo: </span>
          {resolucion.motivo}
        </p>
      ) : null}
      {resolucion?.medio ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Medio: </span>
          <EnlaceFicha
            href={rutaMedio(resolucion.medio.id)}
            permitido={verMedios}
            className="font-medium"
          >
            {resolucion.medio.nombre}
          </EnlaceFicha>
        </p>
      ) : null}
    </li>
  )
}
