/**
 * Códigos que solo existen en el GeoJSON fuente (anteriores a la DIVIPOLA vigente)
 * y el código DIVIPOLA que los reemplaza. El polígono se fusiona con el del destino.
 */
export const CODIGOS_HISTORICOS: Readonly<Record<string, string>> = {
  "27086": "27493", // Belén de Bajirá → Nuevo Belén de Bajirá (código vigente).
  "88000": "88564", // Santa Catalina (isla) → Providencia.
  "94663": "94343", // Mapiripana (antigua área no municipalizada) → Barrancominas.
}

/**
 * Municipios DIVIPOLA sin polígono propio en la fuente: se dibujan con el polígono
 * del municipio del que se segregaron (su territorio sigue dentro de ese polígono).
 */
export const GEOMETRIA_SUSTITUTA: Readonly<Record<string, string>> = {
  "13490": "13600", // Norosí → Río Viejo.
  "19300": "19142", // Guachené → Caloto.
  "23682": "23466", // San José de Uré → Montelíbano.
  "23815": "23670", // Tuchín → San Andrés de Sotavento.
}

/**
 * Nombres de uso común distintos del oficial. Los nombres del GeoJSON fuente que
 * difieren del oficial se agregan solos en el build.
 */
export const ALIAS_MUNICIPIOS: Readonly<Record<string, readonly string[]>> = {
  "05042": ["Santafé de Antioquia", "Santa Fe de Antioquia"],
  "05541": ["El Peñol"],
  "11001": ["Santafé de Bogotá", "Santa Fe de Bogotá"],
  "13001": ["Cartagena"],
  "13468": ["Mompox", "Mompós", "Santa Cruz de Mompós"],
  "15407": ["Villa de Leiva"],
  "23586": ["Purísima"],
  "25843": ["Ubaté"],
  "52001": ["San Juan de Pasto"],
  "52835": ["Tumaco"],
  "54001": ["Cúcuta"],
  "70742": ["Sincé"],
  "70820": ["Tolú"],
  "70823": ["Toluviejo", "Tolú Viejo"],
  "73055": ["Armero Guayabal"],
  "73443": ["Mariquita"],
  "76001": ["Cali"],
  "76111": ["Buga"],
  "88001": ["San Andrés Isla"],
  "94001": ["Puerto Inírida"],
}
