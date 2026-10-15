/**
 * Filas del archivo de exportación de la bitácora (módulo puro). Se arma en
 * el servidor con los mismos textos que ve la persona y la IP ya enmascarada
 * según su permiso; el navegador solo genera el CSV o el Excel.
 */
import type { DatosExportacion } from "@/components/data-table/exportar"

import { ORIGENES } from "./catalogo"
import type { CampoDiff, ValorPresentado } from "./diferencias"
import type { EventoBitacora } from "./tipos"

function texto(valor: ValorPresentado | null): string {
  return valor ? valor.texto : "—"
}

/** "Nombre: Vacío → Ana; Rol: Operaciones → Finanzas". */
export function describirCambios(campos: readonly CampoDiff[]): string {
  return campos
    .map((campo) => {
      if (campo.antes && campo.despues) {
        return `${campo.etiqueta}: ${texto(campo.antes)} → ${texto(campo.despues)}`
      }
      return `${campo.etiqueta}: ${texto(campo.antes ?? campo.despues)}`
    })
    .join("; ")
}

function ubicacion(evento: EventoBitacora): string | null {
  const partes = [evento.ubicacion.ciudad, evento.ubicacion.pais].filter(
    Boolean
  )
  return partes.length > 0 ? partes.join(", ") : null
}

export function datosExportacionBitacora(
  eventos: readonly EventoBitacora[]
): DatosExportacion {
  return {
    titulo: "Bitácora AMO",
    columnas: [
      { titulo: "Fecha", formato: "fechaHora" },
      { titulo: "Evento", formato: "numero" },
      { titulo: "Acción" },
      { titulo: "Descripción" },
      { titulo: "Resumen" },
      { titulo: "Entidad" },
      { titulo: "ID de la entidad" },
      { titulo: "Actor" },
      { titulo: "Correo del actor" },
      { titulo: "Rol" },
      { titulo: "Origen" },
      { titulo: "Estado anterior" },
      { titulo: "Estado nuevo" },
      { titulo: "Motivo" },
      { titulo: "Cambios" },
      { titulo: "IP" },
      { titulo: "Ubicación" },
      { titulo: "Navegador" },
      { titulo: "Sistema operativo" },
    ],
    filas: eventos.map((evento) => [
      new Date(evento.at),
      evento.id,
      evento.etiquetaAccion,
      evento.titulo,
      evento.resumen,
      evento.nombreEntidad,
      evento.entidadId,
      evento.actor.nombre,
      evento.actor.correo,
      evento.actor.rol,
      ORIGENES[evento.origen].etiqueta,
      evento.estadoAnterior,
      evento.estadoNuevo,
      evento.motivo,
      describirCambios(evento.cambios.campos),
      evento.ubicacion.ip,
      ubicacion(evento),
      evento.ubicacion.navegador,
      evento.ubicacion.sistemaOperativo,
    ]),
  }
}
