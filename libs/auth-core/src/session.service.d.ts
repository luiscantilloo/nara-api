import { type DocumentStore, type SessionUser } from "../../common/src";
export declare class SessionService {
    private readonly store;
    private indexesReady;
    constructor(store: DocumentStore);
    private ensureAccessLogIndexes;
    revoke(accountId: string): Promise<void>;
    logAccess(entry: {
        action: string;
        accountId?: string | null;
        email?: string | null;
        status?: number | null;
        path?: string | null;
        ip?: string | null;
    }): Promise<void>;
    loadUser(accountId: string, token?: string | null): Promise<SessionUser | null>;
}
