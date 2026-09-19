# HotelBook Frontend

Інтерфейс підключений до основного Node.js/PostgreSQL проєкту в `C:\Users\tomto\Downloads\Готель`.

## Запуск

```powershell
cd C:\Users\tomto\Downloads\Готель
npm start
```

Сайт: `http://127.0.0.1:5050`

Адміністратор:

- Email: `admin@hotel.local`
- Пароль: `HotelAdmin!2026`

Користувачі, паролі, номери, бронювання та платежі зберігаються у PostgreSQL. Авторизація працює через захищену серверну cookie-сесію; `localStorage` не використовується.
