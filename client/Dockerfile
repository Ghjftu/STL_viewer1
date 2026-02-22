# Этап 1: Сборка (Build)
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Собираем React приложение в папку dist
RUN npm run build

# Этап 2: Запуск (Serve) через Nginx
FROM nginx:alpine
# Копируем собранные файлы из этапа 1 в папку Nginx
COPY --from=build /app/dist /usr/share/nginx/html
# Копируем наш конфиг Nginx (создадим его ниже)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]