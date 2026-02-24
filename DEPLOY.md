# 🚀 GUÍA DE DESPLIEGUE EN GITHUB PAGES

Esta aplicación está diseñada para hospedarse de forma gratuita y segura en **GitHub Pages**.

## 📦 Paso 1: Subir el código a GitHub

Si aun no has subido el código a un repositorio:

1. Crea un nuevo repositorio en [GitHub.com](https://github.com/new).
   - Nombre: `unie-lead-capture` (o el que prefieras).
   - **Importante**: Puede ser Público o Privado. (Pages funciona en ambos, pero Privado requiere cuenta Pro en algunos casos; para cuentas gratuitas suele requerir repositorio Público).

2. Abre una terminal en la carpeta de tu proyecto y ejecuta:

```bash
# Inicializa git si no lo has hecho
git init

# Añade todos los archivos
git add .

# Haz el primer commit
git commit -m "Versión inicial lista para despliegue"

# Renombra la rama a main (estándar moderno)
git branch -M main

# Conecta con tu repositorio (cambia TU_USUARIO por tu nombre real)
git remote add origin https://github.com/TU_USUARIO/unie-lead-capture.git

# Sube los cambios
git push -u origin main
```

## ⚙️ Paso 2: Activar GitHub Pages

1. Ve a la página de tu repositorio en GitHub.
2. Haz clic en la pestaña **Settings** (Configuración).
3. En el menú lateral izquierdo, busca la sección "Code and automation" y haz clic en **Pages**.
4. En "Build and deployment" > **Source**, selecciona **Deploy from a branch**.
5. En **Branch**, selecciona `main` y la carpeta `/ (root)`.
6. Haz clic en **Save**.

## ✅ Paso 3: Verificar

GitHub tardará unos segundos (o minutos) en construir el sitio.
Refresca la página de Settings > Pages. Verás un mensaje en la parte superior:

> **Your site is live at...**  
> `https://tu-usuario.github.io/unie-lead-capture/`

¡Esa es la URL de tu aplicación! Copiala.

## 📱 Instalación en iPad / iPhone

1. Abre esa URL en **Safari** desde el iPad.
2. Pulsa el botón **Compartir** (icono cuadrado con flecha hacia arriba).
3. Busca y selecciona **"Añadir a pantalla de inicio"**.
4. Pulsa **Añadir**.

La app aparecerá en tu pantalla de inicio con el icono y nombre configurados, lista para funcionar a pantalla completa.

## 🔄 Cómo actualizar

Cuando hagas cambios en el código:
1. `git add .`
2. `git commit -m "Descripción de cambios"`
3. `git push`

GitHub Pages detectará el cambio y actualizará la web automáticamente en 1-2 minutos.
