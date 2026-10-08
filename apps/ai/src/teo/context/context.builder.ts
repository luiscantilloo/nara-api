import { MongoStore } from '@nara/database';
import { APP_OVERVIEW } from '../prompts/app-overview';
import { buildObserverContext } from './observer.context';
import { buildStaffContext } from './staff.context';

export async function buildContext(
  mongo: MongoStore,
  roleId: string,
  question: string,
) {
  const db = await mongo.db();
  if (roleId === 'observador') {
    return buildObserverContext(db, roleId);
  }
  if (roleId === 'admin' || roleId === 'clinico' || roleId === 'experto') {
    return buildStaffContext(db, roleId, question);
  }
  return [APP_OVERVIEW, `Rol del usuario que pregunta: ${roleId}`].join('\n');
}
