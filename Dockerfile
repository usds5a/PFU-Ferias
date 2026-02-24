# Usamos una imagen ligera de Nginx para servir el contenido estático
FROM nginx:alpine

# Copiamos todos los archivos del proyecto al directorio de Nginx
COPY . /usr/share/nginx/html

# Exponemos el puerto 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
