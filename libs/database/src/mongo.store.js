"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoStore = void 0;
const common_1 = require("@nestjs/common");
const mongodb_1 = require("mongodb");
let MongoStore = class MongoStore {
    client = null;
    db = null;
    async ensure() {
        if (this.db)
            return this.db;
        const uri = process.env.MONGODB_URI;
        if (!uri)
            throw new Error('Falta MONGODB_URI');
        const dbName = process.env.MONGODB_DB || 'nara';
        this.client = new mongodb_1.MongoClient(uri);
        await this.client.connect();
        this.db = this.client.db(dbName);
        return this.db;
    }
    async onModuleDestroy() {
        await this.client?.close();
    }
    async ping() {
        const db = await this.ensure();
        await db.command({ ping: 1 });
        return { ok: true, db: db.databaseName };
    }
    async findOne(collection, filter) {
        const db = await this.ensure();
        const doc = await db.collection(collection).findOne(filter);
        return doc ? doc : null;
    }
    async findMany(collection, filter = {}, opts) {
        const db = await this.ensure();
        let cursor = db.collection(collection).find(filter);
        if (opts?.sort)
            cursor = cursor.sort(opts.sort);
        if (opts?.skip)
            cursor = cursor.skip(opts.skip);
        if (opts?.limit)
            cursor = cursor.limit(opts.limit);
        return (await cursor.toArray());
    }
    async count(collection, filter = {}) {
        const db = await this.ensure();
        return db.collection(collection).countDocuments(filter);
    }
    async upsert(collection, filter, doc) {
        const db = await this.ensure();
        await db.collection(collection).updateOne(filter, { $set: doc }, { upsert: true });
    }
    async updateOne(collection, filter, update) {
        const db = await this.ensure();
        const r = await db.collection(collection).updateOne(filter, update);
        return r.modifiedCount;
    }
};
exports.MongoStore = MongoStore;
exports.MongoStore = MongoStore = __decorate([
    (0, common_1.Injectable)()
], MongoStore);
//# sourceMappingURL=mongo.store.js.map