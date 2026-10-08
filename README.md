# 🚌 VíaMinatitlán (MINAGO) - Sistema de Monitoreo de Transporte Público en Tiempo Real

VíaMinatitlán es una **Progressive Web App (PWA)** móvil-first diseñada para el seguimiento y ubicación en tiempo real de autobuses/camiones de transporte público en la ruta a Minatitlán.

El sistema opera bajo una arquitectura **Publicador-Suscriptor** basada en **Firebase Realtime Database & Firebase Auth**:
- **Conductor (Publicador):** Autenticado mediante Firebase Auth, emite coordenadas GPS, velocidad, rumbo, sentido de circulación ("Minatitlán ➔ Colima" o "Colima ➔ Minatitlán") y ruta asignada desde su cabina de navegación web.
- **Usuario Público (Suscriptor):** Escucha y visualiza **múltiples autobuses simultáneos** en vivo sobre el mapa interactivo con Leaflet.js sin necesidad de recargar la página.

---

## 🏗️ Arquitectura y Stack Tecnológico

### Frontend
- **HTML5 / CSS3 / JavaScript Vanilla:** Interfaz responsive y ligera para móviles.
- **Leaflet.js & MapLibre GL JS:** Renderizado de mapas 2D interactivos para el público y cabina de navegación 3D para el conductor.
- **GeoJSON:** Rutas trazadas oficiales (`rutaamarillo.geojson`, `rutaazul.geojson`).
- **PWA:** Preparado para instalación móvil y Service Worker.

### Backend y Base de Datos (Firebase)
- **Firebase Authentication:** Inicio de sesión seguro por correo electrónico y contraseña para conductores.
- **Firebase Realtime Database:** Sincronización instantánea de posiciones, rutas y unidades activas en los nodos `unidades/` y `choferes/{uid}/unidad_asignada`.

---

## 📁 Estructura del Proyecto

```text
MINAGO/
├── assets/
│   ├── css/
│   │   └── styles.css             # Estilos globales y responsive de la PWA
│   ├── img/
│   │   └── logo.jpg               # Logotipo e identidad visual
│   └── js/
│       ├── config.js              # Configuración global y credenciales de Firebase
│       ├── driver.js              # Cabina de navegación 3D y transmisión GPS del chofer
│       ├── firebaseClient.js      # Inicialización SDK oficial de Firebase
│       └── map.js                 # Mapa interactivo y suscripción a Firebase Realtime Database
├── camion.webp                    # Marcador/Icono del autobús para Leaflet
├── chofer.html                    # Cabina de control del conductor (transmisión GPS en vivo)
├── index.html                     # Mapa público interactivo en tiempo real
├── login_chofer.html              # Pantalla de inicio de sesión para conductores (Firebase Auth)
├── login.html                     # Redirección automática a login_chofer.html
├── panel.html                     # Redirección automática a chofer.html
├── rutaamarillo.geojson           # Trazado GeoJSON de la Ruta Amarillo
├── rutaazul.geojson               # Trazado GeoJSON de la Ruta Azul
├── .gitignore                     # Exclusiones de control de versiones Git
└── README.md                      # Documentación definitiva del proyecto
```

---

## 🚀 Guía de Instalación y Despliegue

### 1. Configuración de Firebase
1. Crea un proyecto en la consola de [Firebase](https://console.firebase.google.com/).
2. Habilita **Firebase Authentication** con el proveedor de **Correo electrónico / Contraseña**.
3. Crea una base de datos en **Firebase Realtime Database**.
4. En la consola de Firebase, agrega los conductores en Authentication y asigna su unidad en la Realtime Database bajo la ruta:
   ```json
   {
     "choferes": {
       "UID_DEL_CHOFER": {
         "unidad_asignada": "BUS-12"
       }
     }
   }
   ```

### 2. Configuración del Frontend
1. Abre `assets/js/config.js` y coloca las credenciales públicas de tu proyecto Firebase:
   ```javascript
   window.VIAMINA_CONFIG = {
     FIREBASE_CONFIG: {
       apiKey: "TU_API_KEY",
       authDomain: "tu-proyecto.firebaseapp.com",
       databaseURL: "https://tu-proyecto-default-rtdb.firebaseio.com",
       projectId: "tu-proyecto",
       storageBucket: "tu-proyecto.firebasestorage.app",
       messagingSenderId: "1234567890",
       appId: "1:1234567890:web:abcdef123456"
     },
     UNIT_CODE: "BUS-12",
     DEFAULT_ROUTE: "Ruta Azul"
   };
   ```

### 3. Despliegue en Hosting (Netlify / Vercel / Firebase Hosting)
- Sube los archivos a tu proveedor de hosting preferido.
- **Requisito obligatorio:** El dominio debe servirse bajo **HTTPS** para habilitar la API de geolocalización GPS (`navigator.geolocation`) en los navegadores móviles de los choferes.

---

## 🔐 Sistema de Autenticación y Flujo del Conductor

### Acceso de Choferes (`login_chofer.html`)
1. El chofer ingresa con su correo electrónico y contraseña registrados en Firebase Auth.
2. Tras la autenticación exitosa, el sistema valida en Firebase Realtime Database (`choferes/{uid}/unidad_asignada`) la unidad asignada (ej. `BUS-12`, `BUS-13`, `BUS-14`).
3. Guarda los datos de sesión en `sessionStorage` y redirige a `chofer.html`.

### Cabina del Conductor (`chofer.html`)
- **Modo 3D / 2D:** Visualización cinemática MapLibre con rumbo, velocímetro digital en KM/H e inclinación de cámara.
- **Iniciar Navegación:** Activa la escucha GPS del dispositivo y transmite `lat`, `lng`, `velocidad`, `rumbo`, `ruta_actual` y `sentido` a Firebase Realtime Database.
- **Invertir Sentido (⇄):** Permite cambiar al instante entre `Minatitlán ➔ Colima` y `Colima ➔ Minatitlán`.
- **Limpieza Automática (OnDisconnect):** Si el chofer cierra el navegador o finaliza el servicio, Firebase remueve la unidad para retirarla inmediatamente del mapa público.

---

## 🗺️ Mapa Público en Tiempo Real (`index.html`)

- Escucha el nodo `unidades/` en Firebase Realtime Database en tiempo real.
- Permite la visualización de **múltiples autobuses simultáneos** (ejemplo: `BUS-12` en Ruta Azul hacia Colima y `BUS-13` en Ruta Amarillo hacia Minatitlán operando al mismo tiempo).
- Marcadores diferenciados por color: **Azul** (`#1d4ed8`) y **Amarillo** (`#f59e0b`).
- Popup informativo con Código de Unidad, Ruta, Sentido de circulación y Hora de última actualización.
- Indicador automático de señal: Descarte o badge de aviso cuando una unidad lleva más de 5 minutos sin emitir señal.

---

## 🎯 Próximos Pasos y Roadmap para Producción

1. **Reglas de Seguridad en Firebase Database (`database.rules.json`):** Restringir escrituras para que cada chofer autenticado únicamente pueda modificar la unidad que tiene asignada.
2. **Cola de Envíos Offline (IndexedDB / LocalStorage):** Almacenar puntos GPS si el celular pierde señal celular momentáneamente y enviarlos en lote al recuperar conexión.
3. **PWA Completa (Service Worker + Manifest):** Habilitar instalación directa en pantalla de inicio para dispositivos Android e iOS.
