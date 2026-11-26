# Mi armario

Aplicación estática de uso sencillo para guardar y organizar un catálogo personal de ropa. Usa HTML, CSS y JavaScript Vanilla; Supabase almacena los datos y las fotografías. No hay cuentas, registro, contraseñas, correos ni servidor propio.

> **Importante: esta versión no es privada.** Para quitar el inicio de sesión, Supabase permite que cualquier persona con la URL consulte, añada, cambie o elimine perfiles, prendas, secciones, ajustes e imágenes. El aviso también aparece dentro de la aplicación. No guardes información que no quieras hacer pública. Un repositorio privado de GitHub no protege la web publicada ni la base de datos.

## Configuración de Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com). No hace falta configurar Authentication, correos ni SMTP.
2. Ejecuta el `schema.sql` completo en **SQL Editor**. El esquema configura las tablas y políticas públicas, y el bucket privado `wardrobe-images` con un límite de 15 MB y formatos JPG, PNG y WebP.
3. En **Project Settings → API**, copia la Project URL y la clave pública `anon`/`publishable` en [config.js](./config.js). La URL debe ser `https://<project-ref>.supabase.co`, sin `/rest/v1/`.
4. No uses una clave `service_role`/secret. La clave pública no protege los datos: las políticas del esquema son intencionalmente abiertas para permitir el uso sin iniciar sesión.

El esquema no borra filas, pero cambia las políticas para que las operaciones sean públicas y elimina las referencias de propietario a Supabase Auth. Añade los campos de tipo, color y talla a las prendas existentes, usando “Sin especificar” como tipo en registros antiguos. Conserva el identificador del perfil existente y la app lo reutiliza para nuevas filas; una instalación nueva crea el perfil interno automáticamente con un identificador fijo que no es secreto. Si tienes varias estructuras antiguas o el SQL muestra un error, no publiques la app hasta resolverlo.

## Probar localmente

Desde PowerShell, en la carpeta del proyecto:

```powershell
python -m http.server 8000
```

Abre `http://localhost:8000`. La aplicación abre directamente el armario; no tienes que crear ningún perfil. Si la base de datos aún no tiene el registro interno que necesita el modelo de datos, la app lo crea automáticamente. Si ya tenías prendas, conserva el perfil y contenido existentes.

## Uso

- **Categorías:** crea las categorías que quieras, añade portadas, cambia su orden y ocúltalas. También puedes crear una categoría desde el formulario de una prenda.
- **Prendas:** añade nombre, tipo, categoría, color, talla, precio, enlace, descripción y varias fotos. Puedes ordenar fotos, elegir la principal y marcar favoritos.
- **Filtros:** busca por nombre y filtra por categoría, tipo, color, talla o favoritos; también puedes ordenar por fecha, precio o nombre.
- **Favoritos:** filtra tus prendas favoritas.
- **Configuración:** elige entre nueve estilos visuales, incluidos seis oscuros (grafito nocturno, bosque nocturno, azul medianoche, café nocturno, ciruela nocturna y arena nocturna), o uno de los claros suavizados (claro suave, lima suave o azul gris claro). El grafito nocturno es el estilo inicial. También puedes seleccionar un sonido (campanilla, gota, madera, cristal o pulso cálido) y activar o desactivar el sonido de los botones. Por las restricciones del navegador, el sonido empieza después del primer clic y solo se reproduce al pasar el ratón.
- Las fotos se comprimen en el navegador cuando es posible. Se aceptan JPG, PNG y WebP; convierte HEIC antes de subirlo.
- Las operaciones de borrado solicitan confirmación.

El mensaje **“cualquiera con esta URL puede ver, editar o borrar el armario”** es literal: no hay contraseña, autenticación ni control por propietario. Ocultar secciones o prendas solo las quita de la vista normal; no impide que alguien consulte los datos directamente en Supabase.

## Publicar

1. Sube el proyecto a un repositorio privado si así lo prefieres.
2. Despliega la raíz en Cloudflare Pages, o usa GitHub Pages si tu plan permite publicar desde un repositorio privado.
3. Copia la URL HTTPS publicada para abrirla desde el teléfono.

La URL publicada será accesible a cualquier persona. Si más adelante quieres que el armario sea realmente privado, habrá que volver a añadir autenticación o proteger el sitio con un servicio de acceso; no basta con ocultar el enlace.

## Verificación

La interfaz estática y la sintaxis de JavaScript se pueden comprobar localmente. No se pueden confirmar desde aquí las políticas y las subidas reales del proyecto Supabase; tras ejecutar el SQL, prueba crear una sección, subir una imagen y borrar un elemento.
