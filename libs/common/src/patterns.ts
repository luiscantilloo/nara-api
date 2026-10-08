/** Message patterns TCP entre gateway y microservicios. */
export const Patterns = {
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_ME: 'auth.me',
  AUTH_VERIFY: 'auth.verify',

  PEOPLE_LIST: 'people.list',
  PEOPLE_UPSERT: 'people.upsert',
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
