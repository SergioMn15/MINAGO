# ✅ Sistema de Login de Choferes - Guía Completa

## 🔐 Cambios principales

### Antes (viejo)
- Login por código de bus (BUS-12, BUS-13)
- Credenciales hardcodeadas en `config.js`
- No había identidad de persona

### Ahora (nuevo)
- Login con **Nombre de usuario + Contraseña**
- Choferes en tabla `choferes` de Supabase
- Cada chofer puede tener una o más unidades asignadas
- Más seguro y profesional

---

## 📋 Pasos para implementar

### 1) Ejecutar SQL en Supabase (en este orden)

**Primero:** `sql_setup_multi_units.sql`
- Crea tablas: `unidades_transporte`, `rutas`, `rutas`

**Segundo:** `sql_choferes_login.sql`  
- Crea tablas: `choferes`, `chofer_unidad_asignacion`
- Inserta 3 choferes de ejemplo
- Asigna cada chofer a una unidad

---

## 🚀 Flujo de login nuevo

1. **Usuario abre app** → `index.html` (mapa público)
2. **Hace clic en "¿Eres chofer? Inicia sesión"** → `login_chofer.html`
3. **Completa formulario:**
   - Usuario: `juan`
   - Contraseña: `password123` (la que hayas configurado)
4. **Sistema valida contra `choferes` en Supabase**
5. **Si es correcto:**
   - Guarda en sessionStorage: nombre, ID, unidad asignada
   - Redirige a `chofer.html`
6. **Panel del chofer muestra su nombre real** en lugar del código de unidad

---

## 👥 Choferes de ejemplo (en la BD)

| Nombre | Apellido | Unidad Asignada | Estado |
|--------|----------|-----------------|--------|
| Juan   | García   | BUS-12          | Activo |
| María  | López    | BUS-13          | Activo |
| Carlos | Rodríguez| BUS-14          | Activo |

**Nota:** Las contraseñas en el SQL de ejemplo son hashes. Modifica según tus necesidades.

---

## 🔧 Modificar credenciales de choferes

### Opción 1: Agregar nuevo chofer en Supabase

```sql
-- Insertar nuevo chofer
INSERT INTO public.choferes (usuario, nombre, apellido, correo, contraseña_hash, activo)
VALUES ('pedro', 'Pedro', 'Sánchez', 'pedro@viatitlan.com', 'hash_aqui', true);

-- Obtener su ID
SELECT id FROM public.choferes WHERE correo = 'pedro@viatitlan.com';

-- Asignarle una unidad (reemplaza con el ID real)
INSERT INTO public.chofer_unidad_asignacion (chofer_id, codigo_unidad)
VALUES ('uuid-del-chofer', 'BUS-15');
```

### Opción 2: Cambiar contraseña de un chofer existente

```sql
UPDATE public.choferes
SET contraseña_hash = 'nueva_contraseña_hash'
WHERE usuario = 'juan';
```

---

## 🛡️ Seguridad (IMPORTANTE para PRODUCCIÓN)

**En este MVP:**
- Las contraseñas se comparan como texto plano
- **NUNCA HAGAS ESTO EN PRODUCCIÓN**

**Para producción, implementa:**

1. **Backend Node.js/Python con bcrypt:**
```javascript
const bcrypt = require('bcrypt');

// Al guardar contraseña:
const hash = await bcrypt.hash('password123', 10);

// Al validar:
const isValid = await bcrypt.compare(passwordIngresada, hash);
```

2. **HTTPS obligatorio** en Netlify
3. **RLS (Row Level Security)** más estricto en Supabase
4. **2FA (Two-Factor Auth)** opcional

---

## 📱 Archivos nuevos/modificados

| Archivo | Cambio |
|---------|--------|
| `login_chofer.html` | ✨ NUEVO - Login profesional |
| `chofer.html` | ✏️ Modificado - Muestra nombre del chofer |
| `index.html` | ✏️ Modificado - Apunta a nuevo login |
| `sql_choferes_login.sql` | ✨ NUEVO - SQL para choferes |
| `assets/js/driver.js` | Sin cambios (compatible) |
| `assets/js/map.js` | Sin cambios (compatible) |

---

## ✅ Prueba completa del flujo

### Paso 1: Ejecutar SQL
```sql
-- En Supabase SQL Editor, ejecuta:
-- 1. sql_setup_multi_units.sql
-- 2. sql_choferes_login.sql
```

### Paso 2: Abrir app
1. Abre `http://localhost` o tu URL en Netlify
2. Haz clic en "¿Eres chofer? Inicia sesión"

### Paso 3: Login
- Usuario: `juan`
- Contraseña: la que hayas configurado en SQL

### Paso 4: Ver panel
- Debe mostrar `"Juan García"` en la cabecera
- Unidad fija: `BUS-12`
- Puedes seleccionar ruta y sentido
- Haz clic "Iniciar Ruta"

### Paso 5: Ver en mapa público
- Abre `index.html` en otra pestaña
- Deberías ver el bus BUS-12 en el mapa
- Haz clic para ver: ruta, sentido, última actualización

---

## 🎯 Próximas mejoras (opcional)

1. **Panel de admin** para gestionar choferes
2. **Historial de rutas** por chofer
3. **Notificaciones en tiempo real**
4. **Soporte para múltiples idiomas**
5. **Modo offline** para áreas sin conexión

---

## 🆘 Troubleshooting

### Error: "Usuario o contraseña incorrectos"
- Verifica que el nombre de usuario está escrito exactamente
- Revisa que la contraseña coincide con `contraseña_hash` en la BD
- En producción, usa bcrypt para validar

### Error: "No tienes unidades asignadas"
- Asegúrate de que la tabla `chofer_unidad_asignacion` tiene una fila
- Ejecuta: `SELECT * FROM chofer_unidad_asignacion WHERE chofer_id = 'id-del-chofer';`

### Panel del chofer no redirige
- Limpia sessionStorage: Abre DevTools → Application → Clear All
- Vuelve a hacer login

---

**¿Preguntas? Consulta los archivos SQL o el código en `login_chofer.html`**
