# Próximos pasos — VíaMinatitlán

## Mejoras aplicadas (septiembre de 2026)

- Se unificó el acceso de chofer: `login.html` y `panel.html` ahora redirigen al flujo vigente.
- Las credenciales de práctica siguen disponibles, pero el navegador ya no lee la tabla de choferes ni compara contraseñas.
- Se añadió una sesión temporal revocable y funciones RPC para autenticar, enviar ubicación, detener ruta y cerrar sesión.
- Se eliminó la escritura directa de ubicaciones desde el cliente y se añadieron validaciones de sesión, unidad, ruta y coordenadas.
- El GPS ahora descarta señales imprecisas, limita envíos por tiempo/distancia y evita solicitudes simultáneas.
- Se añadió historial de recorridos y posiciones, además de la corrección del fallback de ruta y escape de contenido del popup.

> Para activar estas mejoras se debe ejecutar `sql_security_hardening.sql` en Supabase. Las tareas restantes de este documento son la evolución recomendada hacia producción.

## Estado actual

El proyecto ya cubre el flujo funcional principal: un chofer inicia sesión, comparte su ubicación con Supabase y el mapa público muestra unidades y rutas en tiempo real. La siguiente etapa debe concentrarse en reforzar seguridad, confiabilidad operativa y mantenibilidad, sin cambiar la experiencia actual.

## Prioridad 0 — Antes de abrirlo al público

### 1. Sustituir el login implementado en el navegador

**Hallazgo:** `login_chofer.html` consulta `contraseña_hash` desde el navegador y la compara allí. Además, `sql_choferes_login.sql` crea credenciales de demostración en texto plano.

**Riesgo:** cualquier visitante que pueda consultar la tabla puede obtener las contraseñas; `sessionStorage` por sí solo también se puede manipular.

**Siguiente paso:** migrar a Supabase Auth (un usuario por chofer) y conservar el perfil/las asignaciones en tablas propias. Las políticas RLS deben basarse en `auth.uid()`, no en una bandera del navegador. Eliminar las cuentas demo y rotar sus contraseñas al completar la migración.

**Criterio de terminado:** ningún `password`, `PIN`, hash ni credencial de chofer es retornado al frontend; una unidad solo puede ser actualizada por el chofer autenticado y asignado a ella.

### 2. Cerrar las políticas RLS abiertas

**Hallazgo:** `sql_setup_multi_units.sql` permite `SELECT`, `INSERT` y `UPDATE` con `USING (true)` / `WITH CHECK (true)`. `sql_choferes_login.sql` permite consultar todos los choferes y asignaciones.

**Riesgo:** cualquier cliente con la clave pública puede alterar ubicaciones, activar/desactivar unidades o leer información interna.

**Siguiente paso:** separar las necesidades públicas y privadas:

- Publicar solo una vista o tabla de posiciones con los campos necesarios para el mapa.
- Permitir al público únicamente `SELECT` sobre esa vista/datos sanitizados.
- Restringir `UPDATE` de cada unidad al chofer asignado mediante RLS, o hacer la escritura a través de una Edge Function autenticada.
- Mantener datos personales, credenciales y asignaciones fuera de cualquier lectura pública.

**Criterio de terminado:** una petición anónima no puede escribir datos ni leer perfiles; una sesión de chofer no puede modificar otra unidad.

### 3. Retirar caminos de acceso heredados

**Hallazgo:** `login.html` y `panel.html` conservan acceso con PIN local (`DRIVER_CREDENTIALS`), mientras el flujo actual usa `login_chofer.html`. También hay redirecciones distintas entre `panel.html` y `login_chofer.html`.

**Siguiente paso:** elegir un único acceso de chofer, retirar o redirigir las páginas heredadas y eliminar `DRIVER_CREDENTIALS` de `assets/js/config.js`.

## Prioridad 1 — Confiabilidad del servicio

### 4. Validar y regular las posiciones GPS

**Hallazgo:** cada evento de `watchPosition` provoca un `upsert`; no hay validación de coordenadas, precisión, velocidad ni intervalo mínimo.

**Siguiente paso:** enviar solo si transcurrieron, por ejemplo, 10–15 segundos o se recorrió una distancia mínima; descartar coordenadas fuera de rango, con baja precisión o saltos físicamente imposibles. Registrar el último error de GPS y de red.

**Resultado esperado:** menor consumo de datos/base de datos y posiciones más fiables en el mapa.

### 5. Incorporar recuperación ante conectividad intermitente

**Siguiente paso:** conservar temporalmente las posiciones pendientes en IndexedDB/localStorage, reintentarlas con backoff cuando vuelva la red y mostrar estados claros: “sin GPS”, “sin conexión”, “enviando” y “última posición pendiente”. Al cerrar o recargar la página, detener de forma segura el seguimiento y, si es posible, marcar la unidad fuera de ruta.

### 6. Separar estado actual e historial

**Hallazgo:** `unidades_transporte` funciona como estado actual; al sobrescribirse no ofrece auditoría ni métricas históricas.

**Siguiente paso:** crear una tabla de sesiones de ruta y otra de posiciones históricas con retención definida. Añadir índices por `codigo_unidad` y fecha. Guardar inicio, fin, chofer, ruta, sentido y motivo de cierre.

**Resultado esperado:** historial de recorridos, incidencias y una base para estimar frecuencias/tiempos.

## Prioridad 2 — Calidad del producto y código

### 7. Corregir el fallo potencial en el popup del mapa

**Hallazgo:** `assets/js/map.js` referencia `activeRoute`, variable que no está declarada, al construir el popup. Puede generar un `ReferenceError` cuando no haya ruta en los datos ni en `sessionStorage`.

**Siguiente paso:** sustituirla por el estado existente (`busAssignedRoute` o `displayRoute`) y añadir una prueba para el caso sin ruta.

### 8. Evitar HTML con datos de la base de datos

**Hallazgo:** los valores de unidad, ruta y sentido se interpolan en `innerHTML` para los popups.

**Siguiente paso:** crear nodos DOM con `textContent` o escapar los valores antes de construir HTML. Aunque el origen previsto sea interno, esto evita que una escritura indebida se convierta en XSS.

### 9. Consolidar la interfaz y archivos

**Siguiente paso:** mover el CSS embebido de `login_chofer.html` a `assets/css/styles.css`, centralizar los scripts de autenticación y eliminar código/archivos duplicados tras la migración. Mantener una sola fuente de verdad para rutas, colores y textos.

### 10. Mejorar la experiencia de operación

- Añadir confirmación visible de que la unidad asignada está bloqueada y de que la ruta se inició/detuvo.
- Ofrecer una lista de todas las unidades activas y filtros por ruta en la vista pública.
- Añadir accesibilidad: foco visible, etiquetas coherentes, contraste y mensajes de estado anunciables.
- Mostrar la antigüedad de la señal (“hace 2 min”) además de la hora.

## Prioridad 3 — Entrega y operación continua

### 11. Crear una base mínima de calidad

**Siguiente paso:** incorporar `package.json` con scripts de validación, un linter/formateador y pruebas para la lógica pura (estado de señal, validación GPS, permisos y construcción de payload). Ejecutarlos en GitHub Actions o el proveedor de despliegue antes de publicar.

### 12. Documentar configuración y despliegue

**Siguiente paso:** añadir un `README.md` breve con arquitectura, requisitos, variables públicas permitidas, procedimiento de despliegue, migraciones SQL versionadas y plan de reversión. Actualizar las guías existentes tras cambiar autenticación y RLS; hoy describen prácticas de demo que no deben llegar a producción.

### 13. Monitorización y privacidad

**Siguiente paso:** registrar errores del cliente y de las funciones de servidor, configurar alertas básicas de disponibilidad y definir retención de ubicaciones, responsables de acceso y aviso de privacidad para choferes.

## Orden recomendado de ejecución

1. Crear respaldo y revisar las tablas/políticas actuales en Supabase.
2. Implementar Supabase Auth y RLS estricta en un entorno de prueba.
3. Retirar login/PIN heredados y credenciales demo.
4. Corregir el fallback de `activeRoute` y sanitizar el popup.
5. Añadir limitación, validación y cola de posiciones GPS.
6. Crear historial de rutas y posiciones.
7. Añadir pruebas, automatización de validaciones y documentación actualizada.
8. Desplegar gradualmente y monitorear errores antes de habilitar a todos los choferes.

## Verificación antes de producción

- [ ] Un visitante anónimo puede ver solo información pública autorizada.
- [ ] Un chofer autenticado solo modifica su unidad asignada.
- [ ] No existen contraseñas, PINs ni hashes disponibles en archivos públicos ni respuestas de base de datos.
- [ ] Un GPS sin señal o una red caída informa el estado y no pierde silenciosamente la operación.
- [ ] Las posiciones inválidas o duplicadas no se guardan.
- [ ] Cada inicio y fin de ruta queda auditable.
- [ ] Las validaciones automáticas pasan antes de cada despliegue.
