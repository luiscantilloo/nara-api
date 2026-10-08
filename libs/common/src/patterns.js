"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServicePorts = exports.Patterns = void 0;
exports.Patterns = {
    AUTH_LOGIN: 'auth.login',
    AUTH_LOGOUT: 'auth.logout',
    AUTH_ME: 'auth.me',
    AUTH_VERIFY: 'auth.verify',
    AUTH_VERIFY_IDENTITY: 'auth.verifyIdentity',
    AUTH_RESET_PASSWORD: 'auth.resetPassword',
    PEOPLE_LIST: 'people.list',
    PEOPLE_UPSERT: 'people.upsert',
    PATIENTS_LIST: 'patients.list',
    PATIENTS_ME: 'patients.me',
    PATIENTS_MODULES: 'patients.modules',
    ACCOUNTS_LIST: 'ops.accounts.list',
    ACCOUNTS_ME: 'ops.accounts.me',
    TERRITORIES_LIST: 'ops.territories.list',
    EXPERTS_LIST: 'ops.experts.list',
    WORKLISTS: 'ops.worklists',
    FLAGS: 'ops.flags',
    ASSETS: 'ops.assets',
    ASSETS_BRACELETS: 'ops.assets.bracelets',
    ASSETS_TABLET: 'ops.assets.tablet',
    APP_STATE: 'ops.appState',
    HEALTH_DB: 'ops.health.db',
    TEO_ASK: 'ai.teo.ask',
    TEO_CHAT: 'ai.teo.chat',
};
exports.ServicePorts = {
    auth: Number(process.env.NARA_AUTH_PORT || 4001),
    people: Number(process.env.NARA_PEOPLE_PORT || 4002),
    ops: Number(process.env.NARA_OPS_PORT || 4003),
    ai: Number(process.env.NARA_AI_PORT || 4004),
    gateway: Number(process.env.PORT || process.env.NARA_GATEWAY_PORT || 4000),
};
//# sourceMappingURL=patterns.js.map