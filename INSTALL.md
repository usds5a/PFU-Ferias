# 🚀 Guía de Instalación del Servidor Central (Docker)

Esta guía detalla cómo desplegar la infraestructura central para el sistema de captación de leads. Este servidor recibirá los datos de todos los iPads de forma automática y centralizada.

## 📋 Requisitos Previos
El servidor (Linux, Windows Server o Mac) debe tener instalado:
1. **Docker**: [Instalar Docker](https://docs.docker.com/get-docker/)
2. **Docker Compose**: (Incluido en Docker Desktop para Windows/Mac)

---

## 🛠️ Paso 1: Preparación de Archivos
1. Copia toda la carpeta del proyecto al servidor.
2. Asegúrate de que los archivos `Dockerfile` y `docker-compose.yml` estén en la raíz.

---

## 🏗️ Paso 2: Despliegue con Docker
Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
docker compose up -d --build
```

Esto levantará dos servicios:
*   **App Web**: Disponible en el puerto `8080` (ej: `http://ip-del-servidor:8080`).
*   **Base de Datos (CouchDB)**: Disponible en el puerto `5984`.

---

## 🔐 Paso 3: Configuración de Seguridad y CORS (CRÍTICO)
Para que los iPads puedan enviar datos al servidor, debemos habilitar los permisos **CORS** en la base de datos central.

1. Entra al Panel de Control de la base de datos: `http://localhost:5984/_utils/`
2. Identifícate con:
    *   **Usuario:** `admin`
    *   **Contraseña:** `password` (Se recomienda cambiarla en la sección 'Config')
3. Ve a la sección **Config** (icono de engranaje) -> **CORS**.
4. Haz clic en **Enable CORS**.
5. En **Origins**, selecciona **All domains ( * )** o añade la URL/IP donde esté alojada la App.
6. En **Methods**, asegúrate de que estén todos (GET, PUT, POST, DELETE, etc.).

---

## 📱 Paso 4: Vinculación de iPads
Una vez el servidor esté corriendo:

1. El iPad debe estar en la misma red que el servidor (o el servidor debe tener una IP pública).
2. Abre la App en el iPad.
3. Entra como **Superadmin** -> Selecciona tu **Institución**.
4. Ve a **Panel Admin** -> **Configuración (Stand)**.
5. En el campo **URL del Servidor Central**, escribe la IP del servidor:
   *   Ejemplo: `http://192.168.1.50:5984`
6. Haz clic en **VINCULAR**.

Si el estado cambia a **"Conectado a Cloud"** (en verde), el iPad ya está enviando copias de seguridad en tiempo real.

---

## 📂 Gestión de Datos
Si necesitas exportar los leads de todas las instituciones a la vez:
1. Puedes entrar en `http://ip-servidor:5984/_utils/`.
2. Verás una base de datos por cada institución (ej: `pfu_leads_v2_unie`).
3. Los datos están en formato JSON, listos para ser procesados.

---

## 🐳 Comandos Útiles de Docker
*   **Ver si todo está corriendo:** `docker compose ps`
*   **Ver errores en tiempo real:** `docker compose logs -f`
*   **Detener el servidor:** `docker compose down`
*   **Reiniciar después de un cambio de código:** `docker compose up -d --build`
