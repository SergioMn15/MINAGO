window.VIAMINA_CONFIG = {
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyA4YsVoJ9p2xnv--MpwTIbpljGD9jfTqsw",
    authDomain: "minago-9e510.firebaseapp.com",
    databaseURL: "https://minago-9e510-default-rtdb.firebaseio.com",
    projectId: "minago-9e510",
    storageBucket: "minago-9e510.firebasestorage.app",
    messagingSenderId: "728800753797",
    appId: "1:728800753797:web:68ed5bc24e992e64a051ec"
  },
  UNIT_CODE: "BUS-12",
  DEFAULT_ROUTE: "Ruta Azul",
  ROUTES: [
    { name: "Ruta Azul", color: "#1d4ed8", file: "./rutaazul.geojson" },
    { name: "Ruta Amarillo", color: "#f59e0b", file: "./rutaamarillo.geojson" }
  ]
};

// Nota: la clave secreta del proyecto NO debe exponerse en el frontend.
// Mantén la secret key solo en entorno server-side si la necesitas para escrituras sensibles.
