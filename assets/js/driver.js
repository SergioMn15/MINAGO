import { onDisconnect, ref, remove, set } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import { get } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import { app } from './firebaseClient.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

const auth = getAuth(app);

/**
 * MinaGo - Cabina de Navegación GPS 3D para Conductor
 * Motor de navegación profesional estilo Google Maps / Waze
 */

const MINIMUM_SEND_INTERVAL_MS = 10000;
const MINIMUM_DISTANCE_METERS = 25;
const MAXIMUM_ACCURACY_METERS = 150;

// Estado operativo del chofer y navegación
const driverState = {
  unitCode: null,
  previewWatchId: null,
  watchId: null,
  isTracking: false,
  isSending: false,
  lastSentAt: 0,
  lastPosition: null,
  currentBearing: 0,
  currentSpeedKmh: 0,
  is3DMode: true,
  isFollowMode: true,
  isSimulating: false,
  simTimer: null,
  simStepIndex: 0,
  simCoordinates: [],
  tripStartTime: null,
  tripIntervalId: null,
  wakeLockSentinel: null
};

// Referencias a elementos del DOM
const elements = {
  driverMessage: document.getElementById('driverMessage'),
  driverStatusDot: document.getElementById('driverStatusDot'),
  driverStatusText: document.getElementById('driverStatusText'),
  driverLat: document.getElementById('driverLat'),
  driverLng: document.getElementById('driverLng'),
  driverUpdatedAt: document.getElementById('driverUpdatedAt'),
  speedVal: document.getElementById('speedVal'),
  tripTime: document.getElementById('tripTime'),
  accuracyBadge: document.getElementById('accuracyBadge'),
  accuracyVal: document.getElementById('accuracyVal'),
  startRouteBtn: document.getElementById('startRouteBtn'),
  stopRouteBtn: document.getElementById('stopRouteBtn'),
  recenterBtn: document.getElementById('recenterBtn'),
  viewModeBtn: document.getElementById('viewModeBtn'),
  viewModeTag: document.getElementById('viewModeTag'),
  fullscreenBtn: document.getElementById('fullscreenBtn'),
  simulateBtn: document.getElementById('simulateBtn'),
  swapDirectionBtn: document.getElementById('swapDirectionBtn'),
  cockpitRouteTitle: document.getElementById('cockpitRouteTitle'),
  cockpitDirectionText: document.getElementById('cockpitDirectionText'),
  routeBadgeColor: document.getElementById('routeBadgeColor'),
  routeSelect: document.getElementById('routeSelect'),
  directionSelect: document.getElementById('directionSelect'),
  drawerToggleBtn: document.getElementById('drawerToggleBtn'),
  drawerCloseBtn: document.getElementById('drawerCloseBtn'),
  drawerOverlay: document.getElementById('drawerOverlay'),
  driverDrawer: document.getElementById('driverDrawer'),
  logoutBtn: document.getElementById('logoutBtn')
};

let map = null;
let vehicleMarker = null;
let puckBodyEl = null;
let currentRouteGeoJson = null;

// ==========================================
// 1. HELPERS Y UTILIDADES GEOGRÁFICAS
// ==========================================

function setMessage(message) {
  if (elements.driverMessage) elements.driverMessage.textContent = message;
}

function setStatus(live, text = live ? 'Transmitiendo' : 'Sin iniciar') {
  if (elements.driverStatusDot) {
    elements.driverStatusDot.classList.toggle('live', live);
    elements.driverStatusDot.classList.toggle('offline', !live);
  }
  if (elements.driverStatusText) elements.driverStatusText.textContent = text;
}

function distanceInMeters(from, to) {
  const radians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const deltaLat = radians(to.latitude - from.latitude);
  const deltaLng = radians(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 +
            Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) *
            Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function shouldSendPosition(position) {
  if (!driverState.lastPosition) return true;
  return Date.now() - driverState.lastSentAt >= MINIMUM_SEND_INTERVAL_MS ||
         distanceInMeters(driverState.lastPosition, position) >= MINIMUM_DISTANCE_METERS;
}

function getRouteData() {
  return {
    routeName: sessionStorage.getItem('rutaActiva') || window.VIAMINA_CONFIG.DEFAULT_ROUTE || 'Ruta Azul',
    direction: elements.directionSelect?.value || sessionStorage.getItem('sentidoRuta') || 'Minatitlán - Colima'
  };
}

function updateDriverMetrics({ lat, lng, timestamp }) {
  if (elements.driverLat) elements.driverLat.textContent = lat.toFixed(5);
  if (elements.driverLng) elements.driverLng.textContent = lng.toFixed(5);
  if (elements.driverUpdatedAt) {
    elements.driverUpdatedAt.textContent = new Date(timestamp).toLocaleTimeString('es-MX', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
}

// ==========================================
// 2. CRONÓMETRO DE VIAJE & SCREEN WAKE LOCK
// ==========================================

function startTripTimer() {
  driverState.tripStartTime = Date.now();
  if (driverState.tripIntervalId) clearInterval(driverState.tripIntervalId);
  driverState.tripIntervalId = setInterval(() => {
    if (!driverState.tripStartTime) return;
    const elapsedSec = Math.floor((Date.now() - driverState.tripStartTime) / 1000);
    const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const secs = String(elapsedSec % 60).padStart(2, '0');
    if (elements.tripTime) elements.tripTime.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopTripTimer() {
  if (driverState.tripIntervalId) {
    clearInterval(driverState.tripIntervalId);
    driverState.tripIntervalId = null;
  }
  driverState.tripStartTime = null;
  if (elements.tripTime) elements.tripTime.textContent = '00:00';
}

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      driverState.wakeLockSentinel = await navigator.wakeLock.request('screen');
      driverState.wakeLockSentinel.addEventListener('release', () => {
        driverState.wakeLockSentinel = null;
      });
    } catch (err) {
      console.warn('Wake Lock no disponible o denegado:', err);
    }
  }
}

function releaseWakeLock() {
  if (driverState.wakeLockSentinel) {
    driverState.wakeLockSentinel.release().catch(() => {});
    driverState.wakeLockSentinel = null;
  }
}

// ==========================================
// 3. INICIALIZACIÓN DEL MAPA 3D (MAPLIBRE GL)
// ==========================================

function init3DMap() {
  // Vista neutral hasta que el dispositivo entregue una ubicación real.
  const initialCenter = [0, 0];

  map = new maplibregl.Map({
    container: 'driverMap',
    style: {
      version: 8,
      sources: {
        'carto-voyager': {
          type: 'raster',
          tiles: [
            'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
        }
      },
      layers: [
        {
          id: 'carto-voyager-layer',
          type: 'raster',
          source: 'carto-voyager',
          minzoom: 0,
          maxzoom: 20
        }
      ]
    },
    center: initialCenter,
    zoom: 2,
    pitch: 60, // Perspectiva 3D hacia el frente estilo Waze/Maps
    bearing: 0,
    antialias: true,
    attributionControl: false
  });

  // Marcador del vehículo estilo 3D Puck
  const puckContainer = document.createElement('div');
  puckContainer.className = 'nav-puck-container';
  puckContainer.innerHTML = `
    <div class="nav-puck-beam"></div>
    <div class="nav-puck-halo"></div>
    <div class="nav-puck-body" id="puckBody">
      <div class="nav-puck-arrow"></div>
      <img src="camion.webp" alt="Unidad" />
    </div>
  `;
  puckBodyEl = puckContainer.querySelector('#puckBody');

  vehicleMarker = new maplibregl.Marker({
    element: puckContainer,
    anchor: 'center'
  }).setLngLat(initialCenter).addTo(map);
  puckContainer.style.opacity = '0';

  locateDeviceBeforeTracking();

  map.on('load', () => {
    loadRouteLayer();
  });

  // Detección de interacción manual del usuario para salir del modo seguimiento
  const onUserMapMove = () => {
    if (driverState.isFollowMode) {
      driverState.isFollowMode = false;
      if (elements.recenterBtn) elements.recenterBtn.classList.remove('hidden');
    }
  };

  map.on('dragstart', onUserMapMove);
  map.on('rotatestart', onUserMapMove);
  map.on('pitchstart', onUserMapMove);
}

// Carga la ruta activa con trazo de navegación brillante
async function loadRouteLayer() {
  if (!map) return;
  const { routeName } = getRouteData();
  const routeMeta = window.VIAMINA_CONFIG.ROUTES.find(r => r.name === routeName) || window.VIAMINA_CONFIG.ROUTES[0];

  // Actualizar UI del título y badge
  if (elements.cockpitRouteTitle) elements.cockpitRouteTitle.textContent = routeMeta.name;
  if (elements.routeBadgeColor) elements.routeBadgeColor.style.backgroundColor = routeMeta.color;

  try {
    const res = await fetch(routeMeta.file);
    const geoJson = await res.json();
    currentRouteGeoJson = geoJson;

    if (map.getSource('active-route-src')) {
      map.getSource('active-route-src').setData(geoJson);
    } else {
      map.addSource('active-route-src', {
        type: 'geojson',
        data: geoJson
      });

      // Capa de resplandor exterior (glow)
      map.addLayer({
        id: 'active-route-glow',
        type: 'line',
        source: 'active-route-src',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': routeMeta.color,
          'line-width': 10,
          'line-opacity': 0.4,
          'line-blur': 4
        }
      });

      // Capa núcleo nítido (core line)
      map.addLayer({
        id: 'active-route-core',
        type: 'line',
        source: 'active-route-src',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 4.5,
          'line-opacity': 0.95
        }
      });
    }

    // Extraer coordenadas para simulación
    if (geoJson.features && geoJson.features[0]?.geometry?.coordinates) {
      driverState.simCoordinates = geoJson.features[0].geometry.coordinates;
    }
  } catch (err) {
    console.warn('No se pudo cargar el archivo GeoJSON de la ruta:', err);
  }
}

function locateDeviceBeforeTracking() {
  if (!navigator.geolocation) {
    setMessage('Este navegador no soporta geolocalización.');
    return;
  }

  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  if (!window.isSecureContext && !isLocalHost) {
    setMessage('La ubicación requiere HTTPS. Abre la aplicación desde un sitio seguro.');
    return;
  }

  const applyDevicePosition = ({ coords }) => {
    if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return;

    if (Number.isFinite(coords.accuracy) && coords.accuracy > MAXIMUM_ACCURACY_METERS) {
      if (elements.accuracyVal) elements.accuracyVal.textContent = `±${Math.round(coords.accuracy)}m`;
      setMessage(`Esperando GPS más preciso (actual ±${Math.round(coords.accuracy)} m).`);
      return;
    }

    const speedKmh = Number.isFinite(coords.speed) && coords.speed > 0 ? coords.speed * 3.6 : 0;
    const markerElement = vehicleMarker.getElement();
    if (markerElement) markerElement.style.opacity = '1';
    if (elements.accuracyVal) {
      elements.accuracyVal.textContent = Number.isFinite(coords.accuracy)
        ? `±${Math.round(coords.accuracy)}m`
        : 'GPS listo';
    }
    updateVehiclePresentation(coords.longitude, coords.latitude, driverState.currentBearing, speedKmh);
    updateDriverMetrics({
      lat: coords.latitude,
      lng: coords.longitude,
      timestamp: Date.now()
    });
    setMessage(Number.isFinite(coords.accuracy)
      ? `Ubicación encontrada (precisión ±${Math.round(coords.accuracy)} m).`
      : 'Ubicación del dispositivo encontrada.');
  };

  navigator.geolocation.getCurrentPosition(
    applyDevicePosition,
    (error) => {
      console.warn('No se pudo obtener la ubicación inicial del dispositivo:', error.message);
      setMessage(error.code === error.PERMISSION_DENIED
        ? 'Concede permiso de ubicación para mostrar dónde estás.'
        : 'No se pudo obtener la ubicación actual.');
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    }
  );

  driverState.previewWatchId = navigator.geolocation.watchPosition(
    applyDevicePosition,
    (error) => {
      console.warn('No se pudo actualizar la ubicación del dispositivo:', error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000
    }
  );
}

function stopPreviewLocation() {
  if (driverState.previewWatchId !== null) {
    navigator.geolocation.clearWatch(driverState.previewWatchId);
    driverState.previewWatchId = null;
  }
}

// ==========================================
// 4. ACTUALIZACIÓN VISUAL DEL VEHÍCULO Y CÁMARA
// ==========================================

function updateVehiclePresentation(lng, lat, heading, speedKmh) {
  if (!map || !vehicleMarker) return;

  vehicleMarker.setLngLat([lng, lat]);

  // Orientar el marcador hacia el rumbo
  if (puckBodyEl) {
    // Si la cámara rota con el rumbo (3D), el mapa ya está orientado al frente.
    const mapBearing = map.getBearing();
    const visualRotation = heading - mapBearing;
    puckBodyEl.style.transform = `rotate(${visualRotation}deg)`;
  }

  // Actualizar velocímetro digital
  const displaySpeed = Math.max(0, Math.round(speedKmh));
  if (elements.speedVal) elements.speedVal.textContent = displaySpeed;

  // Acompañamiento cinemático de cámara (Follow Mode)
  if (driverState.isFollowMode) {
    if (driverState.is3DMode) {
      map.easeTo({
        center: [lng, lat],
        bearing: heading,
        pitch: 60,
        zoom: 17,
        duration: 950,
        easing: (t) => t
      });
    } else {
      map.easeTo({
        center: [lng, lat],
        bearing: 0,
        pitch: 0,
        zoom: 16,
        duration: 950,
        easing: (t) => t
      });
    }
  }
}

// Re-centrar cámara manualmente
function recenterCamera() {
  driverState.isFollowMode = true;
  if (elements.recenterBtn) elements.recenterBtn.classList.add('hidden');
  const pos = vehicleMarker ? vehicleMarker.getLngLat() : map.getCenter();
  if (driverState.is3DMode) {
    map.flyTo({
      center: pos,
      bearing: driverState.currentBearing,
      pitch: 60,
      zoom: 17,
      duration: 1000
    });
  } else {
    map.flyTo({
      center: pos,
      bearing: 0,
      pitch: 0,
      zoom: 16,
      duration: 1000
    });
  }
}

// Alternar entre modo 3D y 2D
function toggleViewMode() {
  driverState.is3DMode = !driverState.is3DMode;
  if (elements.viewModeTag) elements.viewModeTag.textContent = driverState.is3DMode ? '3D' : '2D';
  recenterCamera();
}

// ==========================================
// 5. ENVÍO DE UBICACIÓN A FIREBASE REALTIME DATABASE
// ==========================================

async function sendLocation({ latitude, longitude, accuracy, speed, heading }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    setMessage('La ubicación recibida no es válida.');
    return;
  }

  // Actualizar indicador de precisión GPS
  if (elements.accuracyVal) {
    elements.accuracyVal.textContent = Number.isFinite(accuracy) ? `±${Math.round(accuracy)}m` : 'GPS listo';
  }

  if (Number.isFinite(accuracy) && accuracy > MAXIMUM_ACCURACY_METERS) {
    setMessage(`Esperando mejor señal GPS (${Math.round(accuracy)} m)…`);
    return;
  }

  // Cálculo de rumbo y velocidad
  let computedBearing = driverState.currentBearing;
  let computedSpeedKmh = 0;

  if (driverState.lastPosition) {
    const dist = distanceInMeters(driverState.lastPosition, { latitude, longitude });
    const timeDeltaSec = Math.max(1, (Date.now() - driverState.lastSentAt) / 1000);

    if (dist >= 3) {
      computedBearing = calculateBearing(
        driverState.lastPosition.latitude,
        driverState.lastPosition.longitude,
        latitude,
        longitude
      );
      driverState.currentBearing = computedBearing;
    }

    if (Number.isFinite(speed) && speed > 0) {
      computedSpeedKmh = speed * 3.6;
    } else if (dist >= 3) {
      computedSpeedKmh = (dist / timeDeltaSec) * 3.6;
    }
  }

  if (Number.isFinite(heading) && heading >= 0) {
    computedBearing = heading;
    driverState.currentBearing = heading;
  }

  driverState.currentSpeedKmh = computedSpeedKmh;

  // Actualizar vista del mapa y vehículo inmediatamente
  updateVehiclePresentation(longitude, latitude, computedBearing, computedSpeedKmh);

  if (driverState.isSending || !shouldSendPosition({ latitude, longitude })) return;

  const timestamp = Date.now();
  driverState.isSending = true;

  try {
    await set(ref(window.viaminaDatabase, `unidades/${driverState.unitCode}`), {
      lat: latitude,
      lng: longitude,
      velocidad: Number.isFinite(speed) ? speed : 0,
      sentido: 'Minatitlán ➔ Colima',
      ultima_senal: timestamp
    });

    driverState.lastSentAt = Date.now();
    driverState.lastPosition = { latitude, longitude };
    updateDriverMetrics({ lat: latitude, lng: longitude, timestamp });
    setMessage('Transmitiendo en vivo (Minatitlán ➔ Colima)');
    setStatus(true, 'Transmitiendo');
  } catch (error) {
    console.error('Error al enviar ubicación a Firebase:', error);
    setMessage('Fallo de conexión satelital. Reintentando…');
  } finally {
    driverState.isSending = false;
  }
}

// ==========================================
// 6. INICIO Y DETENCIÓN DE SEGUIMIENTO GPS
// ==========================================

async function startTracking() {
  if (driverState.isSimulating) stopSimulation();

  if (!navigator.geolocation) return setMessage('Este navegador no soporta geolocalización.');
  if (!window.isSecureContext && !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
    return setMessage('La geolocalización requiere HTTPS o localhost.');
  }
  if (driverState.isTracking) return;

  stopPreviewLocation();

  const unitRef = ref(window.viaminaDatabase, `unidades/${driverState.unitCode}`);
  try {
    await onDisconnect(unitRef).remove();
  } catch (error) {
    console.error('No se pudo configurar la limpieza al desconectar:', error);
  }

  driverState.isTracking = true;
  setStatus(true, 'Buscando satélite');
  setMessage('Conectando con satélites GPS…');

  if (elements.startRouteBtn) elements.startRouteBtn.classList.add('hidden');
  if (elements.stopRouteBtn) elements.stopRouteBtn.classList.remove('hidden');

  startTripTimer();
  requestWakeLock();

  driverState.watchId = navigator.geolocation.watchPosition(
    ({ coords }) => sendLocation(coords),
    (error) => {
      driverState.isTracking = false;
      if (driverState.unitCode) {
        remove(ref(window.viaminaDatabase, `unidades/${driverState.unitCode}`)).catch((removeError) => {
          console.error('No se pudo retirar la unidad tras el error GPS:', removeError);
        });
      }
      setStatus(false, 'GPS no disponible');
      setMessage(error.code === error.PERMISSION_DENIED ? 'Se denegó el permiso de ubicación.' : 'Señal GPS interrumpida.');
      if (elements.startRouteBtn) elements.startRouteBtn.classList.remove('hidden');
      if (elements.stopRouteBtn) elements.stopRouteBtn.classList.add('hidden');
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000 }
  );
}

async function stopTracking() {
  if (driverState.watchId !== null) {
    navigator.geolocation.clearWatch(driverState.watchId);
    driverState.watchId = null;
  }
  driverState.isTracking = false;
  setStatus(false, 'En espera');
  stopTripTimer();
  releaseWakeLock();

  if (!driverState.isSimulating) locateDeviceBeforeTracking();

  if (elements.startRouteBtn) elements.startRouteBtn.classList.remove('hidden');
  if (elements.stopRouteBtn) elements.stopRouteBtn.classList.add('hidden');
  if (elements.speedVal) elements.speedVal.textContent = '0';

  if (driverState.unitCode) {
    try {
      await remove(ref(window.viaminaDatabase, `unidades/${driverState.unitCode}`));
    } catch (error) {
      console.error('No se pudo retirar la unidad de Firebase:', error);
    }
  }

  setMessage('Servicio finalizado. Unidad fuera de circulación.');
}

// ==========================================
// 7. MODO SIMULACIÓN INTERACTIVA (TESTING)
// ==========================================

function toggleSimulation() {
  if (driverState.isSimulating) {
    stopSimulation();
  } else {
    startSimulation();
  }
}

function startSimulation() {
  if (driverState.isTracking) stopTracking();

  if (!driverState.simCoordinates || driverState.simCoordinates.length < 2) {
    setMessage('Cargando trazo de ruta para simulación…');
    loadRouteLayer().then(() => {
      if (driverState.simCoordinates.length >= 2) startSimulation();
    });
    return;
  }

  driverState.isSimulating = true;
  driverState.simStepIndex = 0;
  startTripTimer();
  setStatus(true, 'Simulando');
  setMessage('Modo Simulación: Recorriendo la ruta a 42 km/h.');

  if (elements.simulateBtn) {
    elements.simulateBtn.classList.add('sim-active');
    elements.simulateBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <rect x="6" y="6" width="12" height="12" rx="2"></rect>
      </svg>
      <span class="btn-tooltip">Pausar simulación</span>
    `;
  }

  if (elements.startRouteBtn) elements.startRouteBtn.classList.add('hidden');
  if (elements.stopRouteBtn) elements.stopRouteBtn.classList.remove('hidden');

  driverState.simTimer = setInterval(() => {
    if (!driverState.isSimulating) return;

    const coords = driverState.simCoordinates;
    if (driverState.simStepIndex >= coords.length - 1) {
      driverState.simStepIndex = 0; // Reiniciar circuito
    }

    const curr = coords[driverState.simStepIndex];
    const next = coords[driverState.simStepIndex + 1] || coords[0];
    driverState.simStepIndex++;

    const [lng, lat] = curr;
    const [nextLng, nextLat] = next;
    const bearing = calculateBearing(lat, lng, nextLat, nextLng);
    const simSpeedKmh = 38 + Math.floor(Math.random() * 8);

    driverState.currentBearing = bearing;
    updateVehiclePresentation(lng, lat, bearing, simSpeedKmh);

    // Enviar periódicamente a Firebase Realtime Database
    sendLocation({
      latitude: lat,
      longitude: lng,
      accuracy: 5,
      speed: simSpeedKmh / 3.6,
      heading: bearing
    });
  }, 1200);
}

function stopSimulation() {
  if (driverState.simTimer) {
    clearInterval(driverState.simTimer);
    driverState.simTimer = null;
  }
  driverState.isSimulating = false;
  if (driverState.unitCode) {
    remove(ref(window.viaminaDatabase, `unidades/${driverState.unitCode}`)).catch((error) => {
      console.error('No se pudo retirar la simulación de Firebase:', error);
    });
  }
  setStatus(false, 'Simulación detenida');
  setMessage('Simulación pausada.');
  stopTripTimer();

  if (elements.speedVal) elements.speedVal.textContent = '0';
  if (elements.simulateBtn) {
    elements.simulateBtn.classList.remove('sim-active');
    elements.simulateBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <polygon points="6 4 20 12 6 20 6 4"></polygon>
      </svg>
      <span class="btn-tooltip">Simular</span>
    `;
  }

  if (elements.startRouteBtn) elements.startRouteBtn.classList.remove('hidden');
  if (elements.stopRouteBtn) elements.stopRouteBtn.classList.add('hidden');
}

// ==========================================
// 8. INTERACCIÓN DE CABINA & CONTROLES
// ==========================================

function toggleDrawer(open) {
  if (!elements.driverDrawer || !elements.drawerOverlay) return;
  elements.driverDrawer.classList.toggle('hidden', !open);
  elements.drawerOverlay.classList.toggle('hidden', !open);
}

function swapDirection() {
  const current = elements.directionSelect?.value || 'Minatitlán - Colima';
  const swapped = current === 'Minatitlán - Colima' ? 'Colima - Minatitlán' : 'Minatitlán - Colima';
  if (elements.directionSelect) elements.directionSelect.value = swapped;
  sessionStorage.setItem('sentidoRuta', swapped);

  const directionArrow = swapped.includes('Colima -') ? 'Colima ➔ Minatitlán' : 'Minatitlán ➔ Colima';
  if (elements.cockpitDirectionText) elements.cockpitDirectionText.textContent = directionArrow;

  setMessage(`Sentido cambiado a: ${swapped}`);

  // Si está transmitiendo, enviar la actualización de inmediato
  if (driverState.lastPosition && (driverState.isTracking || driverState.isSimulating)) {
    driverState.lastSentAt = 0; // Forzar envío
    sendLocation({
      latitude: driverState.lastPosition.latitude,
      longitude: driverState.lastPosition.longitude,
      accuracy: 10
    });
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

async function logout() {
  if (driverState.isSimulating) stopSimulation();
  await stopTracking();
  await signOut(auth);
  [
    'choferNombre',
    'choferId',
    'unidadActiva',
    'rutaActiva',
    'sentidoRuta'
  ].forEach((key) => sessionStorage.removeItem(key));
  window.location.href = 'login_chofer.html';
}

// ==========================================
// 9. INICIALIZACIÓN GENERAL
// ==========================================

async function initDriverPage(user) {
  const assignmentSnapshot = await get(ref(window.viaminaDatabase, `choferes/${user.uid}/unidad_asignada`));
  const unitCode = assignmentSnapshot.val();

  if (typeof unitCode !== 'string' || !unitCode.trim()) {
    setMessage('Tu cuenta no tiene una unidad asignada. Contacta al administrador.');
    await signOut(auth);
    window.location.href = 'login_chofer.html';
    return;
  }

  driverState.unitCode = unitCode.trim();
  sessionStorage.setItem('choferNombre', user.displayName || user.email || 'Chofer');
  sessionStorage.setItem('choferId', user.uid);
  sessionStorage.setItem('unidadActiva', driverState.unitCode);

  document.getElementById('choferNombre').textContent = user.displayName || user.email || 'Chofer';
  document.getElementById('choferEyebrow').textContent = `Unidad ${driverState.unitCode}`;
  document.getElementById('cockpitUnitCode').textContent = driverState.unitCode;
  document.getElementById('unitCode').value = driverState.unitCode;

  // Inicializar mapa 3D
  init3DMap();

  // Valores preseleccionados
  const activeRoute = sessionStorage.getItem('rutaActiva') || window.VIAMINA_CONFIG.DEFAULT_ROUTE || 'Ruta Azul';
  const activeDirection = sessionStorage.getItem('sentidoRuta') || 'Minatitlán - Colima';

  if (elements.routeSelect) elements.routeSelect.value = activeRoute;
  if (elements.directionSelect) elements.directionSelect.value = activeDirection;
  if (elements.cockpitRouteTitle) elements.cockpitRouteTitle.textContent = activeRoute;
  if (elements.cockpitDirectionText) {
    elements.cockpitDirectionText.textContent = activeDirection.replace(' - ', ' ➔ ');
  }

  // Listeners de cambios de ruta y sentido
  if (elements.routeSelect) {
    elements.routeSelect.addEventListener('change', (e) => {
      sessionStorage.setItem('rutaActiva', e.target.value);
      loadRouteLayer();
    });
  }

  if (elements.directionSelect) {
    elements.directionSelect.addEventListener('change', (e) => {
      sessionStorage.setItem('sentidoRuta', e.target.value);
      if (elements.cockpitDirectionText) {
        elements.cockpitDirectionText.textContent = e.target.value.replace(' - ', ' ➔ ');
      }
    });
  }

  // Botones de acción
  if (elements.startRouteBtn) elements.startRouteBtn.addEventListener('click', startTracking);
  if (elements.stopRouteBtn) elements.stopRouteBtn.addEventListener('click', stopTracking);
  if (elements.recenterBtn) elements.recenterBtn.addEventListener('click', recenterCamera);
  if (elements.viewModeBtn) elements.viewModeBtn.addEventListener('click', toggleViewMode);
  if (elements.fullscreenBtn) elements.fullscreenBtn.addEventListener('click', toggleFullscreen);
  if (elements.simulateBtn) elements.simulateBtn.addEventListener('click', toggleSimulation);
  if (elements.swapDirectionBtn) elements.swapDirectionBtn.addEventListener('click', swapDirection);

  // Drawer
  if (elements.drawerToggleBtn) elements.drawerToggleBtn.addEventListener('click', () => toggleDrawer(true));
  if (elements.drawerCloseBtn) elements.drawerCloseBtn.addEventListener('click', () => toggleDrawer(false));
  if (elements.drawerOverlay) elements.drawerOverlay.addEventListener('click', () => toggleDrawer(false));

  if (elements.logoutBtn) elements.logoutBtn.addEventListener('click', logout);

  window.addEventListener('beforeunload', () => {
    stopPreviewLocation();
    if (driverState.watchId !== null) navigator.geolocation.clearWatch(driverState.watchId);
    if (driverState.simTimer) clearInterval(driverState.simTimer);
    releaseWakeLock();
  });

  setStatus(false, 'Listo para iniciar');
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = 'login_chofer.html';
    return;
  }

  initDriverPage(user).catch((error) => {
    console.error('No se pudo cargar la unidad asignada:', error);
    setMessage('No se pudo validar la unidad asignada. Intenta nuevamente.');
  });
});

