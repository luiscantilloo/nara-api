/** Claves operativas de app_state (mismo set que APP_STATE_SLICES en @nara/common). */
const SLICE_KEYS = [
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

function pickSlices(source: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of SLICE_KEYS) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

/** Recorta arrays/objetos grandes para no saturar el prompt. */
function takeArr(v: unknown, n: number) {
  return Array.isArray(v) ? v.slice(0, n) : null;
}

function pidDe(r: Record<string, unknown>) {
  return String(r?.pid ?? r?.personId ?? r?.patientId ?? r?.id ?? '');
}

/** Quita PII y deja código en lugar de nombre. */
export function redactForTeo(row: unknown): unknown {
  if (row == null || typeof row !== 'object') return row;
  if (Array.isArray(row)) return row.map(redactForTeo);
  const o = { ...(row as Record<string, unknown>) };
  delete o.phone;
  delete o.tel;
  delete o.telefono;
  delete o.email;
  delete o.correo;
  delete o.contact;
  if (typeof o.detail === 'string') {
    o.detail = o.detail
      .replace(/\b3\d{9}\b/g, '[tel]')
      .replace(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
        '[correo]',
      );
  }
  const code = String(o.code || pidDe(o) || '');
  if ('name' in o || 'personName' in o) {
    if (code) o.code = code;
    delete o.name;
    delete o.personName;
  }
  return o;
}

function inTerr(
  r: Record<string, unknown>,
  terrIds: Set<string> | null,
): boolean {
  if (!terrIds) return true;
  const p = pidDe(r);
  if (!p) return true;
  return (
    terrIds.has(p) ||
    terrIds.has(String(r.code || '')) ||
    terrIds.has(String(r.accountId || ''))
  );
}

function filterArr(
  arr: unknown[],
  terrIds: Set<string> | null,
  hint: string | null,
  n: number,
) {
  let rows = arr.filter(
    (row) =>
      row &&
      typeof row === 'object' &&
      inTerr(row as Record<string, unknown>, terrIds),
  );
  if (hint && hint.length >= 2) {
    const h = hint.toLowerCase();
    const matched = rows.filter((row) => {
      try {
        return JSON.stringify(row).toLowerCase().includes(h);
      } catch {
        return false;
      }
    });
    if (matched.length) rows = matched;
  }
  return rows.slice(0, n).map(redactForTeo);
}

function filterKeyed(
  obj: unknown,
  terrIds: Set<string> | null,
  perKey: number,
  maxKeys: number,
): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out: Record<string, unknown> = {};
  let keys = Object.keys(obj as object);
  if (terrIds) keys = keys.filter((k) => terrIds.has(k));
  keys = keys.slice(0, maxKeys);
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (Array.isArray(v)) {
      out[k] = {
        total: v.length,
        items: v.slice(0, perKey).map(redactForTeo),
      };
    } else {
      out[k] = redactForTeo(v);
    }
  }
  return Object.keys(out).length ? out : null;
}

const SOLO_ADMIN = ['accessLog', 'agentLog', 'aiLog', 'activity'] as const;

/**
 * Resume las rebanadas operativas de program_settings (app_state)
 * para que TEO responda sobre notas, visitas, crisis, informes, etc.
 * Experto/clínico: solo pids del territorio; sin PII; logs internos solo admin.
 */
export function summarizeAppStateForTeo(
  doc: Record<string, unknown> | null,
  opts: {
    roleId: string;
    nameHint: string | null;
    expertKeys?: string[];
    /** IDs/códigos/accountId del territorio; null = admin (sin filtro). */
    terrIds?: Set<string> | null;
  },
): string[] {
  if (!doc) return ['Estado operativo compartido: aún no hay datos guardados.'];
  const st = pickSlices(doc);
  const parts: string[] = [];
  const hint = opts.nameHint;
  const scoped = opts.roleId === 'experto' || opts.roleId === 'clinico';
  const terrIds = scoped ? opts.terrIds ?? new Set<string>() : null;
  const isAdmin = opts.roleId === 'admin';

  // Rutas y reglas
  const pathRequests = Array.isArray(st.pathRequests) ? st.pathRequests : [];
  const pendingPaths = pathRequests.filter(
    (r: { status?: string }) =>
      !r?.status || String(r.status).toLowerCase() === 'pending',
  );
  parts.push(
    `Cambios de ruta pendientes de aprobación: ${pendingPaths.length}.`,
  );
  if (pendingPaths.length) {
    parts.push(
      'Detalle rutas pendientes: ' +
        JSON.stringify(pendingPaths.slice(0, 25).map(redactForTeo)),
    );
  }
  if (st.pathOverrides && typeof st.pathOverrides === 'object') {
    parts.push(
      'Rutas personalizadas aprobadas (por perfil): ' +
        JSON.stringify(redactForTeo(st.pathOverrides)),
    );
  }
  if (st.rules && typeof st.rules === 'object') {
    const rules = st.rules as Record<string, unknown>;
    parts.push(
      rules.pending
        ? 'Cambio de reglas de clasificación pendiente: ' +
            JSON.stringify(redactForTeo(rules.pending))
        : 'No hay cambios de reglas pendientes.',
    );
    const active = { ...rules };
    delete active.pending;
    delete active.draft;
    const keys = Object.keys(active);
    if (keys.length) {
      parts.push(
        'Reglas / clasificación activas (resumen): ' +
          JSON.stringify(active).slice(0, 6000),
      );
    }
  }
  if (st.pathAdjust != null) {
    if (Array.isArray(st.pathAdjust)) {
      parts.push(
        'Ajustes de ruta en curso: ' +
          JSON.stringify(filterArr(st.pathAdjust, terrIds, hint, 30)).slice(
            0,
            4000,
          ),
      );
    } else {
      const keyed = filterKeyed(st.pathAdjust, terrIds, 10, 30);
      if (keyed)
        parts.push(
          'Ajustes de ruta en curso: ' + JSON.stringify(keyed).slice(0, 4000),
        );
    }
  }

  // Crisis y alertas operativas
  const appAlerts = Array.isArray(st.alerts) ? st.alerts : [];
  const openAppAlerts = appAlerts.filter(
    (a: { status?: string }) => a && a.status !== 'closed',
  );
  const openScoped = filterArr(openAppAlerts, terrIds, hint, 40);
  parts.push(`Alertas operativas abiertas: ${openScoped.length}.`);
  if (openScoped.length) {
    parts.push('Detalle alertas operativas: ' + JSON.stringify(openScoped));
  }
  const crisisLog = Array.isArray(st.crisisLog) ? st.crisisLog : [];
  if (crisisLog.length) {
    const sample = filterArr(crisisLog, terrIds, hint, 40);
    if (sample.length) {
      parts.push(
        `Historial de crisis (muestra ${sample.length} de ${crisisLog.length}): ` +
          JSON.stringify(sample),
      );
    }
  }
  const closedToday = Array.isArray(st.closedToday) ? st.closedToday : [];
  if (closedToday.length) {
    const sample = filterArr(closedToday, terrIds, null, 30);
    if (sample.length) {
      parts.push('Crisis cerradas hoy: ' + JSON.stringify(sample));
    }
  }

  // Notas clínicas
  const notes = Array.isArray(st.notes) ? st.notes : null;
  if (notes?.length) {
    const sample = filterArr(notes, terrIds, hint, 40);
    if (sample.length) {
      parts.push(
        `Notas clínicas (${notes.length} totales, muestra): ` +
          JSON.stringify(sample),
      );
    }
  } else if (st.notes && typeof st.notes === 'object') {
    const keyed = filterKeyed(st.notes, terrIds, 8, 40);
    if (keyed) parts.push('Notas clínicas por persona: ' + JSON.stringify(keyed));
  }

  // Visitas (GPS / campo)
  const visits = Array.isArray(st.visits) ? st.visits : null;
  if (visits?.length) {
    const sample = filterArr(visits, terrIds, hint, 50);
    if (sample.length) {
      parts.push(
        `Visitas registradas (${visits.length}, muestra): ` +
          JSON.stringify(sample),
      );
    }
  } else if (st.visits && typeof st.visits === 'object') {
    const keyed = filterKeyed(st.visits, terrIds, 10, 30);
    if (keyed) parts.push('Visitas por clave: ' + JSON.stringify(keyed));
  }

  // Remisiones y consentimientos
  if (Array.isArray(st.referrals) && st.referrals.length) {
    const sample = filterArr(st.referrals, terrIds, hint, 40);
    if (sample.length) {
      parts.push(`Remisiones (${sample.length}): ` + JSON.stringify(sample));
    }
  }
  if (Array.isArray(st.consents) && st.consents.length) {
    const sample = filterArr(st.consents, terrIds, hint, 30);
    if (sample.length) {
      parts.push(
        `Consentimientos (${sample.length}, muestra): ` +
          JSON.stringify(sample),
      );
    }
  } else if (st.consents && typeof st.consents === 'object') {
    const keyed = filterKeyed(st.consents, terrIds, 4, 30);
    if (keyed) parts.push('Consentimientos: ' + JSON.stringify(keyed));
  }

  // Revisitas y sesiones de grupo
  if (st.revisits != null) {
    if (Array.isArray(st.revisits)) {
      const sample = filterArr(st.revisits, terrIds, hint, 40);
      if (sample.length) {
        parts.push(`Revisitas (${sample.length}): ` + JSON.stringify(sample));
      }
    } else if (typeof st.revisits === 'object') {
      let scopedMap: unknown = st.revisits;
      if (opts.roleId === 'experto' && opts.expertKeys?.length) {
        const filtered: Record<string, unknown> = {};
        for (const k of opts.expertKeys) {
          if ((st.revisits as Record<string, unknown>)[k] != null) {
            filtered[k] = (st.revisits as Record<string, unknown>)[k];
          }
        }
        if (Object.keys(filtered).length) scopedMap = filtered;
      }
      const keyed = filterKeyed(scopedMap, terrIds, 12, 25);
      if (keyed) parts.push('Revisitas por experto: ' + JSON.stringify(keyed));
    }
  }
  if (st.groupSessions != null) {
    if (Array.isArray(st.groupSessions)) {
      const sample = filterArr(st.groupSessions, terrIds, hint, 30);
      if (sample.length) {
        parts.push('Sesiones de grupo: ' + JSON.stringify(sample).slice(0, 4000));
      }
    } else {
      const keyed = filterKeyed(st.groupSessions, terrIds, 8, 20);
      if (keyed) {
        parts.push(
          'Sesiones de grupo: ' + JSON.stringify(keyed).slice(0, 4000),
        );
      }
    }
  }

  // Notificaciones / avisos
  if (st.notifs != null) {
    if (Array.isArray(st.notifs)) {
      const sample = filterArr(st.notifs, terrIds, hint, 30);
      if (sample.length) {
        parts.push(
          'Notificaciones: ' + JSON.stringify(sample).slice(0, 3500),
        );
      }
    } else if (typeof st.notifs === 'object') {
      let map = st.notifs as Record<string, unknown>;
      if (scoped) {
        const keep = new Set<string>([
          ...(opts.expertKeys || []),
          opts.roleId === 'clinico' ? 'clin' : '',
          opts.roleId === 'clinico' ? 'clinico' : '',
          opts.roleId === 'experto' ? 'exp' : '',
          opts.roleId === 'experto' ? 'experto' : '',
        ].filter(Boolean));
        map = Object.fromEntries(
          Object.entries(map).filter(([k]) => keep.has(k)),
        );
      }
      const keyed = filterKeyed(map, null, 8, 20);
      if (keyed) {
        parts.push(
          'Notificaciones: ' + JSON.stringify(keyed).slice(0, 3500),
        );
      }
    }
  }
  if (st.notices != null) {
    parts.push(
      'Avisos a equipos de campo: ' +
        JSON.stringify(
          takeArr(st.notices, 30)?.map(redactForTeo) ??
            filterKeyed(st.notices, terrIds, 8, 20) ??
            redactForTeo(st.notices),
        ).slice(0, 3500),
    );
  }

  // Informes
  if (st.reports != null) {
    parts.push(
      'Informes del programa: ' +
        JSON.stringify(
          takeArr(st.reports, 25)?.map(redactForTeo) ?? redactForTeo(st.reports),
        ).slice(0, 4000),
    );
  }
  if (st.customReports != null) {
    parts.push(
      'Informes personalizados: ' +
        JSON.stringify(
          takeArr(st.customReports, 20)?.map(redactForTeo) ??
            redactForTeo(st.customReports),
        ).slice(0, 3500),
    );
  }
  if (st.schedules != null) {
    parts.push(
      'Cronogramas / agendas: ' +
        JSON.stringify(
          takeArr(st.schedules, 25)?.map(redactForTeo) ??
            redactForTeo(st.schedules),
        ).slice(0, 3000),
    );
  }

  // Recursos / biblioteca — people filtrado por territorio
  if (st.recursos != null) {
    const r = st.recursos as Record<string, unknown>;
    const summary: Record<string, unknown> = {};
    if (r.people && typeof r.people === 'object') {
      let entries = Object.entries(r.people as Record<string, unknown>);
      if (terrIds) entries = entries.filter(([k]) => terrIds.has(k));
      summary.personasConRecursos = entries.length;
      summary.muestraPersonas = Object.fromEntries(
        entries.slice(0, 25).map(([k, v]) => [k, redactForTeo(v)]),
      );
    }
    for (const k of ['cursos', 'cuentos', 'tecnicas', 'STATS', 'stats']) {
      if (r[k] != null) summary[k] = r[k];
    }
    parts.push(
      'Recursos / biblioteca / cursos: ' +
        JSON.stringify(
          Object.keys(summary).length
            ? summary
            : takeArr(st.recursos, 20) ?? st.recursos,
        ).slice(0, 5000),
    );
  }

  // Actividad y acceso: solo admin (app-state.policy SOLO_ADMIN_LEE)
  if (isAdmin) {
    for (const key of SOLO_ADMIN) {
      const v = st[key];
      if (Array.isArray(v) && v.length) {
        const label =
          key === 'activity'
            ? 'Actividad reciente'
            : key === 'accessLog'
              ? 'Accesos recientes'
              : key === 'agentLog'
                ? 'Consultas previas a TEO (muestra)'
                : 'Registro IA (muestra)';
        const slice =
          key === 'agentLog' || key === 'aiLog' ? v.slice(-20) : v.slice(0, 40);
        parts.push(
          `${label} (${v.length}): ` +
            JSON.stringify(slice.map(redactForTeo)),
        );
      }
    }
  }

  // Overrides y activos en app_state
  for (const key of [
    'weekBase',
    'rejected',
    'terrOv',
    'expertOv',
    'personOv',
    'assetOv',
    'assets',
    'falsePositives',
    'pins',
  ] as const) {
    if (st[key] == null) continue;
    const needsTerr =
      key === 'personOv' ||
      key === 'pins' ||
      key === 'rejected' ||
      key === 'falsePositives' ||
      key === 'assets';
    if (Array.isArray(st[key])) {
      const sample = needsTerr
        ? filterArr(st[key] as unknown[], terrIds, hint, 40)
        : (st[key] as unknown[]).slice(0, 40).map(redactForTeo);
      if (sample.length) {
        parts.push(`${key}: ` + JSON.stringify(sample).slice(0, 3500));
      }
    } else {
      const keyed = filterKeyed(
        st[key],
        needsTerr ? terrIds : null,
        10,
        25,
      );
      if (keyed) {
        parts.push(`${key}: ` + JSON.stringify(keyed).slice(0, 3500));
      } else if (!needsTerr || !terrIds) {
        parts.push(
          `${key}: ` +
            JSON.stringify(redactForTeo(st[key])).slice(0, 3500),
        );
      }
    }
  }

  // Casos demo clínicos (si existen en el programa)
  for (const key of [
    'diana',
    'dianaInbox',
    'oscarPlan',
    'rosalbaSummary',
    'rosalbaWA',
  ] as const) {
    if (st[key] != null) {
      parts.push(
        `Caso / plan ${key}: ` +
          JSON.stringify(redactForTeo(st[key])).slice(0, 4000),
      );
    }
  }

  return parts.filter(Boolean);
}
