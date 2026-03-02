export const ISLANDS = [
  { value: "tenerife", label: "Tenerife" },
  { value: "gran-canaria", label: "Gran Canaria" },
  { value: "lanzarote", label: "Lanzarote" },
  { value: "fuerteventura", label: "Fuerteventura" },
  { value: "la-palma", label: "La Palma" },
  { value: "la-gomera", label: "La Gomera" },
  { value: "el-hierro", label: "El Hierro" },
] as const;

export type Island = (typeof ISLANDS)[number]["value"];
