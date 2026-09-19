const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PUBLIC_DIR = path.join(__dirname);

app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use(express.static(PUBLIC_DIR, {
    extensions: ['html'],
}));

app.use('/api', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route не знайдено.',
    });
});

app.use((req, res) => {
    res.status(404).send('Сторінку не знайдено');
});

app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        res.status(400).json({
            success: false,
            error: 'Некоректний JSON у тілі запиту.',
        });
        return;
    }

    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        error: error.message || 'Внутрішня помилка сервера.',
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
            if (key && process.env[key] === undefined) {
                process.env[key] = value;
            }
        });
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
}

async function start() {
    await loadEnv(path.join(__dirname, '.env'));

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
