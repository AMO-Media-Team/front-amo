/**
 * Datos de prueba del asistente de oferta (solo para Vitest): catálogo con la
 * matriz real de plataformas y formatos, configuración de la migración y
 * valores de una oferta completa.
 */
import { CONFIGURACION_POR_DEFECTO } from "./configuracion"
import { requisitosDeFormato } from "./formatos"
import type { ValoresOferta } from "./schemas"
import type {
  CampanaAsistente,
  CatalogoAsistente,
  ConfiguracionAsistente,
} from "./tipos"

export const IDS = {
  igReel: "01a16525-06d7-78ea-9a80-38d5c4b6941a",
  igHistoria: "01a16525-06d7-7806-b1c0-f1971835d1a9",
  igPost: "01a16525-06d7-753f-9a18-3d5373ba3aca",
  ttVideo: "01a16525-06d7-7e0f-b872-615b609df3c4",
  f1: "01a16525-06d6-7561-a2b0-c9c0c170233b",
  f2: "01a16525-06d6-7a62-8210-53a84c657170",
  f3: "01a16525-06d6-773d-92f1-ab54a3a50a05",
  categoria: "01a16525-0678-792b-81f2-099900ff0b41",
  campana: "01a16540-0000-7000-8000-000000000001",
  ofertaA: "01a16540-0000-7000-8000-0000000000a1",
  ofertaB: "01a16540-0000-7000-8000-0000000000b1",
  medio: "01a16525-57f2-70b1-9099-844a1b2195e9",
} as const

export const CATALOGO: CatalogoAsistente = {
  formatos: [
    {
      id: IDS.igPost,
      plataforma: "INSTAGRAM",
      clave: "POST_FEED",
      nombre: "Post de feed",
      orden: 1,
      requisitos: requisitosDeFormato({
        mime: ["image/jpeg", "video/mp4"],
        peso_max_mb: 50,
        relaciones_aspecto: ["1:1", "4:5", "1.91:1"],
      }),
    },
    {
      id: IDS.igReel,
      plataforma: "INSTAGRAM",
      clave: "REEL",
      nombre: "Reel",
      orden: 3,
      requisitos: requisitosDeFormato({
        mime: ["video/mp4", "video/quicktime"],
        peso_max_mb: 50,
        duracion_max_s: 90,
        relaciones_aspecto: ["9:16"],
      }),
    },
    {
      id: IDS.igHistoria,
      plataforma: "INSTAGRAM",
      clave: "HISTORIA",
      nombre: "Historia",
      orden: 4,
      requisitos: requisitosDeFormato({
        mime: ["image/jpeg", "video/mp4"],
        duracion_max_s: 60,
        relaciones_aspecto: ["9:16"],
      }),
    },
    {
      id: IDS.ttVideo,
      plataforma: "TIKTOK",
      clave: "VIDEO",
      nombre: "Video",
      orden: 9,
      requisitos: requisitosDeFormato({
        mime: ["video/mp4"],
        duracion_max_s: 600,
        relaciones_aspecto: ["9:16"],
      }),
    },
  ],
  franjas: [
    {
      id: IDS.f1,
      clave: "F1",
      nombre: "30.000 – 60.000",
      seguidoresMin: 30_000,
      seguidoresMax: 60_000,
    },
    {
      id: IDS.f2,
      clave: "F2",
      nombre: "60.001 – 120.000",
      seguidoresMin: 60_001,
      seguidoresMax: 120_000,
    },
    {
      id: IDS.f3,
      clave: "F3",
      nombre: "Más de 120.000",
      seguidoresMin: 120_001,
      seguidoresMax: null,
    },
  ],
  categorias: [{ id: IDS.categoria, nombre: "Deportes" }],
}

export const CONFIGURACION: ConfiguracionAsistente = CONFIGURACION_POR_DEFECTO

export const CAMPANA: CampanaAsistente = {
  id: IDS.campana,
  nombre: "Lanzamiento jugos",
  anuncianteId: "0192f3a4-5b6c-7d8e-9f01-00000000a0a1",
  estado: "ACTIVA",
  fechaInicio: "2026-11-01",
  fechaFin: "2026-11-30",
  presupuestoTotal: 50_000_000,
  disponible: 20_000_000,
}

/** Oferta de un reel completa y válida (antes del 1 de noviembre de 2026). */
export function valoresCompletos(
  parcial: Partial<{
    [G in keyof ValoresOferta]: Partial<ValoresOferta[G]>
  }> = {}
): ValoresOferta {
  return {
    que: {
      formatoIds: [IDS.igReel],
      titulo: "Lanzamiento de la nueva línea",
      publicacionesPorMedio: "1",
      ...parcial.que,
    },
    quien: {
      segmentacion: { departamentos: ["05"], municipios: [] },
      categorias: [],
      seguidoresMinimos: "",
      mediosExcluidos: [],
      ...parcial.quien,
    },
    cuando: {
      ventanaInicio: "2026-11-05T13:00:00.000Z",
      ventanaFin: "2026-11-20T04:59:00.000Z",
      fechaLimite: "2026-11-04T23:00:00.000Z",
      permanenciaDias: "7",
      cortes: ["H24", "H72", "D7"],
      exclusividad: false,
      exclusividadDias: "",
      ...parcial.cuando,
    },
    cuanto: {
      formatos: [
        {
          formatoId: IDS.igReel,
          presupuestoMaximo: "5.000.000",
          cupos: [
            { franjaId: IDS.f1, cantidad: "5" },
            { franjaId: IDS.f2, cantidad: "" },
            { franjaId: IDS.f3, cantidad: "" },
          ],
        },
      ],
      topePorcentaje: "15",
      ...parcial.cuanto,
    },
    envio: { instrucciones: "", restricciones: "", ...parcial.envio },
  }
}
