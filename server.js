const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { JsonRepository } = require('./repositories/jsonRepository');

const app = express();
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, '.data');
const SESSION_COOKIE = 'hotel_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map();

const usersRepository = new JsonRepository(path.join(DATA_DIR, 'users.json'));
const roomsRepository = new JsonRepository(path.join(DATA_DIR, 'rooms.json'));
const bookingsRepository = new JsonRepository(path.join(DATA_DIR, 'bookings.json'));
const paymentsRepository = new JsonRepository(path.join(DATA_DIR, 'payments.json'));

app.set('trust proxy', 1);
app.use(express.json());

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function apiError(statusCode, code, message) {
    const error = new Error(message || code);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}

function parseCookies(header = '') {
    return header.split(';').reduce((result, part) => {
        const index = part.indexOf('=');
        if (index === -1) return result;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (key) result[key] = decodeURIComponent(value);
        return result;
    }, {});
}

function setSessionCookie(req, res, token) {
    const secure = req.secure || req.get('x-forwarded-proto') === 'https';
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}`);
}

function clearSessionCookie(req, res) {
    const secure = req.secure || req.get('x-forwarded-proto') === 'https';
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    if (!stored || !stored.includes(':')) return false;
    const [salt, expected] = stored.split(':');
    const actual = crypto.scryptSync(password, salt, 64);
    const expectedBuffer = Buffer.from(expected, 'hex');
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function publicUser(user) {
    return {
        user_id: user.user_id,
        full_name: user.full_name,
        phone: user.phone || '',
        document: user.document || '',
        email: user.email,
        role_code: user.role_code,
    };
}

async function getCurrentUser(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        if (session) sessions.delete(token);
        return null;
    }
    const users = await usersRepository.getAll();
    return users.find((user) => user.user_id === session.userId) || null;
}

async function requireUser(req, role) {
    const user = await getCurrentUser(req);
    if (!user) throw apiError(401, 'unauthorized', 'Потрібна авторизація.');
    if (role && user.role_code !== role) throw apiError(403, 'forbidden', 'Недостатньо прав.');
    return user;
}

function nextId(items, key) {
    return items.reduce((max, item) => Math.max(max, Number(item[key]) || 0), 0) + 1;
}

function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function nightsBetween(checkIn, checkOut) {
    return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000);
}

function validateDates(checkIn, checkOut) {
    if (!validDate(checkIn) || !validDate(checkOut) || nightsBetween(checkIn, checkOut) <= 0) {
        throw apiError(400, 'invalid_dates', 'Дата виїзду повинна бути пізніше дати заїзду.');
    }
}

function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && aEnd > bStart;
}

function roomView(room) {
    return {
        room_id: room.room_id,
        room_number: room.room_number,
        room_type: room.room_type,
        nightly_price: room.nightly_price,
        capacity: room.capacity,
        status: room.status,
    };
}

async function bookingView(booking) {
    const [rooms, users, payments] = await Promise.all([
        roomsRepository.getAll(),
        usersRepository.getAll(),
        paymentsRepository.getAll(),
    ]);
    const room = rooms.find((item) => item.room_id === booking.room_id);
    const guest = users.find((item) => item.user_id === booking.guest_id);
    const paidAmount = payments
        .filter((payment) => payment.booking_id === booking.booking_id && payment.status === 'paid')
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return {
        booking_id: booking.booking_id,
        room_id: booking.room_id,
        guest_id: booking.guest_id,
        check_in_date: booking.check_in_date,
        check_out_date: booking.check_out_date,
        adults: booking.adults,
        children: booking.children,
        comment: booking.comment || '',
        status: booking.status,
        total_price: booking.total_price,
        paid_amount: paidAmount,
        room_number: room?.room_number || '',
        room_type: room?.room_type || '',
        guest_name: guest?.full_name || '',
    };
}

async function seedData() {
    const rooms = await roomsRepository.getAll();
    if (!rooms.length) {
        const seedRooms = [
            { id: 1, room_id: 1, room_number: '101', room_type: 'Standart', nightly_price: 1200, capacity: 2, status: 'available' },
            { id: 2, room_id: 2, room_number: '102', room_type: 'Standart', nightly_price: 1350, capacity: 3, status: 'available' },
            { id: 3, room_id: 3, room_number: '103', room_type: 'Standart', nightly_price: 1450, capacity: 4, status: 'available' },
            { id: 4, room_id: 4, room_number: '201', room_type: 'Lux', nightly_price: 2400, capacity: 2, status: 'available' },
            { id: 5, room_id: 5, room_number: '202', room_type: 'Lux', nightly_price: 2700, capacity: 3, status: 'available' },
            { id: 6, room_id: 6, room_number: '203', room_type: 'Lux', nightly_price: 3100, capacity: 4, status: 'available' },
            { id: 7, room_id: 7, room_number: '301', room_type: 'Deluxe', nightly_price: 3900, capacity: 2, status: 'available' },
            { id: 8, room_id: 8, room_number: '302', room_type: 'Deluxe', nightly_price: 4300, capacity: 3, status: 'available' },
            { id: 9, room_id: 9, room_number: '401', room_type: 'Family', nightly_price: 3600, capacity: 5, status: 'available' },
            { id: 10, room_id: 10, room_number: '402', room_type: 'Family', nightly_price: 4100, capacity: 6, status: 'available' },
            { id: 11, room_id: 11, room_number: '501', room_type: 'Suite', nightly_price: 5200, capacity: 2, status: 'available' },
            { id: 12, room_id: 12, room_number: '502', room_type: 'Suite', nightly_price: 5900, capacity: 4, status: 'available' },
        ];
        for (const room of seedRooms) await roomsRepository.create(room);
    }

    const users = await usersRepository.getAll();
    if (!users.some((user) => user.email === 'admin@hotel.local')) {
        const userId = nextId(users, 'user_id');
        await usersRepository.create({
            id: userId,
            user_id: userId,
            full_name: 'Administrator',
            phone: '',
            document: '',
            email: 'admin@hotel.local',
            password_hash: hashPassword('HotelAdmin!2026'),
            role_code: 'admin',
            created_at: new Date().toISOString(),
        });
    }
}

app.get('/api/auth/me', asyncRoute(async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) throw apiError(401, 'unauthorized', 'Потрібна авторизація.');
    res.json({ user: publicUser(user) });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
    const fullName = String(req.body?.full_name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const document = String(req.body?.document || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!fullName || !email || !password) throw apiError(400, 'required', 'Заповніть усі обов\'язкові поля.');
    if (password.length < 6) throw apiError(400, 'short_password', 'Пароль повинен містити щонайменше 6 символів.');
    const users = await usersRepository.getAll();
    if (users.some((user) => user.email === email || (document && user.document === document))) {
        throw apiError(409, 'duplicate', 'Користувач вже існує.');
    }
    const userId = nextId(users, 'user_id');
    const user = {
        id: userId,
        user_id: userId,
        full_name: fullName,
        phone,
        document,
        email,
        password_hash: hashPassword(password),
        role_code: 'guest',
        created_at: new Date().toISOString(),
    };
    await usersRepository.create(user);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
    setSessionCookie(req, res, token);
    res.status(201).json({ user: publicUser(user), role: 'guest' });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const users = await usersRepository.getAll();
    const user = users.find((item) => item.email === email);
    if (!user || !verifyPassword(password, user.password_hash)) {
        throw apiError(401, 'invalid_credentials', 'Невірний email або пароль.');
    }
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { userId: user.user_id, expiresAt: Date.now() + SESSION_TTL_MS });
    setSessionCookie(req, res, token);
    res.json({ user: publicUser(user), role: user.role_code });
}));

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) sessions.delete(token);
    clearSessionCookie(req, res);
    res.status(204).end();
}));

app.get('/api/rooms', asyncRoute(async (req, res) => {
    const checkIn = String(req.query.check_in || '');
    const checkOut = String(req.query.check_out || '');
    const capacity = Number(req.query.capacity || 1);
    const query = String(req.query.destination || '').trim().toLowerCase();
    validateDates(checkIn, checkOut);
    if (!Number.isInteger(capacity) || capacity < 1) throw apiError(400, 'invalid_guests', 'Некоректна кількість гостей.');
    const [rooms, bookings] = await Promise.all([roomsRepository.getAll(), bookingsRepository.getAll()]);
    const result = rooms.filter((room) => {
        if (room.status !== 'available' || Number(room.capacity) < capacity) return false;
        if (query && !String(room.room_type).toLowerCase().includes(query) && !String(room.room_number).toLowerCase().includes(query)) return false;
        return !bookings.some((booking) =>
            booking.room_id === room.room_id &&
            ['pending', 'confirmed'].includes(booking.status) &&
            overlaps(checkIn, checkOut, booking.check_in_date, booking.check_out_date)
        );
    });
    res.json({ rooms: result.map(roomView) });
}));

app.get('/api/bookings', asyncRoute(async (req, res) => {
    const user = await requireUser(req, 'guest');
    const bookings = (await bookingsRepository.getAll()).filter((booking) => booking.guest_id === user.user_id);
    res.json({ bookings: await Promise.all(bookings.map(bookingView)) });
}));

app.post('/api/bookings', asyncRoute(async (req, res) => {
    const user = await requireUser(req, 'guest');
    const roomId = Number(req.body?.room_id);
    const checkIn = String(req.body?.check_in || '');
    const checkOut = String(req.body?.check_out || '');
    const adults = Number(req.body?.adults);
    const children = Number(req.body?.children || 0);
    const comment = String(req.body?.comment || '').trim();
    validateDates(checkIn, checkOut);
    if (!Number.isInteger(adults) || adults < 1 || !Number.isInteger(children) || children < 0) {
        throw apiError(400, 'invalid_guests', 'Некоректна кількість гостей.');
    }
    const [rooms, bookings] = await Promise.all([roomsRepository.getAll(), bookingsRepository.getAll()]);
    const room = rooms.find((item) => item.room_id === roomId);
    if (!room) throw apiError(404, 'not_found', 'Номер не знайдено.');
    if (room.status !== 'available' || Number(room.capacity) < adults + children) throw apiError(409, 'room_unavailable', 'Номер недоступний.');
    if (bookings.some((booking) => booking.room_id === roomId && ['pending', 'confirmed'].includes(booking.status) && overlaps(checkIn, checkOut, booking.check_in_date, booking.check_out_date))) {
        throw apiError(409, 'room_overlap', 'Номер уже зайнятий на вибрані дати.');
    }
    const bookingId = nextId(bookings, 'booking_id');
    const booking = {
        id: bookingId,
        booking_id: bookingId,
        guest_id: user.user_id,
        room_id: roomId,
        check_in_date: checkIn,
        check_out_date: checkOut,
        adults,
        children,
        comment,
        status: 'pending',
        total_price: Number(room.nightly_price) * nightsBetween(checkIn, checkOut),
        created_at: new Date().toISOString(),
    };
    await bookingsRepository.create(booking);
    res.status(201).json({ booking: await bookingView(booking) });
}));

app.post('/api/bookings/:id/cancel', asyncRoute(async (req, res) => {
    const user = await requireUser(req, 'guest');
    const bookingId = Number(req.params.id);
    const bookings = await bookingsRepository.getAll();
    const booking = bookings.find((item) => item.booking_id === bookingId && item.guest_id === user.user_id);
    if (!booking) throw apiError(404, 'not_found', 'Бронювання не знайдено.');
    if (!['pending', 'confirmed'].includes(booking.status)) throw apiError(409, 'not_cancellable', 'Бронювання не можна скасувати.');
    const hoursUntilCheckIn = (Date.parse(`${booking.check_in_date}T00:00:00Z`) - Date.now()) / 3600000;
    if (hoursUntilCheckIn < 24) throw apiError(409, 'too_late', 'До заїзду залишилося менше 24 годин.');
    const updated = { ...booking, status: 'cancelled', updated_at: new Date().toISOString() };
    await bookingsRepository.update(booking.id, updated);
    res.json({ booking: await bookingView(updated) });
}));

app.post('/api/bookings/:id/status', asyncRoute(async (req, res) => {
    await requireUser(req, 'admin');
    const bookingId = Number(req.params.id);
    const status = String(req.body?.status || '');
    if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) throw apiError(400, 'invalid_status', 'Некоректний статус.');
    const bookings = await bookingsRepository.getAll();
    const booking = bookings.find((item) => item.booking_id === bookingId);
    if (!booking) throw apiError(404, 'not_found', 'Бронювання не знайдено.');
    const updated = { ...booking, status, updated_at: new Date().toISOString() };
    await bookingsRepository.update(booking.id, updated);
    res.json({ booking: await bookingView(updated) });
}));

app.post('/api/rooms/:id/status', asyncRoute(async (req, res) => {
    await requireUser(req, 'admin');
    const roomId = Number(req.params.id);
    const status = String(req.body?.status || '');
    if (!['available', 'maintenance', 'inactive'].includes(status)) throw apiError(400, 'invalid_status', 'Некоректний статус.');
    const rooms = await roomsRepository.getAll();
    const room = rooms.find((item) => item.room_id === roomId);
    if (!room) throw apiError(404, 'not_found', 'Номер не знайдено.');
    const updated = { ...room, status };
    await roomsRepository.update(room.id, updated);
    res.json({ room: roomView(updated) });
}));

app.post('/api/bookings/:id/pay', asyncRoute(async (req, res) => {
    await requireUser(req, 'admin');
    const bookingId = Number(req.params.id);
    const amount = Number(req.body?.amount);
    const method = String(req.body?.method || '');
    const status = String(req.body?.status || '');
    if (!Number.isFinite(amount) || amount <= 0 || !['card', 'cash', 'transfer'].includes(method) || !['paid', 'pending', 'failed', 'refunded'].includes(status)) {
        throw apiError(400, 'invalid_payment', 'Некоректні дані платежу.');
    }
    const bookings = await bookingsRepository.getAll();
    if (!bookings.some((booking) => booking.booking_id === bookingId)) throw apiError(404, 'not_found', 'Бронювання не знайдено.');
    const payments = await paymentsRepository.getAll();
    const paymentId = nextId(payments, 'payment_id');
    const payment = {
        id: paymentId,
        payment_id: paymentId,
        booking_id: bookingId,
        amount: Number(amount.toFixed(2)),
        method,
        status,
        created_at: new Date().toISOString(),
    };
    await paymentsRepository.create(payment);
    res.status(201).json({ payment });
}));

app.get('/api/admin/overview', asyncRoute(async (req, res) => {
    await requireUser(req, 'admin');
    const [rooms, bookings, users, payments] = await Promise.all([
        roomsRepository.getAll(),
        bookingsRepository.getAll(),
        usersRepository.getAll(),
        paymentsRepository.getAll(),
    ]);
    const bookingViews = await Promise.all(bookings.map(bookingView));
    const paidTotal = payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    res.json({
        rooms: rooms.map(roomView),
        bookings: bookingViews,
        payments,
        stats: {
            guest_count: users.filter((user) => user.role_code === 'guest').length,
            paid_total: Number(paidTotal.toFixed(2)),
        },
    });
}));

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Route не знайдено.' });
});

app.use('/CSS', express.static(path.join(ROOT_DIR, 'CSS')));
app.use('/JS', express.static(path.join(ROOT_DIR, 'JS')));
app.use('/images', express.static(path.join(ROOT_DIR, 'images')));

const pages = new Map([
    ['/', 'index.html'],
    ['/index', 'index.html'],
    ['/index.html', 'index.html'],
    ['/login', 'login.html'],
    ['/login.html', 'login.html'],
    ['/register', 'register.html'],
    ['/register.html', 'register.html'],
    ['/bookings', 'bookings.html'],
    ['/bookings.html', 'bookings.html'],
    ['/admin', 'admin.html'],
    ['/admin.html', 'admin.html'],
]);

app.get([...pages.keys()], (req, res) => {
    res.sendFile(path.join(ROOT_DIR, pages.get(req.path)));
});

app.use((req, res) => {
    res.status(404).send('Сторінку не знайдено');
});

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        res.status(400).json({ error: 'invalid_json', message: 'Некоректний JSON у тілі запиту.' });
        return;
    }
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
        error: error.code || 'server_error',
        message: statusCode >= 500 ? 'Внутрішня помилка сервера.' : error.message,
    });
});

async function loadEnv(filePath) {
    try {
        const raw = await fs.readFile(filePath, 'utf-8');
        raw.split(/\r?\n/).forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const separator = trimmed.indexOf('=');
            if (separator === -1) return;
            const key = trimmed.slice(0, separator).trim();
            const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
            if (key && process.env[key] === undefined) process.env[key] = value;
        });
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

async function start() {
    await loadEnv(path.join(ROOT_DIR, '.env'));
    await seedData();
    const port = Number(process.env.PORT) || 3000;
    app.listen(port, () => {
        console.log(`Server started on http://localhost:${port}`);
    });
}

if (require.main === module) {
    start().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = app;
