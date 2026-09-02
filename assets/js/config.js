window.VIAMINA_CONFIG = {
  SUPABASE_URL: "https://eaglsvjoggiaqqbrslpt.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_9zQGwMDl4ZBywoAHtSGdDg_qOp9Ex-F",
  UNIT_CODE: "BUS-12",
  DEFAULT_ROUTE: "Ruta Azul",
  ROUTES: [
    { name: "Ruta Azul", color: "#1d4ed8", file: "./rutaazul.geojson" },
    { name: "Ruta Amarillo", color: "#f59e0b", file: "./rutaamarillo.geojson" }
  ],
  DRIVER_CREDENTIALS: {
    "BUS-12": "1234"
  }
};

// Nota: la clave secreta del proyecto NO debe exponerse en el frontend.
// Mantén la secret key solo en entorno server-side si la necesitas para escrituras sensibles.
