import type { Db } from 'mongodb';
import { APP_OVERVIEW } from '../prompts/app-overview';

function nameHintFrom(question: string) {
  return (
    question.match(/["«]([^"»]+)["»]/)?.[1] ||
    question.match(
      /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){0,3})\b/,
    )?.[1]
  );
}

export async function buildStaffContext(
  db: Db,
  roleId: string,
  question: string,
) {
  const q = question.toLowerCase();
  const wantsPatient =
    /paciente|persona|usuario|correo|email|tel[eé]fono|municipio|edad|caseload|ficha/i.test(
      q,
    );
  const nameHint = nameHintFrom(question);
  const parts: string[] = [
    APP_OVERVIEW,
    `Rol del usuario que pregunta: ${roleId}`,
  ];

  const nAccounts = await db.collection('accounts').countDocuments();
  const nPatients = await db.collection('patients').countDocuments();
  const nPeople = await db.collection('people').countDocuments();
  const nExperts = await db.collection('experts').countDocuments();
  const nTerr = await db.collection('territories').countDocuments();
  parts.push(
    `Resumen programa: accounts=${nAccounts}, patients=${nPatients}, people=${nPeople}, experts=${nExperts}, territories=${nTerr}`,
  );

  if (wantsPatient) {
    const filter: Record<string, unknown> = {};
    if (nameHint && nameHint.length > 2) {
      filter.$or = [
        { name: { $regex: nameHint, $options: 'i' } },
        { email: { $regex: nameHint, $options: 'i' } },
        { place: { $regex: nameHint, $options: 'i' } },
        { municipio: { $regex: nameHint, $options: 'i' } },
      ];
    }
    const rows = await db
      .collection('patients')
      .find(filter)
      .project({
        id: 1,
        name: 1,
        age: 1,
        place: 1,
        email: 1,
        phone: 1,
        profile: 1,
        signal: 1,
        expert: 1,
        modulesEnabled: 1,
        modulesVisible: 1,
        source: 1,
      })
      .limit(nameHint ? 8 : 25)
      .toArray();
    parts.push('Pacientes (muestra o coincidencias):', JSON.stringify(rows));
  }

  if (/usuario|cuenta|admin|experto|cl[ií]nico|rol/i.test(q)) {
    const accounts = await db
      .collection('accounts')
      .find({})
      .project({
        id: 1,
        name: 1,
        email: 1,
        role: 1,
        roleId: 1,
        status: 1,
        terr: 1,
      })
      .limit(40)
      .toArray();
    parts.push('Cuentas (sin secretos):', JSON.stringify(accounts));
  }

  return parts.join('\n\n');
}
