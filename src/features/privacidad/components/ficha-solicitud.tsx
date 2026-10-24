import {
  CalendarClock,
  CircleCheck,
  CircleSlash,
  Eraser,
  FileText,
  Hourglass,
  Inbox,
  type LucideIcon,
  MessageSquareWarning,
  SearchCheck,
  Siren,
  UserRound,
} from "lucide-react"
import type { Route } from "next"

import {
  AvisoEstadoFicha,
  CabeceraFicha,
  EnlaceFicha,
  FechaRelativa,
  ListaDatos,
  SinDato,
  TarjetaFicha,
} from "@/features/operacion/components/ficha"
import type { Tono } from "@/features/operacion/estados"
import { TIPOS_ROL_ETIQUETA } from "@/features/usuarios/presentacion"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { formatearFecha } from "@/lib/format"

import {
  accionesEquipo,
  claseDe,
  DECISIONES,
  esSemaforo,
  formatearDia,
  listaDatos,
  PLAZOS_LEGALES,
  PRESENTACION_SEMAFORO,
  situacionPlazo,
  textoRadicado,
  textoVencimiento,
  TIPOS,
} from "../presentacion"
import { RUTA_PRIVACIDAD_ADMIN } from "../rutas"
import type { SolicitudInterna } from "../tipos"
import { AccionesSolicitud } from "./acciones-solicitud"
import { BotonSoporte } from "./boton-soporte"
import { InsigniaEstadoSolicitud, InsigniaPlazo } from "./estado-solicitud"
import { ID_ESTADO_SOLICITUD } from "./foco"
import { LineaTiempoSolicitud } from "./linea-tiempo-solicitud"
import { PanelSupresion } from "./panel-supresion"
import { VerDatosTitular } from "./ver-datos-titular"

interface Aviso {
  tono: Tono
  icono: LucideIcon
  titulo: string
  detalle: string
}

/** El aviso del estado: qué toca hacer ahora y con qué urgencia. */
function avisoDe(solicitud: SolicitudInterna, hoy: string): Aviso {
  const situacion = situacionPlazo(solicitud, hoy)
  if (solicitud.supresionEjecutadaAt) {
    return {
      tono: "neutro",
      icono: Eraser,
      titulo: "Supresión ejecutada",
      detalle:
        "La cuenta del titular se borró. La solicitud se conserva como evidencia del cumplimiento.",
    }
  }
  switch (solicitud.estado) {
    case "RESPONDIDA":
      return {
        tono: "exito",
        icono: CircleCheck,
        titulo: solicitud.decision
          ? `Respondida: ${DECISIONES[solicitud.decision].etiqueta.toLocaleLowerCase("es-CO")}`
          : "Respondida",
        detalle:
          solicitud.decision !== "NO_PROCEDE" &&
          (solicitud.tipo === "SUPRESION" || solicitud.tipo === "REVOCATORIA")
            ? "Falta ejecutar la supresión de los datos del titular."
            : "El titular recibió la respuesta.",
      }
    case "DESISTIDA":
      return {
        tono: "neutro",
        icono: CircleSlash,
        titulo: "Desistida",
        detalle:
          "El titular desistió o no respondió el requerimiento en el plazo legal.",
      }
    case "REQUIERE_INFORMACION":
      return {
        tono: "aviso",
        icono: MessageSquareWarning,
        titulo: "Esperando al titular",
        detalle:
          "Se le pidió información. El plazo legal vuelve a contar desde el día en que responda.",
      }
    default: {
      const semaforo = esSemaforo(situacion)
        ? PRESENTACION_SEMAFORO[situacion]
        : null
      const icono =
        situacion === "vencida" || situacion === "hoy"
          ? Siren
          : solicitud.estado === "RADICADA"
            ? Hourglass
            : SearchCheck
      return {
        tono: semaforo?.tono ?? "info",
        icono,
        titulo: `${solicitud.estado === "RADICADA" ? "Radicada" : "En trámite"} · ${textoVencimiento(solicitud.plazoVence, hoy)}`,
        detalle: semaforo?.descripcion ?? "Respóndela dentro del plazo legal.",
      }
    }
  }
}

function Parrafo({ children }: { children: string }) {
  return (
    <p className="text-sm text-pretty break-words whitespace-pre-line">
      {children}
    </p>
  )
}

/**
 * Ficha interna de una solicitud de titular (CTA-007): titular y
 * organización, la solicitud, el requerimiento y la prórroga, la respuesta
 * con su soporte, la supresión y la línea de tiempo; a la derecha, las
 * acciones del equipo, «Ver datos del titular» y la supresión.
 */
export function FichaSolicitud({
  solicitud,
  usuario,
  hoy,
}: {
  solicitud: SolicitudInterna
  usuario: UsuarioSesion
  /** Día de Bogotá del servidor ('YYYY-MM-DD'). */
  hoy: string
}) {
  const { titular } = solicitud
  const actorEsTitular = titular.perfilId === usuario.id
  const acciones = accionesEquipo(solicitud, {
    hoy,
    actorEsTitular,
    conCuenta: titular.perfilId !== null,
  })
  const aviso = avisoDe(solicitud, hoy)
  const tipo = TIPOS[solicitud.tipo]
  const plazo = PLAZOS_LEGALES[claseDe(solicitud.tipo)]
  const veMedios = tieneAlgunPermiso(usuario, ["medios.ver"])
  const veAnunciantes = tieneAlgunPermiso(usuario, ["anunciantes.ver"])
  const veUsuarios = tieneAlgunPermiso(usuario, ["usuarios.ver"])
  const admiteSupresion =
    solicitud.tipo === "SUPRESION" || solicitud.tipo === "REVOCATORIA"

  return (
    <>
      <CabeceraFicha
        volver={{ href: RUTA_PRIVACIDAD_ADMIN, titulo: "Datos personales" }}
        antetitulo={`Solicitud ${textoRadicado(solicitud.numero)}`}
        titulo={tipo.etiqueta}
        subtitulo={
          titular.nombre ?? titular.correo ?? "Titular sin cuenta (suprimido)"
        }
        distintivos={
          <>
            <InsigniaEstadoSolicitud
              estado={solicitud.estado}
              perspectiva="interno"
            />
            <InsigniaPlazo solicitud={solicitud} hoy={hoy} />
          </>
        }
        lateral={
          <>
            <span>
              Recibida: <FechaRelativa valor={solicitud.recibidaAt} />
            </span>
            <span>
              Vence:{" "}
              <time dateTime={solicitud.plazoVence}>
                {formatearDia(solicitud.plazoVence, "largo")}
              </time>
            </span>
          </>
        }
        aviso={
          <AvisoEstadoFicha
            id={ID_ESTADO_SOLICITUD}
            tono={aviso.tono}
            icono={aviso.icono}
            titulo={aviso.titulo}
          >
            {aviso.detalle}
          </AvisoEstadoFicha>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <TarjetaFicha
            titulo="Solicitud"
            icono={FileText}
            descripcion={`${tipo.clase === "consulta" ? "Consulta" : "Reclamo"}: hasta ${plazo.dias} días hábiles, prorrogables ${plazo.prorroga} (${plazo.norma}).`}
          >
            <div className="flex flex-col gap-4">
              <Parrafo>{solicitud.descripcion}</Parrafo>
              <ListaDatos
                datos={[
                  {
                    etiqueta: "Datos afectados",
                    valor:
                      solicitud.datosAfectados.length > 0 ? (
                        listaDatos(solicitud.datosAfectados)
                      ) : (
                        <SinDato>Sin indicar</SinDato>
                      ),
                  },
                  {
                    etiqueta: "Tomada por",
                    valor: solicitud.tramitadaPor ?? (
                      <SinDato>Nadie todavía</SinDato>
                    ),
                  },
                ]}
              />
            </div>
          </TarjetaFicha>

          {solicitud.requerimiento ? (
            <TarjetaFicha
              titulo="Información pedida al titular"
              icono={MessageSquareWarning}
              descripcion={
                solicitud.requeridaAt
                  ? `Pedida el ${formatearFecha(solicitud.requeridaAt)}.`
                  : undefined
              }
            >
              <div className="flex flex-col gap-3">
                <Parrafo>{solicitud.requerimiento}</Parrafo>
                {solicitud.informacionAportada ? (
                  <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Respuesta del titular
                    </p>
                    <Parrafo>{solicitud.informacionAportada}</Parrafo>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    El titular aún no responde.
                  </p>
                )}
              </div>
            </TarjetaFicha>
          ) : null}

          {solicitud.prorrogadaAt && solicitud.prorrogaMotivo ? (
            <TarjetaFicha
              titulo="Prórroga"
              icono={CalendarClock}
              descripcion={`Nuevo vencimiento: ${formatearDia(solicitud.plazoVence, "largo")}.`}
            >
              <Parrafo>{solicitud.prorrogaMotivo}</Parrafo>
            </TarjetaFicha>
          ) : null}

          {solicitud.estado === "RESPONDIDA" && solicitud.respuesta ? (
            <TarjetaFicha
              titulo="Respuesta"
              icono={Inbox}
              descripcion={
                solicitud.decision
                  ? `${DECISIONES[solicitud.decision].etiqueta}${solicitud.respondidaPor ? ` · ${solicitud.respondidaPor}` : ""}`
                  : undefined
              }
              acciones={
                solicitud.tieneSoporte ? (
                  <BotonSoporte
                    solicitudId={solicitud.id}
                    numero={solicitud.numero}
                    perspectiva="interno"
                  />
                ) : null
              }
            >
              <Parrafo>{solicitud.respuesta}</Parrafo>
            </TarjetaFicha>
          ) : null}

          <LineaTiempoSolicitud linea={solicitud.lineaTiempo} />
        </div>

        <aside
          aria-label="Titular y acciones"
          className="flex min-w-0 flex-col gap-6"
        >
          <TarjetaFicha titulo="Titular" icono={UserRound}>
            <ListaDatos
              className="sm:grid-cols-1"
              datos={[
                {
                  etiqueta: "Nombre",
                  valor: titular.perfilId ? (
                    <EnlaceFicha
                      href={
                        `/administracion/usuarios/${titular.perfilId}` as Route
                      }
                      permitido={veUsuarios}
                    >
                      {titular.nombre ?? "Sin nombre"}
                    </EnlaceFicha>
                  ) : (
                    <SinDato>Cuenta suprimida</SinDato>
                  ),
                },
                {
                  etiqueta: "Correo",
                  valor: titular.correo ?? <SinDato />,
                },
                {
                  etiqueta: "Rol",
                  // «Medio», no «Medio (Medio)»: el tipo solo aclara un rol con otro nombre.
                  valor:
                    titular.rol &&
                    titular.rol !== TIPOS_ROL_ETIQUETA[titular.rolTipo]
                      ? `${titular.rol} (${TIPOS_ROL_ETIQUETA[titular.rolTipo]})`
                      : TIPOS_ROL_ETIQUETA[titular.rolTipo],
                },
                {
                  etiqueta: "Organización",
                  valor: titular.medio ? (
                    <EnlaceFicha
                      href={`/operacion/medios/${titular.medio.id}` as Route}
                      permitido={veMedios}
                    >
                      {titular.medio.nombre}
                    </EnlaceFicha>
                  ) : titular.anunciante ? (
                    <EnlaceFicha
                      href={
                        `/operacion/anunciantes/${titular.anunciante.id}` as Route
                      }
                      permitido={veAnunciantes}
                    >
                      {titular.anunciante.nombre}
                    </EnlaceFicha>
                  ) : (
                    <SinDato>Sin organización</SinDato>
                  ),
                },
              ]}
            />
          </TarjetaFicha>

          <AccionesSolicitud
            solicitud={{
              id: solicitud.id,
              numero: solicitud.numero,
              tipo: solicitud.tipo,
              plazoVence: solicitud.plazoVence,
            }}
            acciones={acciones}
          />

          <VerDatosTitular
            solicitud={{ id: solicitud.id, numero: solicitud.numero }}
            titular={titular.perfilId ? (titular.nombre ?? "") : null}
          />

          {admiteSupresion ? (
            <PanelSupresion
              solicitud={{ id: solicitud.id, numero: solicitud.numero }}
              puedeSimular={acciones.simularSupresion}
              puedeEjecutar={acciones.ejecutarSupresion}
              ejecutada={
                solicitud.supresionEjecutadaAt
                  ? {
                      at: solicitud.supresionEjecutadaAt,
                      resultado: solicitud.supresionResultado,
                    }
                  : null
              }
              actorEsTitular={actorEsTitular}
            />
          ) : null}
        </aside>
      </div>
    </>
  )
}
