const MINIMUM_SEND_INTERVAL_MS = 10000;
const MINIMUM_DISTANCE_METERS = 25;
// En móviles suele ser menor a 75 m; en laptops puede ser de cientos de metros.
const MAXIMUM_ACCURACY_METERS = 1500;

const driverState = { watchId: null, isTracking: false, isSending: false, lastSentAt: 0, lastPosition: null };

function setMessage(message) {
  const element = document.getElementById('driverMessage');
  if (element) element.textContent = message;
}

function status(live, text = live ? 'Transmitiendo' : 'Sin iniciar') {
  const dot = document.getElementById('driverStatusDot');
  const label = document.getElementById('driverStatusText');
  if (dot) {
    dot.classList.toggle('live', live);
    dot.classList.toggle('offline', !live);
  }
  if (label) label.textContent = text;
}

function updateDriverMetrics({ lat, lng, timestamp }) {
  document.getElementById('driverLat').textContent = lat.toFixed(5);
  document.getElementById('driverLng').textContent = lng.toFixed(5);
  document.getElementById('driverUpdatedAt').textContent = new Date(timestamp).toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function distanceInMeters(from, to) {
  const radians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const deltaLat = radians(to.latitude - from.latitude);
  const deltaLng = radians(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shouldSendPosition(position) {
  if (!driverState.lastPosition) return true;
  return Date.now() - driverState.lastSentAt >= MINIMUM_SEND_INTERVAL_MS
    || distanceInMeters(driverState.lastPosition, position) >= MINIMUM_DISTANCE_METERS;
}

function getSessionToken() {
  return sessionStorage.getItem('choferSessionToken');
}

function getRouteData() {
  return {
    routeName: sessionStorage.getItem('rutaActiva') || window.VIAMINA_CONFIG.DEFAULT_ROUTE || 'Ruta Azul',
    direction: document.getElementById('directionSelect')?.value || 'Minatitlán - Colima'
  };
}

async function sendLocation({ latitude, longitude, accuracy }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    setMessage('La ubicación recibida no es válida.');
    return;
  }
  if (Number.isFinite(accuracy) && accuracy > MAXIMUM_ACCURACY_METERS) {
    console.warn(`Precisión GPS insuficiente: ${Math.round(accuracy)} m.`);
    setMessage(`Esperando una señal GPS más precisa (${Math.round(accuracy)} m)…`);
    return;
  }
  if (driverState.isSending || !shouldSendPosition({ latitude, longitude })) return;

  const sessionToken = getSessionToken();
  if (!sessionToken) {
    await stopTracking();
    setMessage('Tu sesión expiró. Inicia sesión nuevamente.');
    return;
  }

  const { routeName, direction } = getRouteData();
  const timestamp = new Date().toISOString();
  driverState.isSending = true;
  try {
    const { error } = await window.viaminaSupabase.rpc('update_driver_location', {
      p_session_token: sessionToken,
      p_latitud: latitude,
      p_longitud: longitude,
      p_ruta_actual: routeName,
      p_sentido: direction
    });
    if (error) {
      console.error('No se pudo enviar la ubicación:', error);
      setMessage('No se pudo enviar la ubicación. Revisa tu conexión o inicia sesión de nuevo.');
      return;
    }
    driverState.lastSentAt = Date.now();
    driverState.lastPosition = { latitude, longitude };
    updateDriverMetrics({ lat: latitude, lng: longitude, timestamp });
    setMessage('Ubicación enviada correctamente.');
  } finally {
    driverState.isSending = false;
  }
}

function startTracking() {
  if (!navigator.geolocation) return setMessage('Este navegador no soporta geolocalización.');
  if (!window.isSecureContext && !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
    return setMessage('La geolocalización requiere HTTPS o localhost.');
  }
  if (driverState.isTracking) return;

  driverState.isTracking = true;
  status(true, 'Buscando ubicación');
  setMessage('Solicitando permiso de ubicación…');
  driverState.watchId = navigator.geolocation.watchPosition(
    ({ coords }) => sendLocation(coords),
    (error) => {
      driverState.isTracking = false;
      status(false, 'GPS no disponible');
      setMessage(error.code === error.PERMISSION_DENIED ? 'Se negó el permiso de ubicación.' : 'No se pudo obtener ubicación GPS.');
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

async function stopTracking() {
  if (driverState.watchId !== null) navigator.geolocation.clearWatch(driverState.watchId);
  driverState.watchId = null;
  driverState.isTracking = false;
  status(false);
  const sessionToken = getSessionToken();
  if (!sessionToken) return;
  const { routeName, direction } = getRouteData();
  const { error } = await window.viaminaSupabase.rpc('stop_driver_route', {
    p_session_token: sessionToken, p_ruta_actual: routeName, p_sentido: direction
  });
  setMessage(error ? 'La ruta se detuvo localmente, pero no se pudo actualizar el servidor.' : 'Ruta detenida. La unidad quedó fuera de servicio.');
}

async function logout() {
  await stopTracking();
  const sessionToken = getSessionToken();
  if (sessionToken) await window.viaminaSupabase.rpc('logout_driver', { p_session_token: sessionToken });
  ['choferAutorizado', 'choferNombre', 'choferId', 'unidadActiva', 'rutaActiva', 'sentidoRuta', 'choferSessionToken'].forEach((key) => sessionStorage.removeItem(key));
  window.location.href = 'login_chofer.html';
}

function initDriverPage() {
  if (sessionStorage.getItem('choferAutorizado') !== 'true' || !getSessionToken()) {
    window.location.href = 'login_chofer.html';
    return;
  }
  const routeSelect = document.getElementById('routeSelect');
  const directionSelect = document.getElementById('directionSelect');
  routeSelect.value = sessionStorage.getItem('rutaActiva') || window.VIAMINA_CONFIG.DEFAULT_ROUTE;
  directionSelect.value = sessionStorage.getItem('sentidoRuta') || directionSelect.value;
  routeSelect.addEventListener('change', (event) => sessionStorage.setItem('rutaActiva', event.target.value));
  directionSelect.addEventListener('change', (event) => sessionStorage.setItem('sentidoRuta', event.target.value));
  document.getElementById('startRouteBtn').addEventListener('click', startTracking);
  document.getElementById('stopRouteBtn').addEventListener('click', stopTracking);
  document.getElementById('logoutBtn').addEventListener('click', logout);
  window.addEventListener('beforeunload', () => {
    if (driverState.watchId !== null) navigator.geolocation.clearWatch(driverState.watchId);
  });
  status(false);
}

initDriverPage();
