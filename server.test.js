const request = require('supertest');
const express = require('express');

const app = express();
app.use(express.json());

app.get('/api/status', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '1234') {
        return res.status(200).json({ success: true, message: 'Logged in' });
    }
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

describe('Hotel Booking API Tests', () => {
    test('POST /api/login - успешная авторизация с правильными данными', async () => {
        const response = await request(app)
            .post('/api/login')
            .send({ username: 'admin', password: '1234' });

        expect(response.statusCode).toBe(200);
        expect(response.body.success).toBe(true);
    });

    test('POST /api/login - ошибка авторизации при неверных данных', async () => {
        const response = await request(app)
            .post('/api/login')
            .send({ username: 'wrong_user', password: 'wrong_password' });

        expect(response.statusCode).toBe(401);
        expect(response.body.success).toBe(false);
    });
});