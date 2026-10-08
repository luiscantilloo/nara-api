/**
 * Genera el código fuente del monorepo NARA API.
 * node scripts/generate-src.mjs
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
function w(rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content.replace(/^\n/, ""));
  console.log(rel);
}

// ─── libs/common ───────────────────────────────────────────
w(
  "libs/common/src/index.ts",
  `
export * from './patterns';
export * from './roles';
export * from './ports';
`,
);

w(
  "libs/common/src/patterns.ts",
  `
/** Message patterns TCP entre gateway y microservicios. */
export const Patterns = {
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_ME: 'auth.me',
  AUTH_VERIFY: 'auth.verify',

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
} as const;

export type Pattern = (typeof Patterns)[keyof typeof Patterns];

export const ServicePorts = {
  auth: Number(process.env.NARA_AUTH_PORT || 4001),
  people: Number(process.env.NARA_PEOPLE_PORT || 4002),
  ops: Number(process.env.NARA_OPS_PORT || 4003),
  ai: Number(process.env.NARA_AI_PORT || 4004),
  gateway: Number(process.env.PORT || process.env.NARA_GATEWAY_PORT || 4000),
} as const;
`,
);

w(
  "libs/common/src/roles.ts",
  `
export const NARA_ROLES = [
  { id: 'admin', slug: 'admin', name: 'Administrador', href: '/inicio', nk: 'admin' },
  { id: 'experto', slug: 'experto', name: 'Experto de campo', href: '/experto', nk: null },
  { id: 'clinico', slug: 'clinico', name: 'Clínico', href: '/clinico', nk: 'clin' },
  { id: 'paciente', slug: 'paciente', name: 'Paciente', href: '/paciente', nk: null },
  { id: 'observador', slug: 'observador', name: 'Observador', href: '/observador', nk: null },
] as const;

export type NaraRoleId = (typeof NARA_ROLES)[number]['id'];

export function hrefForRoleId(roleId?: string | null) {
  return NARA_ROLES.find((r) => r.id === roleId)?.href || '/ingreso';
}

export function resolveNotifKey(roleId: string | null | undefined, accountId: string) {
  const role = NARA_ROLES.find((r) => r.id === roleId);
  if (!role) return accountId;
  if (role.nk) return role.nk;
  return accountId;
}

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
};
`,
);

w(
  "libs/common/src/ports.ts",
  `
/**
 * Puerto de persistencia: hoy Mongo; mañana SQL u otro.
 * Los servicios dependen de esta interfaz, no del driver.
 */
export interface DocumentStore {
  ping(): Promise<{ ok: boolean; db: string }>;
  findOne(collection: string, filter: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  findMany(
    collection: string,
    filter?: Record<string, unknown>,
    opts?: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number },
  ): Promise<Record<string, unknown>[]>;
  count(collection: string, filter?: Record<string, unknown>): Promise<number>;
  upsert(
    collection: string,
    filter: Record<string, unknown>,
    doc: Record<string, unknown>,
  ): Promise<void>;
  updateOne(
    collection: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<number>;
}
`,
);

// ─── libs/database ─────────────────────────────────────────
w(
  "libs/database/src/index.ts",
  `
export * from './mongo.store';
export * from './database.module';
export * from './schema';
`,
);

w(
  "libs/database/src/schema.ts",
  `
/** Índices críticos para ~500k personas. */
export const PEOPLE_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { code: 1 }, unique: true, sparse: true },
  { key: { terr: 1 } },
  { key: { expertId: 1 }, sparse: true },
  { key: { name: 1 } },
  { key: { status: 1, terr: 1 } },
] as const;
`,
);

w(
  "libs/database/src/mongo.store.ts",
  `
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { MongoClient, type Db, type Document } from 'mongodb';
import type { DocumentStore } from '@nara/common';

@Injectable()
export class MongoStore implements DocumentStore, OnModuleDestroy {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  private async ensure(): Promise<Db> {
    if (this.db) return this.db;
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('Falta MONGODB_URI');
    const dbName = process.env.MONGODB_DB || 'nara';
    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db(dbName);
    return this.db;
  }

  async onModuleDestroy() {
    await this.client?.close();
  }

  async ping() {
    const db = await this.ensure();
    await db.command({ ping: 1 });
    return { ok: true, db: db.databaseName };
  }

  async findOne(collection: string, filter: Record<string, unknown>) {
    const db = await this.ensure();
    const doc = await db.collection(collection).findOne(filter as Document);
    return doc ? (doc as unknown as Record<string, unknown>) : null;
  }

  async findMany(
    collection: string,
    filter: Record<string, unknown> = {},
    opts?: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number },
  ) {
    const db = await this.ensure();
    let cursor = db.collection(collection).find(filter as Document);
    if (opts?.sort) cursor = cursor.sort(opts.sort);
    if (opts?.skip) cursor = cursor.skip(opts.skip);
    if (opts?.limit) cursor = cursor.limit(opts.limit);
    return (await cursor.toArray()) as unknown as Record<string, unknown>[];
  }

  async count(collection: string, filter: Record<string, unknown> = {}) {
    const db = await this.ensure();
    return db.collection(collection).countDocuments(filter as Document);
  }

  async upsert(collection: string, filter: Record<string, unknown>, doc: Record<string, unknown>) {
    const db = await this.ensure();
    await db.collection(collection).updateOne(filter as Document, { $set: doc }, { upsert: true });
  }

  async updateOne(collection: string, filter: Record<string, unknown>, update: Record<string, unknown>) {
    const db = await this.ensure();
    const r = await db.collection(collection).updateOne(filter as Document, update as Document);
    return r.modifiedCount;
  }
}
`,
);

w(
  "libs/database/src/database.module.ts",
  `
import { Global, Module } from '@nestjs/common';
import { MongoStore } from './mongo.store';

export const DOCUMENT_STORE = 'DOCUMENT_STORE';

@Global()
@Module({
  providers: [
    MongoStore,
    { provide: DOCUMENT_STORE, useExisting: MongoStore },
  ],
  exports: [MongoStore, DOCUMENT_STORE],
})
export class DatabaseModule {}
`,
);

// ─── libs/auth-core ────────────────────────────────────────
w(
  "libs/auth-core/src/index.ts",
  `
export * from './session-token';
export * from './password';
export * from './session.service';
export * from './auth-core.module';
`,
);

w(
  "libs/auth-core/src/session-token.ts",
  `
import { createHmac, timingSafeEqual } from 'crypto';

export const SESSION_COOKIE = 'nara_sid';
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14;

function secret() {
  const s = process.env.AUTH_SECRET || process.env.NARA_AUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === 'production') throw new Error('Falta AUTH_SECRET');
    return 'nara-dev-auth-secret-change-me';
  }
  return s;
}

export function signSessionToken(accountId: string, maxAgeSec = SESSION_MAX_AGE_SEC) {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
  const payload = \`\${accountId}.\${exp}\`;
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return \`\${payload}.\${sig}\`;
}

export function verifySessionToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [accountId, expStr, sig] = parts;
  if (!accountId || !expStr || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const payload = \`\${accountId}.\${expStr}\`;
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return accountId;
}
`,
);

w(
  "libs/auth-core/src/password.ts",
  `
import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}
`,
);

w(
  "libs/auth-core/src/session.service.ts",
  `
import { Inject, Injectable } from '@nestjs/common';
import { DOCUMENT_STORE, hrefForRoleId, resolveNotifKey, type DocumentStore, type SessionUser } from '@nara/common';
import { NARA_ROLES } from '@nara/common';

@Injectable()
export class SessionService {
  constructor(@Inject(DOCUMENT_STORE) private readonly store: DocumentStore) {}

  async loadUser(accountId: string): Promise<SessionUser | null> {
    const account = await this.store.findOne('accounts', { id: accountId, status: 'Activo' });
    if (!account) return null;
    const roleId = String(account.roleId || '');
    const roleDoc =
      (await this.store.findOne('roles', { id: roleId })) ||
      NARA_ROLES.find((r) => r.id === roleId) ||
      null;
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
      href: (roleDoc && 'href' in roleDoc && String(roleDoc.href)) || hrefForRoleId(roleId),
      nk: resolveNotifKey(roleId, String(account.id)),
      patientId: account.patientId ? String(account.patientId) : undefined,
    };
  }
}
`,
);

w(
  "libs/auth-core/src/auth-core.module.ts",
  `
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nara/database';
import { SessionService } from './session.service';

@Module({
  imports: [DatabaseModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class AuthCoreModule {}
`,
);

// Helper to create microservice main
function msMain(name, portEnv, defaultPort) {
  return `
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigModule } from '@nestjs/config';
import { ${name[0].toUpperCase() + name.slice(1)}Module } from './${name}.module';

async function bootstrap() {
  ConfigModule.forRoot({ isGlobal: true });
  const port = Number(process.env.${portEnv} || ${defaultPort});
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(${name[0].toUpperCase() + name.slice(1)}Module, {
    transport: Transport.TCP,
    options: { host: '0.0.0.0', port },
  });
  await app.listen();
  console.log(\`[nara-${name}] TCP :\${port}\`);
}
bootstrap();
`;
}

// ─── apps/auth ─────────────────────────────────────────────
w("apps/auth/src/main.ts", msMain("auth", "NARA_AUTH_PORT", 4001).replace("AuthModule", "AuthModule").replace("./auth.module", "./auth.module"));

// Fix auth main properly
w(
  "apps/auth/src/main.ts",
  `
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AuthModule } from './auth.module';

async function bootstrap() {
  const port = Number(process.env.NARA_AUTH_PORT || 4001);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthModule, {
    transport: Transport.TCP,
    options: { host: '0.0.0.0', port },
  });
  await app.listen();
  console.log(\`[nara-auth] TCP :\${port}\`);
}
bootstrap();
`,
);

w(
  "apps/auth/src/auth.module.ts",
  `
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@nara/database';
import { AuthCoreModule } from '@nara/auth-core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AuthCoreModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
`,
);

w(
  "apps/auth/src/auth.service.ts",
  `
import { Inject, Injectable } from '@nestjs/common';
import { DOCUMENT_STORE, type DocumentStore } from '@nara/common';
import { SessionService, signSessionToken, verifyPassword, verifySessionToken } from '@nara/auth-core';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
    private readonly sessions: SessionService,
  ) {}

  async login(emailRaw: string, password: string) {
    const email = String(emailRaw || '').trim().toLowerCase();
    if (!email || !password) {
      return { ok: false, status: 400, error: 'Correo y contraseña son obligatorios.' };
    }
    const account = await this.store.findOne('accounts', { email });
    if (!account || account.status !== 'Activo') {
      return { ok: false, status: 401, error: 'Correo o contraseña incorrectos.' };
    }
    const ok = await verifyPassword(password, String(account.passwordHash || ''));
    if (!ok) return { ok: false, status: 401, error: 'Correo o contraseña incorrectos.' };
    const user = await this.sessions.loadUser(String(account.id));
    if (!user) return { ok: false, status: 401, error: 'Cuenta no disponible.' };
    const token = signSessionToken(user.id);
    return { ok: true, status: 200, user, token };
  }

  async me(token: string | null) {
    const id = verifySessionToken(token);
    if (!id) return { ok: false, status: 401, error: 'No autenticado.' };
    const user = await this.sessions.loadUser(id);
    if (!user) return { ok: false, status: 401, error: 'No autenticado.' };
    return { ok: true, status: 200, user };
  }

  async verify(token: string | null) {
    return this.me(token);
  }
}
`,
);

w(
  "apps/auth/src/auth.controller.ts",
  `
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @MessagePattern(Patterns.AUTH_LOGIN)
  login(@Payload() data: { email: string; password: string }) {
    return this.auth.login(data.email, data.password);
  }

  @MessagePattern(Patterns.AUTH_ME)
  me(@Payload() data: { token: string | null }) {
    return this.auth.me(data.token);
  }

  @MessagePattern(Patterns.AUTH_VERIFY)
  verify(@Payload() data: { token: string | null }) {
    return this.auth.verify(data.token);
  }

  @MessagePattern(Patterns.AUTH_LOGOUT)
  logout() {
    return { ok: true, status: 200 };
  }
}
`,
);

// ─── apps/people ───────────────────────────────────────────
w(
  "apps/people/src/main.ts",
  `
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { PeopleModule } from './people.module';

async function bootstrap() {
  const port = Number(process.env.NARA_PEOPLE_PORT || 4002);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(PeopleModule, {
    transport: Transport.TCP,
    options: { host: '0.0.0.0', port },
  });
  await app.listen();
  console.log(\`[nara-people] TCP :\${port}\`);
}
bootstrap();
`,
);

w(
  "apps/people/src/people.module.ts",
  `
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@nara/database';
import { AuthCoreModule } from '@nara/auth-core';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AuthCoreModule],
  controllers: [PeopleController],
  providers: [PeopleService],
})
export class PeopleModule {}
`,
);

w(
  "apps/people/src/people.service.ts",
  `
import { Inject, Injectable } from '@nestjs/common';
import { DOCUMENT_STORE, type DocumentStore } from '@nara/common';
import { SessionService, verifySessionToken } from '@nara/auth-core';

function publicPerson(doc: Record<string, unknown>) {
  return {
    id: doc.id,
    code: doc.code || '',
    name: doc.name,
    age: doc.age || 0,
    place: doc.place || '',
    rural: !!doc.rural,
    terr: doc.terr || '',
    profile: doc.profile || 'P01',
    week: doc.week || 0,
    weeks: doc.weeks || 13,
    expert: doc.expert || '',
    expertId: doc.expertId || null,
    status: doc.status || 'Activa',
    clin: doc.clin || null,
    phone: doc.phone || '',
  };
}

@Injectable()
export class PeopleService {
  constructor(
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
    private readonly sessions: SessionService,
  ) {}

  private async requireRoles(token: string | null, roles: string[]) {
    const id = verifySessionToken(token);
    if (!id) return { error: { ok: false, status: 401, error: 'No autenticado.' } };
    const user = await this.sessions.loadUser(id);
    if (!user) return { error: { ok: false, status: 401, error: 'No autenticado.' } };
    if (roles.length && !roles.includes(user.roleId)) {
      return { error: { ok: false, status: 403, error: 'Sin permiso para esta acción.' } };
    }
    return { user };
  }

  async list(data: { token: string | null; limit?: number; skip?: number; terr?: string; q?: string }) {
    const auth = await this.requireRoles(data.token, ['admin', 'experto', 'clinico', 'observador']);
    if (auth.error) return auth.error;

    const filter: Record<string, unknown> = {};
    if (data.terr) filter.terr = data.terr;
    if (data.q) filter.name = { $regex: data.q, $options: 'i' };

    const limit = Math.min(Math.max(Number(data.limit) || 200, 1), 1000);
    const skip = Math.max(Number(data.skip) || 0, 0);
    const [total, rows] = await Promise.all([
      this.store.count('people', filter),
      this.store.findMany('people', filter, { sort: { name: 1 }, limit, skip }),
    ]);
    return {
      ok: true,
      status: 200,
      total,
      limit,
      skip,
      people: rows.map(publicPerson),
    };
  }

  async upsert(data: { token: string | null; body: Record<string, unknown> }) {
    const auth = await this.requireRoles(data.token, ['admin', 'experto', 'clinico']);
    if (auth.error) return auth.error;
    const body = data.body || {};
    const name = String(body.name || '').trim();
    if (!name) return { ok: false, status: 400, error: 'El nombre es obligatorio.' };

    const now = new Date();
    const id = String(body.id || \`p\${Date.now().toString(36)}\`);
    const terr = String(body.terr || '').trim();
    const pre =
      ({ Salento: 'SAL', Armenia: 'ARM', Calarcá: 'CAL' } as Record<string, string>)[terr] ||
      terr.slice(0, 3).toUpperCase() ||
      'NAR';
    const count = await this.store.count('people');
    const code = String(body.code || \`\${pre}-\${1000 + count + 1}\`);

    const doc = {
      id,
      code,
      name,
      age: Number(body.age) || 0,
      place: String(body.place || ''),
      rural: body.rural !== false,
      terr,
      profile: String(body.profile || 'P01'),
      week: Number(body.week) || 0,
      weeks: Number(body.weeks) || 13,
      expert: String(body.expert || ''),
      expertId: body.expertId || null,
      status: String(body.status || 'Activa'),
      clin: body.clin || null,
      phone: String(body.phone || ''),
      updatedAt: now,
    };
    await this.store.upsert('people', { id }, doc);
    return { ok: true, status: 200, person: publicPerson(doc) };
  }

  async patientsList(data: { token: string | null }) {
    const auth = await this.requireRoles(data.token, ['admin', 'clinico', 'experto']);
    if (auth.error) return auth.error;
    const rows = await this.store.findMany('patients', {}, { sort: { name: 1 }, limit: 5000 });
    return { ok: true, status: 200, patients: rows };
  }

  async patientsMe(data: { token: string | null }) {
    const auth = await this.requireRoles(data.token, ['paciente', 'admin', 'clinico']);
    if (auth.error) return auth.error;
    const user = auth.user!;
    const patientId = user.patientId;
    if (!patientId) return { ok: false, status: 404, error: 'Sin ficha vinculada.' };
    const patient = await this.store.findOne('patients', { id: patientId });
    if (!patient) return { ok: false, status: 404, error: 'Ficha no encontrada.' };
    return { ok: true, status: 200, patient };
  }

  async patientsModules(data: { token: string | null; body?: Record<string, unknown> }) {
    const auth = await this.requireRoles(data.token, ['paciente', 'admin', 'clinico']);
    if (auth.error) return auth.error;
    const user = auth.user!;
    const patientId = String(data.body?.patientId || user.patientId || '');
    if (!patientId) return { ok: false, status: 400, error: 'patientId requerido.' };

    if (data.body && data.body.modules) {
      await this.store.upsert(
        'patient_modules',
        { patientId },
        { patientId, modules: data.body.modules, updatedAt: new Date() },
      );
    }
    const doc = await this.store.findOne('patient_modules', { patientId });
    return { ok: true, status: 200, modules: doc?.modules || {} };
  }
}
`,
);

w(
  "apps/people/src/people.controller.ts",
  `
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { PeopleService } from './people.service';

@Controller()
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @MessagePattern(Patterns.PEOPLE_LIST)
  list(@Payload() data: { token: string | null; limit?: number; skip?: number; terr?: string; q?: string }) {
    return this.people.list(data);
  }

  @MessagePattern(Patterns.PEOPLE_UPSERT)
  upsert(@Payload() data: { token: string | null; body: Record<string, unknown> }) {
    return this.people.upsert(data);
  }

  @MessagePattern(Patterns.PATIENTS_LIST)
  patientsList(@Payload() data: { token: string | null }) {
    return this.people.patientsList(data);
  }

  @MessagePattern(Patterns.PATIENTS_ME)
  patientsMe(@Payload() data: { token: string | null }) {
    return this.people.patientsMe(data);
  }

  @MessagePattern(Patterns.PATIENTS_MODULES)
  patientsModules(@Payload() data: { token: string | null; body?: Record<string, unknown> }) {
    return this.people.patientsModules(data);
  }
}
`,
);

// ─── apps/ops ──────────────────────────────────────────────
w(
  "apps/ops/src/main.ts",
  `
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { OpsModule } from './ops.module';

async function bootstrap() {
  const port = Number(process.env.NARA_OPS_PORT || 4003);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(OpsModule, {
    transport: Transport.TCP,
    options: { host: '0.0.0.0', port },
  });
  await app.listen();
  console.log(\`[nara-ops] TCP :\${port}\`);
}
bootstrap();
`,
);

w(
  "apps/ops/src/ops.module.ts",
  `
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@nara/database';
import { AuthCoreModule } from '@nara/auth-core';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AuthCoreModule],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
`,
);

w(
  "apps/ops/src/ops.service.ts",
  `
import { Inject, Injectable } from '@nestjs/common';
import { DOCUMENT_STORE, type DocumentStore } from '@nara/common';
import { SessionService, verifySessionToken } from '@nara/auth-core';

@Injectable()
export class OpsService {
  constructor(
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
    private readonly sessions: SessionService,
  ) {}

  private async requireRoles(token: string | null, roles?: string[]) {
    const id = verifySessionToken(token);
    if (!id) return { error: { ok: false, status: 401, error: 'No autenticado.' } };
    const user = await this.sessions.loadUser(id);
    if (!user) return { error: { ok: false, status: 401, error: 'No autenticado.' } };
    if (roles && roles.length && !roles.includes(user.roleId)) {
      return { error: { ok: false, status: 403, error: 'Sin permiso para esta acción.' } };
    }
    return { user };
  }

  async healthDb() {
    try {
      const r = await this.store.ping();
      return { ok: true, status: 200, ...r };
    } catch (e) {
      return { ok: false, status: 500, error: e instanceof Error ? e.message : 'DB error' };
    }
  }

  async listCollection(token: string | null, collection: string, roles: string[], key: string) {
    const auth = await this.requireRoles(token, roles);
    if (auth.error) return auth.error;
    const rows = await this.store.findMany(collection, {}, { limit: 10000 });
    return { ok: true, status: 200, [key]: rows };
  }

  async accountsMe(token: string | null) {
    const auth = await this.requireRoles(token);
    if (auth.error) return auth.error;
    return { ok: true, status: 200, account: auth.user };
  }

  async appState(token: string | null) {
    const auth = await this.requireRoles(token, ['admin', 'experto', 'clinico', 'observador']);
    if (auth.error) return auth.error;
    const doc = await this.store.findOne('app_state', { id: 'main' });
    return { ok: true, status: 200, state: doc || {} };
  }

  async passthrough(token: string | null, roles: string[], collection: string, key: string) {
    return this.listCollection(token, collection, roles, key);
  }
}
`,
);

w(
  "apps/ops/src/ops.controller.ts",
  `
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { OpsService } from './ops.service';

@Controller()
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @MessagePattern(Patterns.HEALTH_DB)
  health() {
    return this.ops.healthDb();
  }

  @MessagePattern(Patterns.ACCOUNTS_LIST)
  accounts(@Payload() d: { token: string | null }) {
    return this.ops.passthrough(d.token, ['admin'], 'accounts', 'accounts');
  }

  @MessagePattern(Patterns.ACCOUNTS_ME)
  accountsMe(@Payload() d: { token: string | null }) {
    return this.ops.accountsMe(d.token);
  }

  @MessagePattern(Patterns.TERRITORIES_LIST)
  territories(@Payload() d: { token: string | null }) {
    return this.ops.passthrough(d.token, ['admin', 'experto', 'clinico', 'observador'], 'territories', 'territories');
  }

  @MessagePattern(Patterns.EXPERTS_LIST)
  experts(@Payload() d: { token: string | null }) {
    return this.ops.passthrough(d.token, ['admin', 'experto', 'clinico', 'observador'], 'experts', 'experts');
  }

  @MessagePattern(Patterns.WORKLISTS)
  worklists(@Payload() d: { token: string | null }) {
    return this.ops.passthrough(d.token, ['admin', 'experto'], 'worklists', 'worklists');
  }

  @MessagePattern(Patterns.FLAGS)
  flags(@Payload() d: { token: string | null }) {
    return this.ops.passthrough(d.token, ['admin', 'experto'], 'flags', 'flags');
  }

  @MessagePattern(Patterns.ASSETS)
  assets(@Payload() d: { token: string | null }) {
    return this.ops.passthrough(d.token, ['admin'], 'assets', 'assets');
  }

  @MessagePattern(Patterns.ASSETS_BRACELETS)
  bracelets(@Payload() d: { token: string | null }) {
    return this.ops.passthrough(d.token, ['admin'], 'assets', 'bracelets');
  }

  @MessagePattern(Patterns.ASSETS_TABLET)
  tablet(@Payload() d: { token: string | null }) {
    return this.ops.passthrough(d.token, ['admin', 'experto'], 'assets', 'tablets');
  }

  @MessagePattern(Patterns.APP_STATE)
  appState(@Payload() d: { token: string | null }) {
    return this.ops.appState(d.token);
  }
}
`,
);

// ─── apps/ai ───────────────────────────────────────────────
w(
  "apps/ai/src/main.ts",
  `
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AiModule } from './ai.module';

async function bootstrap() {
  const port = Number(process.env.NARA_AI_PORT || 4004);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AiModule, {
    transport: Transport.TCP,
    options: { host: '0.0.0.0', port },
  });
  await app.listen();
  console.log(\`[nara-ai] TCP :\${port}\`);
}
bootstrap();
`,
);

w(
  "apps/ai/src/ai.module.ts",
  `
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@nara/database';
import { AuthCoreModule } from '@nara/auth-core';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AuthCoreModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
`,
);

w(
  "apps/ai/src/ai.service.ts",
  `
import { Injectable } from '@nestjs/common';
import { SessionService, verifySessionToken } from '@nara/auth-core';

@Injectable()
export class AiService {
  constructor(private readonly sessions: SessionService) {}

  private async requireUser(token: string | null) {
    const id = verifySessionToken(token);
    if (!id) return { error: { ok: false, status: 401, error: 'No autenticado.' } };
    const user = await this.sessions.loadUser(id);
    if (!user) return { error: { ok: false, status: 401, error: 'No autenticado.' } };
    return { user };
  }

  async ask(data: { token: string | null; text?: string; role?: string }) {
    const auth = await this.requireUser(data.token);
    if (auth.error) return auth.error;
    // La lógica rica de TEO se migrará desde nara-web/agent.js; stub seguro por ahora.
    return {
      ok: true,
      status: 200,
      text: 'TEO (API): el enrutador de consultas fijas vive ahora en nara-ai. Conecte GEMINI_API_KEY para respuestas generativas.',
      role: data.role || auth.user!.roleId,
    };
  }

  async chat(data: { token: string | null; messages?: unknown[]; system?: string }) {
    const auth = await this.requireUser(data.token);
    if (auth.error) return auth.error;

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return {
        ok: true,
        status: 200,
        reply: 'TEO está en modo limitado (sin GEMINI_API_KEY en nara-api).',
      };
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const system = String(data.system || 'Eres TEO, acompañante de NARA. Responde en español, breve y claro.');
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const userText = messages
      .map((m: unknown) => {
        const x = m as { role?: string; content?: string };
        return \`\${x.role || 'user'}: \${x.content || ''}\`;
      })
      .join('\\n');

    try {
      const url = \`https://generativelanguage.googleapis.com/v1beta/models/\${model}:generateContent?key=\${key}\`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: system + '\\n\\n' + userText }] }],
        }),
      });
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        return { ok: false, status: 502, error: json.error?.message || 'Error Gemini' };
      }
      const reply = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { ok: true, status: 200, reply };
    } catch (e) {
      return { ok: false, status: 500, error: e instanceof Error ? e.message : 'Error IA' };
    }
  }
}
`,
);

w(
  "apps/ai/src/ai.controller.ts",
  `
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { AiService } from './ai.service';

@Controller()
export class AiController {
  constructor(private readonly ai: AiService) {}

  @MessagePattern(Patterns.TEO_ASK)
  ask(@Payload() data: { token: string | null; text?: string; role?: string }) {
    return this.ai.ask(data);
  }

  @MessagePattern(Patterns.TEO_CHAT)
  chat(@Payload() data: { token: string | null; messages?: unknown[]; system?: string }) {
    return this.ai.chat(data);
  }
}
`,
);

console.log("microservices ok — writing gateway…");
