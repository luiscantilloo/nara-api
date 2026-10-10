/** Message patterns TCP entre gateway y microservicios. */
export const Patterns = {
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_ME: 'auth.me',
  AUTH_VERIFY: 'auth.verify',
  AUTH_VERIFY_IDENTITY: 'auth.verifyIdentity',
  AUTH_RESET_PASSWORD: 'auth.resetPassword',
  AUTH_ASSISTED_RESET: 'auth.assistedReset',
  AUTH_CHANGE_PASSWORD: 'auth.changePassword',

  PEOPLE_LIST: 'people.list',
  PEOPLE_UPSERT: 'people.upsert',
  PEOPLE_ARCHIVE: 'people.archive',
  PATIENTS_LIST: 'patients.list',
  PATIENTS_UPSERT: 'patients.upsert',
  PATIENTS_ME: 'patients.me',
  PATIENTS_MODULES: 'patients.modules',

  ACCOUNTS_LIST: 'ops.accounts.list',
  ACCOUNTS_UPSERT: 'ops.accounts.upsert',
  ACCOUNTS_ME: 'ops.accounts.me',
  ACCOUNTS_ME_PATCH: 'ops.accounts.me.patch',
  TERRITORIES_LIST: 'ops.territories.list',
  TERRITORIES_UPSERT: 'ops.territories.upsert',
  EXPERTS_LIST: 'ops.experts.list',
  EXPERTS_UPSERT: 'ops.experts.upsert',
  EXPERTS_SET_GOALS: 'ops.experts.setGoals',
  WORKLISTS_LIST: 'ops.worklists.list',
  WORKLISTS_UPSERT: 'ops.worklists.upsert',
  WORKLISTS_PATCH: 'ops.worklists.patch',
  FLAGS_LIST: 'ops.flags.list',
  FLAGS_UPSERT: 'ops.flags.upsert',
  FLAGS_PATCH: 'ops.flags.patch',
  ASSETS_LIST: 'ops.assets.list',
  ASSETS_BRACELETS: 'ops.assets.bracelets',
  ASSETS_TABLET: 'ops.assets.tablet',
  APP_STATE_GET: 'ops.appState.get',
  APP_STATE_PUT: 'ops.appState.put',
  HEALTH_DB: 'ops.health.db',

  TEO_ASK: 'ai.teo.ask',
  TEO_CHAT: 'ai.teo.chat',
  TEO_CONVERSATIONS_LIST: 'ai.teo.conversations.list',
  TEO_CONVERSATIONS_UPSERT: 'ai.teo.conversations.upsert',
} as const;

export type Pattern = (typeof Patterns)[keyof typeof Patterns];

export const ServicePorts = {
  auth: Number(process.env.NARA_AUTH_PORT || 4001),
  people: Number(process.env.NARA_PEOPLE_PORT || 4002),
  ops: Number(process.env.NARA_OPS_PORT || 4003),
  ai: Number(process.env.NARA_AI_PORT || 4004),
  gateway: Number(process.env.PORT || process.env.NARA_GATEWAY_PORT || 4000),
} as const;

export const APP_STATE_KEY = 'app_state';
export const APP_STATE_SLICES = [
  'notes',
  'pathAdjust',
  'referrals',
  'consents',
  'alerts',
  'crisisLog',
  'closedToday',
  'revisits',
  'notifs',
  'notices',
  'pathRequests',
  'pathOverrides',
  'rules',
  'visits',
  'groupSessions',
  'reports',
  'customReports',
  'schedules',
  'agentLog',
  'aiLog',
  'recursos',
  'activity',
  'accessLog',
  'weekBase',
  'rejected',
  'pendingSync',
  'terrOv',
  'expertOv',
  'personOv',
  'assetOv',
  'assets',
  'diana',
  'dianaInbox',
  'pins',
  'falsePositives',
  'oscarPlan',
  'rosalbaSummary',
  'rosalbaWA',
] as const;

export function pickAppStateSlices(source: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of APP_STATE_SLICES) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

/** Une arrays de alertas/log por id (multi-cliente: no pisar crisis de otro rol). */
export function mergeAppStateById(
  existing: unknown,
  incoming: unknown,
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  const put = (row: unknown) => {
    if (!row || typeof row !== 'object') return;
    const r = row as Record<string, unknown>;
    const id = String(r.id || '');
    if (!id) return;
    const prev = map.get(id);
    if (!prev) {
      map.set(id, r);
      return;
    }
    const rank = (a: Record<string, unknown>) => {
      const s = String(a.status || '');
      if (s === 'closed') return 4;
      if (s === 'mine' || s === 'retry') return 3;
      if (s === 'new') return 2;
      return 1;
    };
    if (
      rank(r) > rank(prev) ||
      (rank(r) === rank(prev) && Number(r.at || 0) >= Number(prev.at || 0))
    ) {
      map.set(id, { ...prev, ...r });
    }
  };
  (Array.isArray(existing) ? existing : []).forEach(put);
  (Array.isArray(incoming) ? incoming : []).forEach(put);
  return Array.from(map.values()).sort(
    (a, b) => Number(b.at || 0) - Number(a.at || 0),
  );
}

/**
 * Solicitudes de ruta admin→clínico.
 * No borrar pending si otro cliente persiste un array vacío/viejo.
 * approved/rejected gana sobre pending.
 */
export function mergePathRequests(
  existing: unknown,
  incoming: unknown,
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  const put = (row: unknown) => {
    if (!row || typeof row !== 'object') return;
    const r = row as Record<string, unknown>;
    const id = String(
      r.id || `${r.code || ''}-${r.scope || 'all'}`,
    );
    if (!id || id === '-') return;
    const norm: Record<string, unknown> = { ...r, id };
    const prev = map.get(id);
    if (!prev) {
      map.set(id, norm);
      return;
    }
    const rank = (a: Record<string, unknown>) => {
      const s = String(a.status || 'pending').toLowerCase();
      if (s === 'approved' || s === 'rejected') return 3;
      if (s === 'superseded') return 2;
      if (s === 'pending') return 1;
      return 2;
    };
    const rAt = Math.max(Number(r.at || 0), Number(r.resolvedAt || 0));
    const pAt = Math.max(Number(prev.at || 0), Number(prev.resolvedAt || 0));
    const rSt = String(norm.status || 'pending').toLowerCase();
    const pSt = String(prev.status || 'pending').toLowerCase();
    // Pending nuevo (reenvío admin) gana sobre approved/rejected del mismo id.
    if (
      rSt === 'pending' &&
      (pSt === 'approved' || pSt === 'rejected' || pSt === 'superseded') &&
      rAt > pAt
    ) {
      map.set(id, norm);
      return;
    }
    if (rank(norm) > rank(prev) || (rank(norm) === rank(prev) && rAt >= pAt)) {
      map.set(id, { ...prev, ...norm });
    }
  };
  (Array.isArray(existing) ? existing : []).forEach(put);
  (Array.isArray(incoming) ? incoming : []).forEach(put);
  return Array.from(map.values()).sort(
    (a, b) => Number(b.at || 0) - Number(a.at || 0),
  );
}

/**
 * Reglas: no pisar rules.pending del admin con un PUT del clínico sin pending.
 * Solo se limpia si hay aprobación (versión nueva) o pendingClearedAt ≥ pending.at.
 */
export function mergeRulesSlice(
  existing: unknown,
  incoming: unknown,
): Record<string, unknown> | unknown {
  if (!incoming || typeof incoming !== 'object') return existing;
  if (!existing || typeof existing !== 'object') return incoming;
  const e = existing as Record<string, unknown>;
  const i = incoming as Record<string, unknown>;
  const out: Record<string, unknown> = { ...e, ...i };
  const ePend =
    e.pending && typeof e.pending === 'object'
      ? (e.pending as Record<string, unknown>)
      : null;
  const iPend =
    i.pending && typeof i.pending === 'object'
      ? (i.pending as Record<string, unknown>)
      : null;

  if (iPend && ePend) {
    out.pending =
      Number(iPend.at || 0) >= Number(ePend.at || 0) ? iPend : ePend;
  } else if (iPend) {
    out.pending = iPend;
  } else if (ePend && (i.pending === null || i.pending === undefined)) {
    const versions = Array.isArray(i.versions) ? i.versions : [];
    const verAt = Number(
      (versions[0] as { at?: unknown } | undefined)?.at || 0,
    );
    const cleared = Number(i.pendingClearedAt || 0);
    const pendAt = Number(ePend.at || 0);
    if (Math.max(verAt, cleared) >= pendAt && pendAt > 0) {
      out.pending = null;
    } else {
      // Persist ajeno sin resolver → conservar solicitud pendiente.
      out.pending = ePend;
      if (e.risk !== undefined) out.risk = e.risk;
      if (e.dig !== undefined) out.dig = e.dig;
    }
  } else {
    out.pending = i.pending ?? null;
  }
  return out;
}

/** pathOverrides: unión de claves; incoming gana en conflicto. */
export function mergePathOverrides(
  existing: unknown,
  incoming: unknown,
): Record<string, unknown> {
  const e =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  const i =
    incoming && typeof incoming === 'object' && !Array.isArray(incoming)
      ? (incoming as Record<string, unknown>)
      : {};
  return { ...e, ...i };
}
