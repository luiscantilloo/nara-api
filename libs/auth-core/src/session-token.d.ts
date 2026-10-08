export declare const SESSION_COOKIE = "nara_sid";
export declare const SESSION_MAX_AGE_SEC: number;
export declare function signSessionToken(accountId: string, maxAgeSec?: number): string;
export declare function verifySessionToken(token: string | null | undefined): string | null;
