# Используем легкий образ Node.js
FROM node:18-alpine

# Создаем рабочую директорию внутри контейнера
WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY . .

# Собираем TypeScript в JavaScript (убедитесь, что в package.json есть скрипт "build")
RUN npm run build

# Открываем порт
EXPOSE 8000

# Запускаем сервер (из папки dist после билда)
CMD ["node", "dist/index.js"]