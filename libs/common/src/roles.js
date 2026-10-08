"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NARA_ROLES = void 0;
exports.hrefForRoleId = hrefForRoleId;
exports.resolveNotifKey = resolveNotifKey;
exports.NARA_ROLES = [
    { id: 'admin', slug: 'admin', name: 'Administrador', href: '/inicio', nk: 'admin' },
    { id: 'experto', slug: 'experto', name: 'Experto de campo', href: '/experto', nk: null },
    { id: 'clinico', slug: 'clinico', name: 'Clínico', href: '/clinico', nk: 'clin' },
    { id: 'paciente', slug: 'paciente', name: 'Paciente', href: '/paciente', nk: null },
    { id: 'observador', slug: 'observador', name: 'Observador', href: '/observador', nk: null },
];
function hrefForRoleId(roleId) {
    return exports.NARA_ROLES.find((r) => r.id === roleId)?.href || '/ingreso';
}
function resolveNotifKey(roleId, accountId) {
    const role = exports.NARA_ROLES.find((r) => r.id === roleId);
    if (!role)
        return accountId;
    if (role.nk)
        return role.nk;
    return accountId;
}
//# sourceMappingURL=roles.js.map