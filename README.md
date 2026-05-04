# Image Labeling Platform

## Установка и запуск

1. Установите зависимости:
   ```bash
   pip install -r requirements.txt
   ```

2. Запустите бэкенд:
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

3. Запустите фронтенд:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Проверка работоспособности

После запуска обоих серверов откройте браузер и перейдите на http://localhost:5173/
## Дополнительная информация

Проект использует FastAPI для бэкенда и React для фронтенда. Для работы с изображениями и аннотациями используется Canvas API.