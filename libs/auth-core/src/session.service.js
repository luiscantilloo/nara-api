"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = void 0;
const common_1 = require("@nestjs/common");
const common_2 = require("../../common/src");
const common_3 = require("../../common/src");
let SessionService = class SessionService {
    store;
    constructor(store) {
        this.store = store;
    }
    async loadUser(accountId) {
        const account = await this.store.findOne('accounts', { id: accountId, status: 'Activo' });
        if (!account)
            return null;
        const roleId = String(account.roleId || '');
        const roleDoc = (await this.store.findOne('roles', { id: roleId })) ||
            common_3.NARA_ROLES.find((r) => r.id === roleId) ||
            null;
        let href = (roleDoc && 'href' in roleDoc && String(roleDoc.href)) || (0, common_2.hrefForRoleId)(roleId);
        let patientId = account.patientId ? String(account.patientId) : undefined;
        if (roleId === 'paciente') {
            const patient = (patientId ? await this.store.findOne('patients', { id: patientId }) : null) ||
                (await this.store.findOne('patients', { accountId })) ||
                null;
            if (patient?.id)
                patientId = String(patient.id);
            const profile = patient?.profile != null ? String(patient.profile) : '';
            const ready = /^P\d+$/i.test(profile);
            if (!ready)
                href = '/paciente/pendiente';
        }
        const orgType = account.orgType != null ? String(account.orgType) : undefined;
        const modules = Array.isArray(account.modules)
            ? account.modules.map((m) => String(m))
            : undefined;
        return {
            id: String(account.id),
            name: String(account.name || ''),
            email: String(account.email || ''),
            role: String(account.role || ''),
            roleId,
            terr: String(account.terr || ''),
            org: String(account.org || ''),
            contact: String(account.contact || account.email || ''),
            status: String(account.status || 'Activo'),
            href,
            nk: (0, common_2.resolveNotifKey)(roleId, String(account.id)),
            patientId,
            ...(orgType ? { orgType } : {}),
            ...(modules ? { modules } : {}),
        };
    }
};
exports.SessionService = SessionService;
exports.SessionService = SessionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(common_2.DOCUMENT_STORE)),
    __metadata("design:paramtypes", [Object])
], SessionService);
//# sourceMappingURL=session.service.js.map
