# 💎 PFU Lead Capture System - Enterprise v2.0

Plataforma de marca blanca de grado profesional diseñada para la captura masiva de leads en eventos y stands, con arquitectura **Multi-tenant** y sincronización **Offline-First**.

---

## 🏗️ Arquitectura del Sistema

El sistema utiliza una arquitectura distribuida y resiliente dividida en tres capas:

### 1. Capa de Cliente (iPad / Navegador)
*   **Tecnología**: Web App (PWA) construida en Vanilla JS, HTML5 y Tailwind CSS.
*   **Offline-First**: La aplicación no depende de internet para funcionar. Utiliza **PouchDB** para la persistencia local en el almacenamiento interno del dispositivo.
*   **Cifrado Local**: Los datos se mantienen en el iPad hasta que se sincronizan o se exportan.

### 2. Capa de Sincronización (Capa "Cloud")
*   **Protocolo de Replicación**: Utiliza el protocolo de CouchDB para sincronización bidireccional.
*   **Auto-Sync**: En cuanto el dispositivo detecta conexión, "empuja" los nuevos registros al servidor central sin intervención del usuario.
*   **Detección de Conflictos**: Gestión inteligente para evitar duplicaciones si varios iPads trabajan en la misma institución.

### 3. Capa de Servidor (Infraestructura Docker)
*   **Dockerized**: Todo el sistema corre bajo contenedores Nginx (Web) y CouchDB (Database).
*   **CouchDB Central**: Actúa como cerebro del sistema, almacenando los backups de todas las instituciones de forma aislada.

---

## 👥 Sistema Multi-tenant

La aplicación es capaz de servir a múltiples clientes (instituciones) desde una misma instalación física:

*   **Detección por URL**: 
    *   `dominio.com/?inst=unie` -> Entorno aislado para UNIE.
    *   `dominio.com/?inst=itp` -> Entorno aislado para ITP.
*   **Aislamiento de Datos**: Cada institución tiene su propia base de datos (IndexedDB local y base de datos CouchDB en el servidor).
*   **Configuración Independiente**: Los logos, campos de Dynamics (Brand ID, Campus ID), áreas de conocimiento y textos legales se configuran de forma única por cliente.

---

## 🛡️ Seguridad y Protección de Datos

Hemos implementado múltiples capas de seguridad para proteger la integridad de los datos de los leads:

*   **Saneamiento XSS**: Todos los datos (nombres, emails, programas) pasan por un proceso de *escaping* (`safeHtml`) antes de mostrarse en paneles administrativos, previniendo la ejecución de scripts maliciosos.
*   **Bot Protection**:
    *   **Honeypot**: Campo trampa invisible para humanos que invalida el envío si un bot lo rellena.
    *   **Time-Trap**: Bloqueo de envíos realizados en menos de 3 segundos tras cargar el formulario (imposible para un humano).
*   **Acceso Controlado**: Sistema de doble contraseña (Superadmin y Admin de instancia) para proteger las configuraciones críticas.
*   **Privacidad (RGPD)**: Implementación de triple check legal con almacenamiento del texto legal aceptado en el momento exacto de la firma por el lead.

---

## 🔑 Niveles de Acceso y Claves

| Acceso | Propósito | Usuario | Contraseña |
| :--- | :--- | :--- | :--- |
| **Superadmin** | Gestión global de instituciones | `pfusuper` | `pfusuper321` |
| **Admin Panel** | Configuración de logos, programas y sincronización | - | `pfu321` |
| **Borrado Masivo** | Limpieza total de base de datos local y cloud | - | `godmode` |
| **CouchDB** | Acceso a base de datos de bajo nivel (Fauxton) | `admin` | `password` (Recomendado cambiar) |

---

## 📊 Exportación e Integración (Atenea / Dynamics)

El sistema genera archivos Excel listos para la ingesta en sistemas CRM (Atenea / Dynamics 365) incluyendo metadatos técnicos:
*   **Brand ID** configurable por cliente.
*   **Campus ID** configurable por cliente.
*   **RGPD ID** para vinculación legal automática.
*   **Control de Consentimientos** específicos para fines comerciales y cesión a terceros.

---

## 🚀 Despliegue y Mantenimiento

Para instrucciones detalladas sobre cómo levantar el servidor en una nueva infraestructura, consulte el archivo **[INSTALL.md](./INSTALL.md)**.

*Resumen rápido:*
```bash
docker compose up -d --build
```
Acceso App: `http://localhost:8080`
Acceso DB: `http://localhost:5984/_utils/`

---
*PFU - Lead Capture Architecture v2.0*
