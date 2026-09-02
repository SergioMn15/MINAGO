console.log('[driver] Script cargado. Verificando estado del navegador...');

window.addEventListener('error', (event) => {
  console.error('[driver] Error global JS:', event.message, event.error || event);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[driver] Promise rechazada no manejada:', event.reason);
});

const driverState = {
  watchId: null,
  isTracking: false
};

function status(live) {
  const driverStatusDot = document.getElementById('driverStatusDot');
  const driverStatusText = document.getElementById('driverStatusText');
  if (!driverStatusDot || !driverStatusText) return;

  driverStatusDot.classList.toggle('live', live);
  driverStatusDot.classList.toggle('offline', !live);
  driverStatusText.textContent = live ? 'Transmitiendo' : 'Sin iniciar';
}

function updateDriverMetrics({ lat, lng, timestamp }) {
  const driverLat = document.getElementById('driverLat');
  const driverLng = document.getElementById('driverLng');
  const driverUpdatedAt = document.getElementById('driverUpdatedAt');

  if (!driverLat || !driverLng || !driverUpdatedAt) return;

  driverLat.textContent = lat.toFixed(5);
  driverLng.textContent = lng.toFixed(5);
  driverUpdatedAt.textContent = new Date(timestamp).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

async function sendLocation({ latitude, longitude }) {
  const unitCodeInput = document.getElementById('unitCode');
  const driverMessage = document.getElementById('driverMessage');
  const { UNIT_CODE } = window.VIAMINA_CONFIG;
  const routeName = sessionStorage.getItem('rutaActiva') || window.VIAMINA_CONFIG.DEFAULT_ROUTE || 'Ruta Azul';
  const directionSelect = document.getElementById('directionSelect');
  const sentido = directionSelect ? directionSelect.value : 'Minatitlán - Colima';

  const payload = {
    codigo_unidad: (unitCodeInput && unitCodeInput.value) || UNIT_CODE,
    latitud: latitude,
    longitud: longitude,
    en_ruta: true,
    ruta_actual: routeName,
    sentido,
    color_ruta: routeName === 'Ruta Amarillo' ? '#f59e0b' : '#1d4ed8',
    ultima_actualizacion: new Date().toISOString()
  };

  console.log('[driver] Enviando ubicación:', payload);

  try {
    const { error } = await window.viaminaSupabase.from('unidades_transporte').upsert(payload, {
      onConflict: 'codigo_unidad'
    });

    if (error) {
      console.error('[driver] Error al enviar posición a Supabase:', error);
      if (driverMessage) driverMessage.textContent = 'Error al enviar la ubicación al servidor.';
      return;
    }

    updateDriverMetrics({
      lat: latitude,
      lng: longitude,
      timestamp: payload.ultima_actualizacion
    });

    if (driverMessage) driverMessage.textContent = 'Ubicación enviada correctamente.';
    console.log('[driver] Posición enviada correctamente a Supabase.');
  } catch (err) {
    console.error('[driver] Excepción al enviar ubicación:', err);
    if (driverMessage) driverMessage.textContent = 'No se pudo enviar la ubicación por un error inesperado.';
  }
}

function startTracking() {
  const driverMessage = document.getElementById('driverMessage');
  console.log('[driver] Click en Iniciar Ruta detectado.');
  console.log('[driver] Iniciando ruta. Contexto:', {
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    isSecureContext: window.isSecureContext,
    userAgent: navigator.userAgent
  });

  if (!window.VIAMINA_CONFIG) {
    console.error('[driver] FALTA window.VIAMINA_CONFIG. Revisa config.js');
    return;
  }

  if (!window.viaminaSupabase) {
    console.error('[driver] Supabase no está inicializado. Revisa supabaseClient.js');
    return;
  }

  if (!navigator.geolocation) {
    console.error('[driver] Geolocalización no soportada por este navegador.');
    if (driverMessage) driverMessage.textContent = 'Este navegador no soporta geolocalización.';
    return;
  }

  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  if (!window.isSecureContext && !isLocalHost) {
    console.warn('[driver] Contexto no seguro para geolocalización:', {
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      isSecureContext: window.isSecureContext
    });
    if (driverMessage) driverMessage.textContent = 'La geolocalización solo funciona desde HTTPS o localhost. Abre la app en http://localhost o con HTTPS para iniciar la ruta.';
    status(false);
    return;
  }

  if (driverState.isTracking) {
    console.log('[driver] Ya se está rastreando la ubicación.');
    return;
  }

  driverState.isTracking = true;
  status(true);
  if (driverMessage) driverMessage.textContent = 'Solicitando permiso de ubicación...';
  console.log('[driver] Solicitando permiso de geolocalización...');

  driverState.watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      console.log('[driver] Posición recibida:', position.coords);
      await sendLocation({ latitude, longitude });
    },
    (error) => {
      console.error('[driver] GPS error:', error);
      driverState.isTracking = false;
      status(false);

      if (error.code === error.PERMISSION_DENIED) {
        console.warn('[driver] Permiso de ubicación denegado por el usuario.');
        if (driverMessage) driverMessage.textContent = 'Se negó el permiso de ubicación. Acepta la solicitud o habilita la ubicación del navegador.';
        return;
      }

      console.error('[driver] Otro error de geolocalización:', {
        code: error.code,
        message: error.message
      });
      if (driverMessage) driverMessage.textContent = 'No se pudo acceder a la ubicación GPS. Revisa los permisos.';
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000
    }
  );

  console.log('[driver] watchPosition registrado con ID:', driverState.watchId);
}

async function stopTracking() {
  const driverMessage = document.getElementById('driverMessage');
  console.log('[driver] Click en Detener Ruta detectado.');

  if (driverState.watchId) {
    navigator.geolocation.clearWatch(driverState.watchId);
    driverState.watchId = null;
  }

  driverState.isTracking = false;
  status(false);
  if (driverMessage) driverMessage.textContent = 'Ruta detenida. Se marcó la unidad como fuera de servicio.';

  const routeName = sessionStorage.getItem('rutaActiva') || window.VIAMINA_CONFIG.DEFAULT_ROUTE || 'Ruta Azul';
  const directionSelect = document.getElementById('directionSelect');
  const sentido = directionSelect ? directionSelect.value : 'Minatitlán - Colima';
  const payload = {
    codigo_unidad: (document.getElementById('unitCode') && document.getElementById('unitCode').value) || window.VIAMINA_CONFIG.UNIT_CODE,
    en_ruta: false,
    ruta_actual: routeName,
    sentido,
    color_ruta: routeName === 'Ruta Amarillo' ? '#f59e0b' : '#1d4ed8',
    ultima_actualizacion: new Date().toISOString()
  };

  console.log('[driver] Marcando unidad como fuera de servicio:', payload);

  try {
    const { error } = await window.viaminaSupabase.from('unidades_transporte').upsert(payload, {
      onConflict: 'codigo_unidad'
    });

    if (error) {
      console.error('[driver] Error al detener la ruta en Supabase:', error);
    } else {
      console.log('[driver] Ruta detenida correctamente en Supabase.');
    }
  } catch (err) {
    console.error('[driver] Excepción al detener la ruta:', err);
  }
}

function bindDriverControls() {
  const startRouteBtn = document.getElementById('startRouteBtn');
  const stopRouteBtn = document.getElementById('stopRouteBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const routeSelect = document.getElementById('routeSelect');
  const directionSelect = document.getElementById('directionSelect');

  if (!startRouteBtn || !stopRouteBtn) {
    console.error('[driver] No se encontraron los botones de la ruta.');
    return;
  }

  window.viaminaStartRoute = startTracking;
  window.viaminaStopRoute = stopTracking;

  if (routeSelect) {
    const savedRoute = sessionStorage.getItem('rutaActiva') || window.VIAMINA_CONFIG.DEFAULT_ROUTE || 'Ruta Azul';
    routeSelect.value = savedRoute;
    routeSelect.addEventListener('change', (event) => {
      const selectedRoute = event.target.value;
      sessionStorage.setItem('rutaActiva', selectedRoute);
      console.log('[driver] Ruta seleccionada por chofer:', selectedRoute);
    });
  }

  if (directionSelect) {
    const savedDirection = sessionStorage.getItem('sentidoRuta') || 'Minatitlán - Colima';
    directionSelect.value = savedDirection;
    directionSelect.addEventListener('change', (event) => {
      const selectedDirection = event.target.value;
      sessionStorage.setItem('sentidoRuta', selectedDirection);
      console.log('[driver] Sentido seleccionado por chofer:', selectedDirection);
    });
  }

  startRouteBtn.addEventListener('click', startTracking);
  stopRouteBtn.addEventListener('click', stopTracking);

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('choferAutorizado');
      sessionStorage.removeItem('unidadActiva');
      sessionStorage.removeItem('rutaActiva');
      window.location.href = 'panel.html';
    });
  }

  console.log('[driver] Listeners activos.');
}

function initDriverPage() {
  const isAuthorized = sessionStorage.getItem('choferAutorizado') === 'true';
  if (!isAuthorized) {
    window.location.href = 'panel.html';
    return;
  }

  if (!window.VIAMINA_CONFIG) {
    console.error('[driver] FALTA window.VIAMINA_CONFIG. Revisa config.js');
    return;
  }

  if (!window.viaminaSupabase) {
    console.error('[driver] Supabase no está inicializado. Revisa supabaseClient.js');
    return;
  }

  bindDriverControls();
  status(false);
}

initDriverPage();
