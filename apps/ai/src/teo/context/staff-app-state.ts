import { pickAppStateSlices } from '@nara/common';

/** Recorta arrays/objetos grandes para no saturar el prompt. */
function takeArr(v: unknown, n: number) {
  return Array.isArray(v) ? v.slice(0, n) : null;
}

function summarizeKeyedLists(
  obj: unknown,
  perKey: number,
  maxKeys: number,
): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out: Record<string, unknown> = {};
  const keys = Object.keys(obj as object).slice(0, maxKeys);
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (Array.isArray(v)) {
      out[k] = {
        total: v.length,
        items: v.slice(0, perKey),
      };
    } else {
      out[k] = v;
    }
  }
  return out;
}

function filterArrByHint(arr: unknown[], hint: string | null, n: number) {
  if (!hint || hint.length < 2) return arr.slice(0, n);
  const h = hint.toLowerCase();
  const matched = arr.filter((row) => {
    try {
      return JSON.stringify(row).toLowerCase().includes(h);
    } catch {
      return false;
    }
  });
  return (matched.length ? matched : arr).slice(0, n);
}

/**
 * Resume las rebanadas operativas de program_settings (app_state)
 * para que TEO responda sobre notas, visitas, crisis, informes, etc.
 */
export function summarizeAppStateForTeo(
  doc: Record<string, unknown> | null,
  opts: {
    roleId: string;
    nameHint: string | null;
    expertKeys?: string[];
  },
): string[] {
  if (!doc) return ['Estado operativo compartido: aún no hay datos guardados.'];
  const st = pickAppStateSlices(doc);
  const parts: string[] = [];
  const hint = opts.nameHint;

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
      'Detalle rutas pendientes: ' + JSON.stringify(pendingPaths.slice(0, 25)),
    );
  }
  if (st.pathOverrides && typeof st.pathOverrides === 'object') {
    parts.push(
      'Rutas personalizadas aprobadas (por perfil): ' +
        JSON.stringify(st.pathOverrides),
    );
  }
  if (st.rules && typeof st.rules === 'object') {
    const rules = st.rules as Record<string, unknown>;
    parts.push(
      rules.pending
        ? 'Cambio de reglas de clasificación pendiente: ' +
            JSON.stringify(rules.pending)
        : 'No hay cambios de reglas pendientes.',
    );
    // Matriz / umbrales activos (sin saturar: claves principales)
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
    parts.push(
      'Ajustes de ruta en curso: ' +
        JSON.stringify(takeArr(st.pathAdjust, 30) ?? st.pathAdjust).slice(
          0,
          4000,
        ),
    );
  }

  // Crisis y alertas operativas
  const appAlerts = Array.isArray(st.alerts) ? st.alerts : [];
  const openAppAlerts = appAlerts.filter(
    (a: { status?: string }) => a && a.status !== 'closed',
  );
  parts.push(`Alertas operativas abiertas: ${openAppAlerts.length}.`);
  if (openAppAlerts.length) {
    parts.push(
      'Detalle alertas operativas: ' +
        JSON.stringify(filterArrByHint(openAppAlerts, hint, 40)),
    );
  }
  const crisisLog = Array.isArray(st.crisisLog) ? st.crisisLog : [];
  if (crisisLog.length) {
    parts.push(
      `Historial de crisis (últimas ${Math.min(40, crisisLog.length)} de ${crisisLog.length}): ` +
        JSON.stringify(filterArrByHint(crisisLog, hint, 40)),
    );
  }
  const closedToday = Array.isArray(st.closedToday) ? st.closedToday : [];
  if (closedToday.length) {
    parts.push(
      'Crisis cerradas hoy: ' + JSON.stringify(closedToday.slice(0, 30)),
    );
  }

  // Notas clínicas
  const notes = Array.isArray(st.notes) ? st.notes : null;
  if (notes?.length) {
    parts.push(
      `Notas clínicas (${notes.length} totales, muestra): ` +
        JSON.stringify(filterArrByHint(notes, hint, 40)),
    );
  } else if (st.notes && typeof st.notes === 'object') {
    const keyed = summarizeKeyedLists(st.notes, 8, 40);
    if (keyed) parts.push('Notas clínicas por persona: ' + JSON.stringify(keyed));
  }

  // Visitas (GPS / campo)
  const visits = Array.isArray(st.visits) ? st.visits : null;
  if (visits?.length) {
    parts.push(
      `Visitas registradas (${visits.length}, muestra): ` +
        JSON.stringify(filterArrByHint(visits, hint, 50)),
    );
  } else if (st.visits && typeof st.visits === 'object') {
    const keyed = summarizeKeyedLists(st.visits, 10, 30);
    if (keyed) parts.push('Visitas por clave: ' + JSON.stringify(keyed));
  }

  // Remisiones y consentimientos
  if (Array.isArray(st.referrals) && st.referrals.length) {
    parts.push(
      `Remisiones (${st.referrals.length}): ` +
        JSON.stringify(filterArrByHint(st.referrals, hint, 40)),
    );
  }
  if (Array.isArray(st.consents) && st.consents.length) {
    parts.push(
      `Consentimientos (${st.consents.length}, muestra): ` +
        JSON.stringify(filterArrByHint(st.consents, hint, 30)),
    );
  }

  // Revisitas y sesiones de grupo (a menudo keyed por experto)
  if (st.revisits != null) {
    if (Array.isArray(st.revisits)) {
      parts.push(
        `Revisitas (${st.revisits.length}): ` +
          JSON.stringify(filterArrByHint(st.revisits, hint, 40)),
      );
    } else if (typeof st.revisits === 'object') {
      let scoped: unknown = st.revisits;
      if (opts.roleId === 'experto' && opts.expertKeys?.length) {
        const filtered: Record<string, unknown> = {};
        for (const k of opts.expertKeys) {
          if ((st.revisits as Record<string, unknown>)[k] != null) {
            filtered[k] = (st.revisits as Record<string, unknown>)[k];
          }
        }
        if (Object.keys(filtered).length) scoped = filtered;
      }
      const keyed = summarizeKeyedLists(scoped, 12, 25);
      if (keyed) parts.push('Revisitas por experto: ' + JSON.stringify(keyed));
    }
  }
  if (st.groupSessions != null) {
    parts.push(
      'Sesiones de grupo: ' +
        JSON.stringify(
          takeArr(st.groupSessions, 30) ??
            summarizeKeyedLists(st.groupSessions, 8, 20) ??
            st.groupSessions,
        ).slice(0, 4000),
    );
  }

  // Notificaciones / avisos
  if (st.notifs != null) {
    parts.push(
      'Notificaciones: ' +
        JSON.stringify(
          takeArr(st.notifs, 30) ??
            summarizeKeyedLists(st.notifs, 8, 20) ??
            st.notifs,
        ).slice(0, 3500),
    );
  }
  if (st.notices != null) {
    parts.push(
      'Avisos a equipos de campo: ' +
        JSON.stringify(
          takeArr(st.notices, 30) ??
            summarizeKeyedLists(st.notices, 8, 20) ??
            st.notices,
        ).slice(0, 3500),
    );
  }

  // Informes
  if (st.reports != null) {
    parts.push(
      'Informes del programa: ' +
        JSON.stringify(takeArr(st.reports, 25) ?? st.reports).slice(0, 4000),
    );
  }
  if (st.customReports != null) {
    parts.push(
      'Informes personalizados: ' +
        JSON.stringify(takeArr(st.customReports, 20) ?? st.customReports).slice(
          0,
          3500,
        ),
    );
  }
  if (st.schedules != null) {
    parts.push(
      'Cronogramas / agendas: ' +
        JSON.stringify(takeArr(st.schedules, 25) ?? st.schedules).slice(0, 3000),
    );
  }

  // Recursos / biblioteca
  if (st.recursos != null) {
    const r = st.recursos as Record<string, unknown>;
    const summary: Record<string, unknown> = {};
    if (r.people && typeof r.people === 'object') {
      const people = r.people as Record<string, unknown>;
      summary.personasConRecursos = Object.keys(people).length;
      summary.muestraPersonas = Object.fromEntries(
        Object.entries(people).slice(0, 25),
      );
    }
    for (const k of ['cursos', 'cuentos', 'tecnicas', 'STATS', 'stats']) {
      if (r[k] != null) summary[k] = r[k];
    }
    parts.push(
      'Recursos / biblioteca / cursos: ' +
        JSON.stringify(
          Object.keys(summary).length ? summary : takeArr(st.recursos, 20) ?? st.recursos,
        ).slice(0, 5000),
    );
  }

  // Actividad y acceso (auditoría ligera)
  if (Array.isArray(st.activity) && st.activity.length) {
    parts.push(
      `Actividad reciente (${st.activity.length}): ` +
        JSON.stringify(st.activity.slice(0, 40)),
    );
  }
  if (Array.isArray(st.accessLog) && st.accessLog.length) {
    parts.push(
      `Accesos recientes (${st.accessLog.length}): ` +
        JSON.stringify(st.accessLog.slice(0, 30)),
    );
  }
  if (Array.isArray(st.agentLog) && st.agentLog.length) {
    parts.push(
      'Consultas previas a TEO (muestra): ' +
        JSON.stringify(st.agentLog.slice(-20)),
    );
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
    if (st[key] != null) {
      parts.push(
        `${key}: ` +
          JSON.stringify(
            takeArr(st[key], 40) ??
              summarizeKeyedLists(st[key], 10, 25) ??
              st[key],
          ).slice(0, 3500),
      );
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
        `Caso / plan ${key}: ` + JSON.stringify(st[key]).slice(0, 4000),
      );
    }
  }

  return parts.filter(Boolean);
}
