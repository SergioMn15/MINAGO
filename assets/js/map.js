(() => {
  const { UNIT_CODE, DEFAULT_ROUTE, ROUTES } = window.VIAMINA_CONFIG;
  const mapElement = document.getElementById('map');
  const selectedRouteNameEl = document.getElementById('selectedRouteName');
  const routeListEl = document.getElementById('routeList');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const alertBanner = document.getElementById('alertBanner');
  const unitCodeBadge = document.getElementById('unitCodeBadge');
  const unitSentido = document.getElementById('unitSentido');
  const unitLastSignal = document.getElementById('unitLastSignal');
  const btnFocusBus = document.getElementById('btnFocusBus');

  let hasLiveLocation = false;
  let displayRoute = sessionStorage.getItem('publicRouteSelection') || DEFAULT_ROUTE || 'Ruta Azul';
  let busAssignedRoute = DEFAULT_ROUTE || 'Ruta Azul';
  let routeLayers = {};
  let currentRouteLayer = null;
  let followBusEnabled = true;
  let lastKnownBusPosition = null;

  const routeCatalog = ROUTES.reduce((acc, route) => {
    acc[route.name] = {
      color: route.color,
      file: route.file,
      label: route.name
    };
    return acc;
  }, {});

  const normalizeRouteName = (value) => {
    if (!value) return DEFAULT_ROUTE || 'Ruta Azul';
    return value.trim() || DEFAULT_ROUTE || 'Ruta Azul';
  };

  const buildRouteList = () => {
    if (!routeListEl) return;

    routeListEl.innerHTML = '';

    Object.entries(routeCatalog).forEach(([key, routeData]) => {
      const button = document.createElement('button');
      button.type = 'button';
      const isActive = key === displayRoute;
      button.className = `route-card-item ${isActive ? 'is-active' : ''}`;
      button.setAttribute('aria-pressed', String(isActive));

      const isAzul = key.toLowerCase().includes('azul');
      const routeDesc = isAzul ? 'Minatitlán ➔ Colima (Vía Principal)' : 'Circuito Urbano / Alterna';

      button.innerHTML = `
        <div class="route-card-main">
          <span class="route-card-swatch" style="background:${routeData.color};"></span>
          <div class="route-card-details">
            <strong class="route-card-title">${routeData.label}</strong>
            <span class="route-card-desc">${routeDesc}</span>
          </div>
        </div>
        <span class="route-card-tag">${isActive ? 'En mapa' : 'Ver'}</span>
      `;

      button.addEventListener('click', () => {
        displayRoute = key;
        sessionStorage.setItem('publicRouteSelection', key);
        if (selectedRouteNameEl) selectedRouteNameEl.textContent = key;
        renderRoute(key);
        document.querySelectorAll('.route-card-item').forEach((el) => {
          const isSelected = el.querySelector('.route-card-title')?.textContent.trim() === key;
          el.classList.toggle('is-active', isSelected);
          el.setAttribute('aria-pressed', String(isSelected));
          const tag = el.querySelector('.route-card-tag');
          if (tag) tag.textContent = isSelected ? 'En mapa' : 'Ver';
        });
      });

      routeListEl.appendChild(button);
    });
  };

  const renderRoute = async (routeName) => {
    const routeMeta = routeCatalog[routeName];
    if (!routeMeta) return;

    if (currentRouteLayer) {
      map.removeLayer(currentRouteLayer);
    }

    try {
      const response = await fetch(routeMeta.file);
      const geoJson = await response.json();
      currentRouteLayer = L.geoJSON(geoJson, {
        style: {
          color: routeMeta.color,
          weight: 5,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round'
        }
      }).addTo(map);

      map.fitBounds(currentRouteLayer.getBounds(), { padding: [30, 30] });
      routeLayers[routeName] = currentRouteLayer;
      if (selectedRouteNameEl) selectedRouteNameEl.textContent = routeName;
      buildRouteList();
    } catch (error) {
      console.error('No se pudo cargar la ruta:', routeName, error);
    }
  };

  const map = L.map(mapElement, {
    zoomControl: true,
    attributionControl: true
  }).setView([19.244338, -103.742154], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const savedPublicRoute = sessionStorage.getItem('publicRouteSelection') || DEFAULT_ROUTE || 'Ruta Azul';
  if (savedPublicRoute && routeCatalog[savedPublicRoute]) {
    displayRoute = savedPublicRoute;
  }

  if (selectedRouteNameEl) {
    selectedRouteNameEl.textContent = displayRoute;
  }

  buildRouteList();

  const applyRouteFromSupabase = (routeName) => {
    const normalized = normalizeRouteName(routeName);
    if (routeCatalog[normalized]) {
      busAssignedRoute = normalized;
      if (selectedRouteNameEl && !sessionStorage.getItem('publicRouteSelection')) {
        selectedRouteNameEl.textContent = normalized;
      }
      if (!sessionStorage.getItem('publicRouteSelection')) {
        displayRoute = normalized;
        renderRoute(normalized);
      }
      buildRouteList();
    }
  };

  renderRoute(displayRoute);

  window.viaminaSupabase
    .from('unidades_transporte')
    .select('*')
    .eq('codigo_unidad', UNIT_CODE)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) {
        console.warn('No hay registro de ruta en Supabase, usando fallback local.', error);
        return;
      }

      if (data && data.ruta_actual) {
        applyRouteFromSupabase(data.ruta_actual);
      }
    });

  setTimeout(() => {
    map.invalidateSize();
  }, 150);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          map.setView([latitude, longitude], 14);
        }
      },
      () => {
        // Sin centro fijo: dejar el mapa neutral si la geolocalización no está disponible.
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 15000
      }
    );
  }

  const busIcon = L.icon({
    iconUrl: './camion.webp',
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -20]
  });

  const busMarkersByUnit = {};

  const getRouteLabel = (routeName) => {
    const normalized = normalizeRouteName(routeName || busAssignedRoute || displayRoute || DEFAULT_ROUTE || 'Ruta Azul');
    return routeCatalog[normalized]?.label || normalized || 'Ruta activa';
  };

  const getPopupHtml = (data = {}) => {
    const unitCode = data.codigo_unidad || UNIT_CODE;
    const routeName = getRouteLabel(data.ruta_actual || busAssignedRoute || displayRoute || DEFAULT_ROUTE || 'Ruta Azul');
    const routeColor = data.color_ruta || routeCatalog[routeName]?.color || '#1d4ed8';
    const timestamp = data.ultima_actualizacion || new Date().toISOString();
    const formattedTime = formatTime(timestamp);
    const sentido = data.sentido || sessionStorage.getItem('sentidoRuta') || 'Minatitlán - Colima';

    return `
      <div style="padding: 8px; font-size: 13px;">
        <strong>Unidad ${escapeHtml(unitCode)}</strong><br>
        <span style="color:${escapeHtml(routeColor)}; font-weight:700; font-size: 14px;">${escapeHtml(routeName)}</span><br>
        <span style="color: #666; margin-top: 4px; display: block;"><strong>Sentido:</strong> ${escapeHtml(sentido)}</span>
        <span style="color: #999; font-size: 12px; margin-top: 4px; display: block;">Últ. actualización: ${formattedTime}</span>
      </div>
    `;
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);

  const setBusVisibility = (unitCode, isVisible) => {
    const marker = busMarkersByUnit[unitCode] || null;
    if (!marker) return;

    marker.setOpacity(isVisible ? 1 : 0);
    if (marker.getElement) {
      const el = marker.getElement();
      if (el) {
        el.style.display = isVisible ? 'block' : 'none';
      }
    }
  };

  const ensureBusMarker = (latitud, longitud, unitCodeOverride = UNIT_CODE, data = {}) => {
    const key = unitCodeOverride || UNIT_CODE;
    let marker = busMarkersByUnit[key];

    if (marker) {
      marker.setLatLng([latitud, longitud]);
      marker.setOpacity(1);
      marker.bindPopup(getPopupHtml({
        codigo_unidad: key,
        ruta_actual: data.ruta_actual || busAssignedRoute || displayRoute || DEFAULT_ROUTE || 'Ruta Azul',
        color_ruta: data.color_ruta || routeCatalog[data.ruta_actual || busAssignedRoute || displayRoute || DEFAULT_ROUTE || 'Ruta Azul']?.color || '#1d4ed8',
        ultima_actualizacion: data.ultima_actualizacion || new Date().toISOString(),
        sentido: data.sentido || sessionStorage.getItem('sentidoRuta') || 'Minatitlán - Colima'
      }));
      return marker;
    }

    marker = L.marker([latitud, longitud], {
      title: `Unidad ${key}`,
      icon: busIcon,
      opacity: 1
    }).addTo(map);

    marker.bindPopup(getPopupHtml({
      codigo_unidad: key,
      ruta_actual: data.ruta_actual || busAssignedRoute || displayRoute || DEFAULT_ROUTE || 'Ruta Azul',
      color_ruta: data.color_ruta || routeCatalog[data.ruta_actual || busAssignedRoute || displayRoute || DEFAULT_ROUTE || 'Ruta Azul']?.color || '#1d4ed8',
      ultima_actualizacion: data.ultima_actualizacion || new Date().toISOString(),
      sentido: data.sentido || sessionStorage.getItem('sentidoRuta') || 'Minatitlán - Colima'
    }));

    busMarkersByUnit[key] = marker;
    return marker;
  };

  const focusOnBus = (latitud, longitud, zoom = 14) => {
    const target = [latitud, longitud];
    if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return;

    if (!map || !map.getSize || !map.getSize().x || !map.getSize().y) {
      return;
    }

    lastKnownBusPosition = target;

    if (!followBusEnabled) {
      window.__latestMapView = { latitud, longitud, zoom: map.getZoom() };
      hasLiveLocation = true;
      return;
    }

    const targetZoom = Math.max(zoom, map.getZoom());

    if (!hasLiveLocation) {
      map.setView(target, zoom);
    } else {
      const distanceFromCenter = map.distance(map.getCenter(), target);
      const shouldFollow = distanceFromCenter > 120 || map.getZoom() > targetZoom + 1 || map.getZoom() < targetZoom - 1;

      if (shouldFollow) {
        map.flyTo(target, Math.min(targetZoom, 18), {
          animate: true,
          duration: 0.9
        });
      }
    }

    window.__latestMapView = { latitud, longitud, zoom: map.getZoom() };
    hasLiveLocation = true;
  };

  window.viaminaMapFocus = focusOnBus;
  window.viaminaMapToggleFollow = (enabled) => {
    followBusEnabled = Boolean(enabled);
    if (followBusEnabled && lastKnownBusPosition) {
      map.flyTo(lastKnownBusPosition, Math.min(map.getZoom(), 18), {
        animate: true,
        duration: 0.8
      });
    }
  };

  map.on('dragstart zoomstart', () => {
    followBusEnabled = false;
  });

  const formatTime = (value) => {
    if (!value) return '--';
    const date = new Date(value);
    return isNaN(date.getTime()) ? '--' : date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const setStatus = (isLive, message) => {
    if (statusDot) {
      statusDot.classList.toggle('live', isLive);
      statusDot.classList.toggle('offline', !isLive);
    }
    if (statusText) {
      statusText.textContent = message;
    }
  };

  const updateInfo = (data, options = {}) => {
    if (!data) return;

    const { latitud, longitud, ultima_actualizacion, en_ruta } = data;
    const timestamp = ultima_actualizacion || new Date().toISOString();
    const unitCode = data.codigo_unidad || UNIT_CODE;

    if (typeof latitud === 'number' && typeof longitud === 'number') {
      lastKnownBusPosition = [latitud, longitud];
      const marker = ensureBusMarker(latitud, longitud, unitCode, data);
      if (marker) {
        busAssignedRoute = normalizeRouteName(data.ruta_actual || busAssignedRoute || displayRoute || DEFAULT_ROUTE || 'Ruta Azul');
        marker.bindPopup(getPopupHtml({
          codigo_unidad: unitCode,
          ruta_actual: data.ruta_actual || busAssignedRoute || displayRoute || DEFAULT_ROUTE || 'Ruta Azul',
          color_ruta: data.color_ruta || routeCatalog[data.ruta_actual || busAssignedRoute || displayRoute || DEFAULT_ROUTE || 'Ruta Azul']?.color || '#1d4ed8',
          ultima_actualizacion: timestamp,
          sentido: data.sentido || 'Minatitlán - Colima'
        }));
      }
      if (!options.skipCenter) {
        focusOnBus(latitud, longitud, 14);
      }
    }

    if (unitCodeBadge) unitCodeBadge.textContent = unitCode;
    if (unitSentido) unitSentido.textContent = data.sentido || 'Minatitlán ➔ Colima';
    if (unitLastSignal) unitLastSignal.textContent = formatTime(timestamp);

    const now = Date.now();
    const lastSignal = new Date(timestamp).getTime();
    const diffMinutes = (now - lastSignal) / 60000;
    const isOutOfService = en_ruta === false || diffMinutes > 5;

    if (isOutOfService) {
      setStatus(false, 'Sin señal reciente');
      if (alertBanner) alertBanner.classList.remove('hidden');
      setBusVisibility(unitCode, false);
    } else {
      setStatus(true, 'En circulación');
      if (alertBanner) alertBanner.classList.add('hidden');
      setBusVisibility(unitCode, true);
    }
  };

  if (btnFocusBus) {
    btnFocusBus.addEventListener('click', () => {
      if (lastKnownBusPosition && Number.isFinite(lastKnownBusPosition[0]) && Number.isFinite(lastKnownBusPosition[1])) {
        focusOnBus(lastKnownBusPosition[0], lastKnownBusPosition[1], 15);
      } else if (currentRouteLayer) {
        map.fitBounds(currentRouteLayer.getBounds(), { padding: [30, 30] });
      }
    });
  }

  const channel = window.viaminaSupabase
    .channel('public:unidades_transporte')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'unidades_transporte'
      },
      (payload) => {
        const row = payload.new || payload.old;
        if (!row) return;
        updateInfo(row, { skipCenter: false });
      }
    )
    .subscribe();

  // Carga inicial desde la base
  window.viaminaSupabase
    .from('unidades_transporte')
    .select('*')
    .eq('en_ruta', true)
    .then(({ data, error }) => {
      if (error) {
        console.error('Error al consultar estado inicial:', error);
        setStatus(false, 'Sin datos iniciales');
        return;
      }

      if (Array.isArray(data) && data.length > 0) {
        data.forEach((row) => updateInfo(row, { skipCenter: true }));
      } else {
        setStatus(false, 'Sin unidad activa');
      }
    });

  window.viaminaMapChannel = channel;
})();
