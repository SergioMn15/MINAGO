# ✅ Deployment Guide: Multi-Unit Bus Tracking System

## 📋 Resumen de lo que ya está listo

### Frontend (JavaScript)
- ✅ [chofer.html](chofer.html): Panel del chofer con selector de ruta y sentido
- ✅ [assets/js/driver.js](assets/js/driver.js): Envía `codigo_unidad`, `ruta_actual`, `sentido` a Supabase
- ✅ [assets/js/map.js](assets/js/map.js): Muestra múltiples buses activos simultáneamente
  - Cada bus tiene su propio marcador en `busMarkersByUnit`
  - Popup muestra: código de unidad, ruta real, sentido, última actualización
  - Desaparece cuando `en_ruta = false` o sin señal por >5 minutos

### Verificación de código
```bash
node --check "c:/MINAGO/assets/js/map.js"   # ✅ PASS
node --check "c:/MINAGO/assets/js/driver.js" # ✅ PASS
```

---

## 🚀 Pasos para ejecutar en Supabase

### 1) Abre Supabase Console
- Ve a: https://supabase.com/dashboard
- Selecciona tu proyecto
- Ve a SQL Editor

### 2) Copia todo el contenido de [sql_setup_multi_units.sql](sql_setup_multi_units.sql)
- Este archivo contiene SQL idempotente
- Puedes ejecutarlo múltiples veces sin error

### 3) Ejecuta el SQL
- Pega el contenido en el editor SQL
- Haz clic en "Run"
- Debe completarse sin errores

### 4) Verifica la estructura
En SQL Editor, ejecuta:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'unidades_transporte'
ORDER BY ordinal_position;
```

Debe mostrar:
```
codigo_unidad        | text
nombre_chofer        | text
ruta_actual          | text
sentido              | text
latitud              | numeric
longitud             | numeric
en_ruta              | boolean
color_ruta           | text
ultima_actualizacion | timestamp with time zone
```

---

## 🧪 Prueba de flujo completo

### Escenario: Dos choferes en ruta simultáneamente

#### Paso 1: Chofer 1 - BUS-12 / Ruta Azul
1. Abre [chofer.html](chofer.html) o `panel.html`
2. Ingresa código: `BUS-12`
3. Selecciona Ruta: **Ruta Azul**
4. Selecciona Sentido: **Minatitlán - Colima**
5. Haz clic en "Iniciar Ruta"
6. Acepta permiso de ubicación

#### Paso 2: Chofer 2 - BUS-13 / Ruta Amarillo (en otra pestaña o dispositivo)
1. Abre [chofer.html](chofer.html)
2. Ingresa código: `BUS-13` (cambia el input)
3. Selecciona Ruta: **Ruta Amarillo**
4. Selecciona Sentido: **Colima - Minatitlán**
5. Haz clic en "Iniciar Ruta"

#### Paso 3: Ver en mapa público [index.html](index.html)
- Deberías ver **dos marcadores** en el mapa
- Cada uno con su propia ruta y sentido
- El sidebar puede mostrar cualquier ruta pública
- El popup de cada bus muestra su ruta real asignada por el chofer

---

## 📱 Estructura de datos por unidad

Cada registro en `unidades_transporte`:
```json
{
  "codigo_unidad": "BUS-12",
  "nombre_chofer": null,
  "ruta_actual": "Ruta Azul",
  "sentido": "Minatitlán - Colima",
  "latitud": 19.244338,
  "longitud": -103.742154,
  "en_ruta": true,
  "color_ruta": "#1d4ed8",
  "ultima_actualizacion": "2026-08-31T03:45:00Z"
}
```

---

## 🔧 Configuración en chofer.html

### Seleccionar nuevas unidades
En [chofer.html](chofer.html), el input `#unitCode` es editable:
```html
<input id="unitCode" type="text" value="BUS-12" />
```

Cambiar a `BUS-13`, `BUS-14`, etc. para adicionales.

### Credenciales (opcional)
En [assets/js/config.js](assets/js/config.js):
```js
DRIVER_CREDENTIALS: {
  "BUS-12": "1234",
  "BUS-13": "5678"  // Agrega acá
}
```

---

## ✅ Checklist final

- [ ] SQL ejecutado sin errores en Supabase
- [ ] Tabla `unidades_transporte` existe y tiene todas las columnas
- [ ] Política `allow_insert_unidades`, `allow_update_unidades`, `allow_select_unidades` existen
- [ ] Chofer 1 inicia ruta desde [chofer.html](chofer.html)
- [ ] Chofer 2 inicia ruta (diferente unidad, ruta, sentido)
- [ ] Mapa público muestra dos buses
- [ ] Cada popup muestra ruta real (no la del sidebar)
- [ ] Cuando un bus detiene, desaparece del mapa

---

## 🎯 Siguiente fase (opcional)

Cuando esto funcione, puedes:
1. Agregar más unidades con credenciales diferentes
2. Mejorar UI/UX del panel del chofer
3. Agregar historial de rutas completadas
4. Analytics de tiempos y frecuencias
