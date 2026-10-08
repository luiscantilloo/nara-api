export declare const NARA_ROLES: readonly [{
    readonly id: "admin";
    readonly slug: "admin";
    readonly name: "Administrador";
    readonly href: "/inicio";
    readonly nk: "admin";
}, {
    readonly id: "experto";
    readonly slug: "experto";
    readonly name: "Experto de campo";
    readonly href: "/experto";
    readonly nk: null;
}, {
    readonly id: "clinico";
    readonly slug: "clinico";
    readonly name: "Clínico";
    readonly href: "/clinico";
    readonly nk: "clin";
}, {
    readonly id: "paciente";
    readonly slug: "paciente";
    readonly name: "Paciente";
    readonly href: "/paciente";
    readonly nk: null;
}, {
    readonly id: "observador";
    readonly slug: "observador";
    readonly name: "Observador";
    readonly href: "/observador";
    readonly nk: null;
}];
export type NaraRoleId = (typeof NARA_ROLES)[number]['id'];
export declare function hrefForRoleId(roleId?: string | null): "/inicio" | "/experto" | "/clinico" | "/paciente" | "/observador" | "/ingreso";
export declare function resolveNotifKey(roleId: string | null | undefined, accountId: string): string;
export type SessionUser = {
    id: string;
    name: string;
    email: string;
    role: string;
    roleId: string;
    terr: string;
    org: string;
    contact: string;
    status: string;
    href: string;
    nk: string | null;
    patientId?: string;
    orgType?: string;
    modules?: string[];
};
