import { type DocumentStore, type SessionUser } from "../../common/src";
export declare class SessionService {
    private readonly store;
    constructor(store: DocumentStore);
    loadUser(accountId: string): Promise<SessionUser | null>;
}
