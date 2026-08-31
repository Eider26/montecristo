# FastFood POS V2

Incluye:
- Login con Supabase Auth (correo + contraseña)
- Dashboard que muestra SOLO las ventas completadas del día actual
- Ventas abiertas múltiples, guardadas en Supabase
- Confirmación de venta en una función PostgreSQL atómica
- Descuento automático de inventario
- Historial de ventas
- Corrección del método de pago con auditoría
- Informe por fecha: efectivo, tarjeta, transferencia y acumulado
- Alta de productos con precio, categoría y existencia
- Edición rápida de existencias
- RLS para bloquear acceso anónimo

## 1. Supabase
Ejecuta `supabase/schema_v2.sql` completo en SQL Editor.

Luego ve a Authentication > Users y crea al menos un usuario (correo y contraseña).
No necesitas habilitar registro público desde la web.

## 2. Variables de entorno
Crea `.env.local`:

NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...

No uses `service_role` en el frontend.

## 3. Ejecutar
npm install
npm run dev

Abre http://localhost:3000

## 4. Vercel
Sube el proyecto a GitHub, impórtalo en Vercel y agrega las mismas 2 variables de entorno.

## Nota
Las políticas actuales permiten que cualquier usuario autenticado vea ventas y administre productos. Para una siguiente etapa podemos agregar roles (Administrador/Cajero) para restringir edición de inventario, reportes y correcciones.
