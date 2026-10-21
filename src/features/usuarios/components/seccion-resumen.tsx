import { CalendarClock, IdCard } from "lucide-react"

import {
  formatearFecha,
  formatearFechaHora,
  formatearRelativo,
} from "@/lib/format"

import {
  ESTADOS_CUENTA,
  nombreVisible,
  TIPOS_ROL_ETIQUETA,
} from "../presentacion"
import type { UsuarioDetalle } from "../tipos"
import { InsigniaEstado, InsigniaRol } from "./distintivos"
import { ListaDatos, SinDato, TarjetaFicha } from "./tarjeta-ficha"

function FechaRelativa({
  valor,
  vacio = "—",
}: {
  valor: string | null
  vacio?: string
}) {
  if (!valor) return <SinDato>{vacio}</SinDato>
  return (
    <time dateTime={valor} title={formatearFechaHora(valor)}>
      {formatearFecha(valor, "largo")}
      <span className="text-muted-foreground">
        {" "}
        · {formatearRelativo(valor)}
      </span>
    </time>
  )
}

/** Pestaña Resumen: datos de la cuenta y su historia básica. */
export function SeccionResumen({
  usuario,
  organizacion,
}: {
  usuario: UsuarioDetalle
  /** Nombre del anunciante o medio, si el rol lo exige. */
  organizacion: string | null
}) {
  const tieneOrganizacion =
    usuario.anuncianteId !== null || usuario.medioId !== null

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <TarjetaFicha
        titulo="Datos de la cuenta"
        icono={IdCard}
        className="lg:col-span-3"
      >
        <ListaDatos
          datos={[
            {
              etiqueta: "Nombre",
              valor: usuario.nombre ?? <SinDato>Sin nombre</SinDato>,
            },
            { etiqueta: "Correo", valor: usuario.email },
            {
              etiqueta: "Celular",
              valor: usuario.celular ? (
                <a
                  href={`tel:${usuario.celular.replaceAll(" ", "")}`}
                  className="hover:underline"
                >
                  {usuario.celular}
                </a>
              ) : (
                <SinDato>No registrado</SinDato>
              ),
            },
            {
              etiqueta: "Rol",
              valor: <InsigniaRol rol={usuario.rol} />,
              ayuda: usuario.rol
                ? TIPOS_ROL_ETIQUETA[usuario.rol.tipo]
                : undefined,
            },
            ...(tieneOrganizacion
              ? [
                  {
                    etiqueta: usuario.anuncianteId ? "Anunciante" : "Medio",
                    valor: organizacion ?? <SinDato>No disponible</SinDato>,
                  },
                ]
              : []),
            {
              etiqueta: "Estado",
              valor: <InsigniaEstado estado={usuario.estado} />,
              ayuda:
                usuario.motivoEstado ??
                ESTADOS_CUENTA[usuario.estado].descripcion,
            },
          ]}
        />
      </TarjetaFicha>

      <TarjetaFicha
        titulo="Historia"
        icono={CalendarClock}
        className="lg:col-span-2"
      >
        <ListaDatos
          className="sm:grid-cols-1"
          datos={[
            {
              etiqueta: "Último acceso",
              valor: (
                <FechaRelativa
                  valor={usuario.ultimoAccesoAt}
                  vacio="Nunca ha ingresado"
                />
              ),
            },
            {
              etiqueta: "Activación",
              valor: (
                <FechaRelativa valor={usuario.activadoAt} vacio="Pendiente" />
              ),
            },
            {
              etiqueta: "Creación",
              valor: <FechaRelativa valor={usuario.creadoAt} />,
              ayuda: usuario.invitadoPor
                ? `Invitado por ${nombreVisible(usuario.invitadoPor)}`
                : undefined,
            },
            {
              etiqueta: "Última modificación",
              valor: <FechaRelativa valor={usuario.actualizadoAt} />,
            },
          ]}
        />
      </TarjetaFicha>
    </div>
  )
}
