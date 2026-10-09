export const APP_OVERVIEW = `
NARA es el programa de acompañamiento en salud mental tras el sismo (Eje Cafetero, Colombia).

Quiénes usan la plataforma:
- Administrador: territorios, captación, rutas, equipos, usuarios, activos, informes.
- Experto de campo: visitas, evaluaciones, cola de trabajo, banderas de calidad.
- Clínico: aprobaciones (evaluaciones, rutas, reglas), crisis, caseload de pacientes.
- Paciente: app con módulos de su ruta (ánimo, TEO, técnicas, biblioteca) cuando está Activo.
- Observador: solo mira avances agregados, sin datos personales.

Estados de personas/pacientes (use estos nombres al hablar):
- Sin evaluación, Por aprobar, Activo, Inactivo, Crisis, Rechazado, Terminado blanco, Terminado negro.

Rutas: perfiles P01–P15 (riesgo × capacidad digital). Incluyen servicios y umbral de inactividad.
Inactividad: si tras estar Activo la persona no usa la app el tiempo del perfil, pasa a Inactivo; con «Volví» vuelve a Activo.
Crisis: la persona pide ayuda en la app; el clínico atiende; se cierra cuando confirma «estoy bien».

Hable siempre en lenguaje cotidiano del programa. No diga Mongo, API, base de datos, colección ni jerga técnica.
`.trim();
