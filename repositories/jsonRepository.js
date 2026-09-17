const fs = require('fs/promises');
const path = require('path');

class RepositoryError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.name = 'RepositoryError';
        this.statusCode = statusCode;
    }
}

class JsonRepository {
    constructor(filePath) {
        this.filePath = filePath;
        this.writeQueue = Promise.resolve();
    }

    async getAll() {
        return clone(await this.readArray());
    }

    async getById(id) {
        const items = await this.readArray();
        const item = items.find((current) => current.id === id);
        return item ? clone(item) : null;
    }

    async create(item) {
        return this.transaction((items) => {
            items.push(item);
            return { items, result: item };
        });
    }

    async update(id, nextItem) {
        return this.transaction((items) => {
            const index = items.findIndex((item) => item.id === id);
            if (index === -1) {
                return { items, result: null };
            }

            items[index] = nextItem;
            return { items, result: nextItem };
        });
    }

    async delete(id) {
        return this.transaction((items) => {
            const index = items.findIndex((item) => item.id === id);
            if (index === -1) {
                return { items, result: false };
            }

            items.splice(index, 1);
            return { items, result: true };
        });
    }

    async transaction(mutator) {
        const run = this.writeQueue.then(async () => {
            const items = await this.readArray();
            const transactionResult = await mutator(clone(items));

            if (!transactionResult || !Array.isArray(transactionResult.items)) {
                throw new RepositoryError('Repository transaction must return an items array.');
            }

            await this.writeArray(transactionResult.items);
            return clone(transactionResult.result);
        });

        this.writeQueue = run.catch(() => {});
        return run;
    }

    async ensureFile() {
        try {
            await fs.access(this.filePath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }

            await fs.mkdir(path.dirname(this.filePath), { recursive: true });
            await fs.writeFile(this.filePath, '[]\n', 'utf-8');
        }
    }

    async readArray() {
        await this.ensureFile();

        let parsed;
        try {
            const raw = await fs.readFile(this.filePath, 'utf-8');
            parsed = JSON.parse(raw);
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new RepositoryError('Файл data.json пошкоджений або не містить коректний JSON масив.');
            }
            throw error;
        }

        if (!Array.isArray(parsed)) {
            throw new RepositoryError('Файл data.json повинен містити JSON масив.');
        }

        return parsed;
    }

    async writeArray(items) {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, `${JSON.stringify(items, null, 2)}\n`, 'utf-8');
    }
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

module.exports = {
    JsonRepository,
    RepositoryError,
};
