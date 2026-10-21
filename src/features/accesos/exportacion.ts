/**
 * Filas del archivo de exportación del registro de accesos (módulo puro).
 * La IP llega ya enmascarada según el permiso de quien exporta.
 */
import type { DatosExportacion } from "@/components/data-table/exportar"

import {
  ETIQUETAS_DISPOSITIVO,
  etiquetaMotivoSospecha,
  RESULTADOS,
} from "./catalogo"
import type { AccesoFila } from "./tipos"

export function datosExportacionAccesos(
  filas: readonly AccesoFila[]
): DatosExportacion {
  return {
    titulo: "Accesos AMO",
    columnas: [
      { titulo: "Fecha", formato: "fechaHora" },
      { titulo: "Usuario" },
      { titulo: "Correo" },
      { titulo: "Rol" },
      { titulo: "Evento" },
      { titulo: "Resultado" },
      { titulo: "País" },
      { titulo: "Código de país" },
      { titulo: "Ciudad" },
      { titulo: "Región" },
      { titulo: "Dispositivo" },
      { titulo: "Navegador" },
      { titulo: "Sistema operativo" },
      { titulo: "IP" },
      { titulo: "Nivel de autenticación" },
      { titulo: "Sospechoso" },
      { titulo: "Motivo de sospecha" },
    ],
    filas: filas.map((fila) => [
      new Date(fila.at),
      fila.usuario?.nombre ?? "Sin cuenta",
      fila.usuario?.email ?? null,
      fila.usuario?.rol ?? null,
      fila.etiquetaEvento,
      RESULTADOS[fila.resultado].etiqueta,
      fila.pais,
      fila.paisIso2,
      fila.ciudad,
      fila.region,
      fila.dispositivo ? ETIQUETAS_DISPOSITIVO[fila.dispositivo] : null,
      fila.navegador,
      fila.sistemaOperativo,
      fila.ip,
      fila.aal === "aal2"
        ? "Dos pasos"
        : fila.aal === "aal1"
          ? "Contraseña"
          : null,
      fila.sospechoso,
      fila.sospechoso ? etiquetaMotivoSospecha(fila.motivoSospecha) : null,
    ]),
  }
}
