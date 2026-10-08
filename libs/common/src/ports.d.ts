export interface DocumentStore {
    ping(): Promise<{
        ok: boolean;
        db: string;
    }>;
    findOne(collection: string, filter: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    findMany(collection: string, filter?: Record<string, unknown>, opts?: {
        sort?: Record<string, 1 | -1>;
        limit?: number;
        skip?: number;
    }): Promise<Record<string, unknown>[]>;
    count(collection: string, filter?: Record<string, unknown>): Promise<number>;
    upsert(collection: string, filter: Record<string, unknown>, doc: Record<string, unknown>): Promise<void>;
    updateOne(collection: string, filter: Record<string, unknown>, update: Record<string, unknown>): Promise<number>;
}
