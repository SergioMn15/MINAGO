# Documento de Plan de Implementación por Fases – VíaMinatitlán

## 1. Resumen ejecutivo

VíaMinatitlán es una PWA de movilidad en tiempo real diseñada para mostrar la ubicación en vivo del camión/autobús que va hacia Minatitlán. El proyecto sigue un patrón Publicador-Suscriptor basado en Supabase Realtime, donde el chofer emite geolocalización desde su navegador y los usuarios consumen esa información en tiempo real desde una vista pública con mapa.

Dado que el workspace actual está vacío, este documento sirve como plan de construcción desde cero, alineado con el PRD entregado y con una estrategia realista para un MVP de bajo costo y despliegue sencillo en Netlify/Vercel + Supabase.

## 2. Objetivo del proyecto

1. Permitir que un chofer publique su ubicación GPS cada 3 a 5 segundos.
2. Guardar esa ubicación en tiempo real en Supabase.
3. Mostrar el vehículo en un mapa interactivo para usuarios finales.
4. Informar si la señal está retrasada o perdida por más de 5 minutos.
5. Mantener un MVP de costo $0 con herramientas gratuitas y funcionalidad de utilidad real.

## 3. Arquitectura propuesta

### 3.1. Flujos principales

- Chofer: navegador con `navigator.geolocation.watchPosition()`
- Emisión: JSON con latitud, longitud y `ultima_actualizacion`
- Canal: tabla `unidades_transporte` en Supabase con Realtime habilitado
- Receptor: navegador del usuario con Leaflet + Supabase subscription
- Visualización: marcador del camión en mapa con actualización suave
- Ruta marcada: una línea o polilínea en el mapa con la ruta predefinida que el camión debe seguir, mostrando el recorrido esperado antes de la llegada en vivo

### 3.2. Diagrama conceptual

```text
[Chofer - PWA] --(GPS)--> [Navegador] --(POST/UPSERT)--> [Supabase Realtime]
                                                         |
                                                         v
                                               [unidades_transporte]
                                                         |
                                                         v
[Usuario - PWA] --(subscribe postgres_changes)--> [Leaflet Map]
```

## 4. Stack tecnológico recomendado

### Frontend
- HTML5 + CSS3 + JavaScript vanilla
- Leaflet.js para mapa interactivo
- OpenStreetMap tiles gratuitos
- PWA: manifest y service worker para instalar en móvil
- `@supabase/supabase-js` para la conexión y suscripción en vivo

### Backend / Datos
- Supabase PostgreSQL
- Supabase Realtime
- Row Level Security (RLS) básico para evitar escritura abierta no deseada

### Hosting
- Netlify o Vercel para frontend
- SSL/HSTS obligatorio para geolocalización segura en navegador

## 5. Estructura recomendada del proyecto

```text
via-minatitlan/
├─ index.html
├─ chofer.html
├─ manifest.webmanifest
├─ sw.js
├─ assets/
│  ├─ css/
│  │  └─ styles.css
│  ├─ js/
│  │  ├─ config.js
│  │  ├─ supabaseClient.js
│  │  ├─ map.js
│  │  ├─ driver.js
│  │  └─ app.js
│  └─ img/
├─ .env.example
├─ README.md
└─ PLAN_VIAMINATITLAN.md
```

## 6. Fase 0 – Preparación del proyecto y definición técnica

### Objetivo
Establecer la base del producto y consensuar el alcance del MVP.

### Tareas
- Confirmar que la solución será una PWA ligera y móvil-first.
- Definir el flujo principal: chofer emite, usuario observa.
- Definir la base de rutas y estructura de archivos.
- Preparar la documentación técnica y el plan de despliegue.

### Entregables
- PRD y alcance del MVP aprobado.
- Diagrama de flujo funcional.
- Estructura de carpetas del proyecto.
- Reglas para nomenclatura, variables y manejo de estados.

### Criterio de salida
- El equipo entiende la arquitectura, los puntos de riesgo y el alcance objetivo.

## 7. Fase 1 – Infraestructura y configuración inicial

### Objetivo
Preparar la infraestructura gratuita necesaria para pruebas y despliegue inicial.

### Acciones
1. Crear cuenta en Supabase.
2. Crear nuevo proyecto con base de datos PostgreSQL.
3. Crear la tabla `unidades_transporte`.
4. Habilitar Realtime para la tabla.
5. Crear un proyecto estático en Netlify o Vercel.
6. Configurar variables de entorno:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `UNIDAD_CODIGO` (si se usa una unidad fija por ambiente)
7. Verificar HTTPS activo en el frontend.

### SQL recomendado

```sql
CREATE TABLE unidades_transporte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_unidad VARCHAR(20) NOT NULL UNIQUE,
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  en_ruta BOOLEAN DEFAULT false,
  ultima_actualizacion TIMESTAMPTZ DEFAULT NOW()
);

ALTER PUBLICATION supabase_realtime ADD TABLE unidades_transporte;
```

### Recomendaciones de seguridad
- Evitar exponer la clave de servicio en frontend.
- Usar anon key solo para lectura/escritura del flujo público.
- En producción, considerar RLS y autenticación.

### Entregables
- Proyecto Supabase activo.
- Tablas creadas.
- Variables de entorno documentadas.
- Frontend desplegado en entorno de prueba.

## 8. Fase 2 – Modelo de datos y lógica de sincronización

### Objetivo
Diseñar la capa de datos para soportar el flujo en vivo sin errores ni duplicados.

### Reglas de negocio
- La unidad tiene un código único: `codigo_unidad`.
- El chofer solo puede actualizar su propia fila.
- `ultima_actualizacion` se actualiza cada vez que cambia la ubicación.
- Cuando el chofer deja de emitir, `en_ruta` pasa a `false`.
- Si la diferencia con la hora actual supera 5 minutos, se considera vehículo fuera de servicio o con señal perdida.

### Lógica sugerida
- `UPSERT` por `codigo_unidad` para no crear múltiples filas por unidad.
- `UPDATE` de `latitud`, `longitud`, `en_ruta`, `ultima_actualizacion`.
- Validar que la posición sea real antes de guardar.
- Filtrar coordenadas inválidas o muy repetitivas.

### Tareas concretas
- Definir un flujo de envío con `supabase.from('unidades_transporte').upsert(payload)`.
- Configurar `ultima_actualizacion` con `new Date().toISOString()`.
- Incluir campo `en_ruta` para reflejar estado operativo del vehículo.
- Preparar validaciones para GPS no disponible o permisos denegados.

### Entregables
- Script de sincronización listos para ser consumidos por el chofer.
- Documentación del esquema de datos.
- Reglas de actualización y validación por fila.

## 9. Fase 3 – Implementación de la vista del chofer

### Objetivo
Construir la pantalla del conductor para iniciar/detener emisión GPS y publicar la latitud/longitud al backend.

### Ruta
- `/chofer`

### Funcionalidades requeridas
- Autenticación mínima o código de activación para evitar emisiones falsas.
- Botón de cambio de estado:
  - `Iniciar Ruta`
  - `Detener Ruta`
- Pantalla con estado visible:
  - Verde: transmitiendo
  - Rojo: detenido / sin señal
- `navigator.geolocation.watchPosition` cada 3 a 5 segundos.
- Manejo de errores:
  - Permisos denegados
  - GPS no disponible
  - Cámara/temporal no activa
- Guardado en Supabase con payload estructurado.

### Payload recomendado

```json
{
  "codigo_unidad": "BUS-12",
  "latitud": 17.9878,
  "longitud": -94.5429,
  "en_ruta": true,
  "ultima_actualizacion": "2026-08-28T12:00:00.000Z"
}
```

### Lógica de UI recomendada
- Al pulsar `Iniciar Ruta`:
  - pedir permisos de geolocalización
  - activar `watchPosition`
  - enviar primer dato inmediato
  - cambiar estado visual a "Transmitiendo en vivo"
- Al pulsar `Detener Ruta`:
  - limpiar el watcher
  - marcar `en_ruta = false`
  - actualizar el valor final en Supabase
- Mostrar el último timestamp actualizado para depuración

### Entregables
- `chofer.html`
- `driver.js`
- `styles.css` con diseño móvil-ligero
- Flujo de permisos, estado y envío a Supabase

## 10. Fase 4 – Implementación de la vista pública con mapa

### Objetivo
Mostrar la posición actual del vehículo en un mapa para los usuarios.

### Ruta
- `/index`

### Funcionalidades requeridas
- Cargar mapa con Leaflet.js y OpenStreetMap tiles.
- Definir una ruta predeterminada del recorrido del autobús en forma de polilínea.
- Mostrar la ruta marcada en el mapa con un color distintivo y estilo visible.
- Marcar puntos clave como: terminal de salida, paradas importantes y destino final.
- Suscribirse al canal de Supabase mediante Realtime.
- Escuchar cambios de la tabla `unidades_transporte`:
  - `postgres_changes` con `event: 'UPDATE'` o `INSERT`.
- Actualizar el marcador del bus sin recargar la página.
- Al mismo tiempo, resaltar si el camión está adelantado, retrasado o fuera de la ruta esperada.
- Alertar si el último registro supera 5 minutos.
- Mostrar horarios habituales de salida de la terminal.

### Ruta predeterminada recomendada

Se recomienda guardar una `ruta_base` como un arreglo de coordenadas en formato GeoJSON o en un arreglo de puntos `[lat, lng]` para construir la polilínea. Ejemplo:

```js
const rutaPredeterminada = [
  [17.9833, -94.5489],
  [17.9850, -94.5450],
  [17.9880, -94.5405],
  [17.9902, -94.5360],
  [17.9940, -94.5320]
];
```

Esto permite dibujar en el mapa la ruta que el chofer va a recorrer y, al mismo tiempo, mostrar la posición en vivo del autobús sobre esa línea.

### Flujo técnico
1. Inicializar el mapa con centro cercano a Minatitlán.
2. Dibujar la ruta predeterminada con `L.polyline(rutaPredeterminada, { color: '#2d6cdf', weight: 5 })`.
3. Agregar marcadores de inicio y fin sobre la ruta.
4. Crear un marcador para la unidad.
5. Suscribirse a cambios de la tabla con `supabaseChannel.on('postgres_changes', ...)`.
6. Cuando llega una actualización, ejecutar:
   - parsear latitud/longitud
   - actualizar marcador con `marker.setLatLng([lat, lng])`
   - comprobar si la ubicación actual está dentro o cerca del recorrido esperado
   - actualizar la card de información
   - calcular diferencia entre ahora y `ultima_actualizacion`
7. Si la diferencia > 300 segundos, mostrar estado de señal perdida.

### Indicadores visuales
- Verde: en ruta y actualizado
- Amarillo: posible retraso
- Rojo: sin señal o no transmitiendo

### Entregables
- `index.html`
- `map.js`
- `app.js`
- Estado visual del camión y mensajes de notificación

## 11. Fase 5 – PWA, UX móvil y rendimiento

### Objetivo
Adaptar la app para dispositivos móviles y mejorar la experiencia de usuario.

### Requisitos
- Diseño responsive y mobile-first.
- Largo de pantallas optimizado para celulares.
- Botones grandes y legibles.
- Carga rápida sin librerías pesadas innecesarias.
- Compatibilidad con navegación en Safari/Chrome móvil.
- Soporte de instalación desde navegador (PWA).

### Implementación recomendada
- `manifest.webmanifest` con nombre, iconos y tema.
- `sw.js` para cache básico y carga offline de recursos esenciales.
- Uso de CSS con variables y diseño adaptable.
- Evitar consumo excesivo de batería: GPS con intervalo razonable 3-5 s.

### Entregables
- Manifest de la PWA.
- Service worker funcional.
- Ajustes visuales para móvil.
- Checklist de validación sobre iPhone/Android.

## 12. Fase 6 – QA, pruebas y validación funcional

### Objetivos
Verificar que la aplicación cumple con la experiencia esperada y que no hay fallos de sincronización.

### Casos de prueba
1. Chofer inicia ruta y aparece en mapa.
2. Chofer mueve la ubicación y el marcador se actualiza.
3. Chofer detiene ruta y el estado cambia a inactivo.
4. Usuario ve la última ubicación actualizada en el mapa.
5. GPS no disponible muestra error y no bloquea la UI.
6. Señal perdida por más de 5 minutos activa alerta.
7. La app funciona en móvil con conexión estable.
8. Los permisos del navegador se gestionan correctamente.

### Verificaciones técnicas
- Navegador solicita permisos de ubicación correctamente.
- Realtime de Supabase responde en tiempo real.
- La actualización del marcador ocurre sin recarga completa.
- La UI representa claramente estados de conexión.

### Entregables
- Matriz de pruebas.
- Correcciones de errores.
- Evidencia de funcionamiento en entorno real.

## 13. Fase 7 – Despliegue y puesta en producción

### Objetivo
Lanzar la app en entorno real con la mínima infraestructura posible.

### Plan de despliegue
1. Desplegar frontend en Netlify o Vercel.
2. Asegurar que la app se sirva bajo HTTPS.
3. Probar la geolocalización en producción.
4. Verificar que el dominio tiene SSL válido.
5. Confirmar acceso desde móvil con geolocalización habilitada.
6. Hacer pruebas finales con una unidad real o emulación.

### Recomendaciones finales
- Mantener registro de latitud/longitud para auditoría.
- Considerar una capa de validación y seguridad en Supabase.
- Documentar cómo activar/desactivar la emisión del chofer.
- Preparar una fase 2 con historial de recorridos si se requiere.

## 14. Requisitos de aceptación del MVP

### MVP aceptado si:
- El chofer puede iniciar y detener su emisión desde el navegador.
- La ubicación se actualiza en Supabase cada 3-5 segundos.
- El usuario puede ver el camión en un mapa en vivo.
- El sistema identifica cuando la posición está obsoleta.
- La app funciona en móvil y no requiere instalación nativa.
- El proyecto corre con infraestructura gratuita.

## 15. Riesgos y mitigaciones

### Riesgo 1: permisos de geolocalización
- Mitigación: explicar al usuario por qué se solicita acceso y manejar errores con mensajes claros.

### Riesgo 2: GPS no exacto o fluctuante
- Mitigación: filtrar lecturas inválidas y no enviar cambios insignificantes.

### Riesgo 3: Supabase Realtime con latencia
- Mitigación: usar updates frecuentes pero no excesivos; limitar cantidad de eventos.

### Riesgo 4: una unidad falsa emite datos
- Mitigación: activar autenticación básica o código de acceso por unidad.

### Riesgo 5: usuarios ven ubicación desactualizada
- Mitigación: calcular la diferencia de tiempo y alertarlo visualmente.

## 16. Roadmap recomendado

### Fase 1: MVP funcional (1-2 semanas)
- Configuración de Supabase
- `chofer.html` funcionando
- `index.html` mostrando el mapa
- Estado básico de viaje y actualización en vivo

### Fase 2: Hardening (1 semana)
- Mejoras de UX
- Validación de GPS
- Indicadores de señal y tiempos
- PWA y mejoras de rendimiento

### Fase 3: Escala y mejora (opcional)
- Historial de recorrido
- Múltiples líneas o unidades
- Notificaciones de llegada
- Mapa con rutas esperadas y paradas

## 17. Checklist de implementación final

- [ ] Crear proyecto estático base
- [ ] Configurar Supabase y la tabla `unidades_transporte`
- [ ] Habilitar Realtime
- [ ] Implementar vista `/chofer`
- [ ] Implementar vista `/index`
- [ ] Conectar Leaflet al mapa
- [ ] Suscribirse a cambios de Supabase
- [ ] Guardar `ultima_actualizacion`
- [ ] Avisar cuando el vehículo esté sin señal
- [ ] Preparar PWA básica
- [ ] Desplegar en Netlify/Vercel
- [ ] Validar en móvil y escritorio
- [ ] Documentar uso y mantenimiento

## 18. Conclusión

La clave del proyecto es mantener una arquitectura simple, útil y económica: un navegador del chofer emite GPS, Supabase lo centraliza en vivo, y la app de usuarios lo consume con Leaflet. Este enfoque permite lanzar un MVP funcional en pocos días con infraestructura gratuita y reducir la incertidumbre del servicio para usuarios finales.

El siguiente paso real es construir lo mínimo viable en el repo: base de datos, vista de chofer, vista pública y conexión con Supabase Realtime, dejando la PWA y mejoras de UX como fase posterior.
