/* Datos iniciales transcritos de las tres imágenes proporcionadas por el usuario. */
(function (root) {
  'use strict';

  // Fuente: rol semanal fijp.jpg (lunes a viernes) y rol mb r.jpg.
  // Los apellidos y grados se conservan por separado para agrupar R3/R4 al publicar.
  const defaults = {
    schemaVersion: 3,
    doctors: [
      {
        id: 'montoya', name: 'Montoya', fullName: 'Yeoshua A. Montoya Saiz', title: 'Dr.', shift: 'matutino',
        schedule: ['consulta', 'qx', 'urgencias', 'qx', 'consulta'],
        residents: [{ name: 'González', grade: 4 }, { name: 'Márquez', grade: 2 }]
      },
      {
        id: 'torres', name: 'Torres', fullName: 'Leonardo R. Torres Huerta', title: 'Dr.', shift: 'matutino',
        schedule: ['consulta', 'consulta', 'qx', 'urgencias', 'qx'],
        residents: [{ name: 'Mendoza', grade: 4 }, { name: 'Pérez', grade: 2 }]
      },
      {
        id: 'cerda', name: 'Cerda', fullName: 'Fabiola A. Cerda Gómez', title: 'Dra.', shift: 'matutino',
        schedule: ['qx', 'consulta', 'urgencias', 'qx', 'consulta'],
        residents: [{ name: 'Tapia', grade: 4 }, { name: 'Ibarra', grade: 2 }, { name: 'Chávez', grade: 1 }]
      },
      {
        id: 'pardini', name: 'Pardini', fullName: 'Carlos G. Pardini Angulo', title: 'Dr.', shift: 'matutino',
        schedule: ['qx', 'urgencias', 'consulta', 'consulta', 'qx'],
        residents: [{ name: 'Soto', grade: 3 }, { name: 'Rojo', grade: 2 }]
      },
      {
        id: 'quiroz', name: 'Quiroz', fullName: 'David G. Quiroz Bueron', title: 'Dr.', shift: 'matutino',
        schedule: ['residencia', 'qx', 'consulta', 'consulta', 'residencia'],
        residents: [{ name: 'Najar', grade: 3 }]
      },
      {
        id: 'flores', name: 'Flores', fullName: 'Stephania Flores Sanabria', title: 'Dra.', shift: 'matutino',
        schedule: ['urgencias', 'qx', 'qx', 'consulta', 'consulta'],
        residents: [{ name: 'Cruz', grade: 3 }, { name: 'Hernández', grade: 2 }]
      },
      {
        id: 'ramirez', name: 'Ramírez', fullName: 'Manuel Ramírez Antonio', title: 'Dr.', shift: 'matutino',
        schedule: ['consulta', 'qx', 'consulta', 'qx', 'urgencias'],
        residents: [{ name: 'Urbalejo', grade: 4 }, { name: 'Andrade', grade: 2 }]
      },
      {
        id: 'garcia_m', name: 'García M.', title: 'Dr.', shift: 'matutino',
        schedule: ['cobertura', 'cobertura', 'cobertura', 'cobertura', 'cobertura'],
        residents: []
      },
      {
        id: 'esquer', name: 'Esquer', fullName: 'Juan Fco. Esquer Cota (UMAA 68)', title: 'Dr.', shift: 'matutino',
        schedule: ['manual', 'manual', 'manual', 'manual', 'manual'],
        residents: [{ name: 'Medina', grade: 3 }]
      },
      {
        id: 'leyva', name: 'Leyva', fullName: 'Luis F. Leyva Federico', title: 'Dr.', shift: 'vespertino',
        schedule: ['consulta', 'qx', 'urgencias', 'consulta', 'residencia'],
        residents: [{ name: 'Montaño', grade: 4 }, { name: 'González', grade: 1 }]
      },
      {
        id: 'mascareno', name: 'Mascareño', fullName: 'Paul Mascareño Mojardin', title: 'Dr.', shift: 'vespertino',
        schedule: ['urgencias', 'qx', 'qx', 'consulta', 'consulta'],
        residents: [{ name: 'Luján', grade: 3 }, { name: 'Palencia', grade: 1 }]
      },
      {
        id: 'figueroa', name: 'Figueroa', fullName: 'Francisco Figueroa Lira', title: 'Dr.', shift: 'vespertino',
        schedule: ['urgencias', 'consulta', 'qx', 'qx', 'consulta'],
        residents: [{ name: 'Rivera', grade: 4 }, { name: 'Pérez', grade: 2 }, { name: 'Estrada', grade: 1 }]
      },
      {
        id: 'salgado', name: 'Salgado', fullName: 'Ramón Salgado Toledo', title: 'Dr.', shift: 'vespertino',
        schedule: ['consulta', 'qx', 'consulta', 'qx', 'urgencias'],
        residents: [{ name: 'Esparza', grade: 4 }, { name: 'Ibarra', grade: 2 }]
      },
      {
        id: 'dorame', name: 'Dórame', fullName: 'Gabriel I. Dórame Bueras', title: 'Dr.', shift: 'vespertino',
        schedule: ['qx', 'urgencias', 'consulta', 'consulta', 'qx'],
        residents: [{ name: 'Robles', grade: 3 }, { name: 'Andrade', grade: 2 }, { name: 'García', grade: 1 }]
      },
      {
        id: 'cortina', name: 'Cortina', fullName: 'Enrique Cortina Monzon', title: 'Dr.', shift: 'vespertino',
        schedule: ['qx', 'consulta', 'consulta', 'qx', 'urgencias'],
        residents: [{ name: 'García', grade: 4 }, { name: 'Márquez', grade: 2 }]
      },
      {
        id: 'galaviz', name: 'Galaviz', fullName: 'Jorge Galaviz Ortega', title: 'Dr.', shift: 'vespertino',
        schedule: ['consulta', 'qx', 'urgencias', 'qx', 'consulta'],
        residents: [{ name: 'Perla M.', grade: 4 }, { name: 'Hernández', grade: 2 }]
      },
      {
        id: 'salas', name: 'Salas', fullName: 'José A. Salas Siqueiros', title: 'Dr.', shift: 'vespertino',
        schedule: ['qx', 'consulta', 'qx', 'urgencias', 'consulta'],
        residents: [{ name: 'Verdugo', grade: 4 }, { name: 'Rojo', grade: 2 }]
      },
      {
        id: 'beltran_f', name: 'Beltrán F.', title: 'Dr.', shift: 'vespertino',
        schedule: ['cobertura', 'cobertura', 'cobertura', 'cobertura', 'cobertura'],
        residents: []
      }
    ],
    // Fuente: bloque «R1 SERVICIO» de rol mb r.jpg.
    // startDay/endDay son días del mes; la imagen no indica a qué mes corresponden.
    serviceRules: [
      {
        id: 'piso_matutino', shift: 'matutino', service: 'piso',
        residents: [
          { name: 'Palencia', grade: 1 },
          { name: 'Estrada', grade: 1 },
          { name: 'González', grade: 1, startDay: 1, endDay: 16 },
          { name: 'García', grade: 1, startDay: 19, endDay: 30 }
        ]
      },
      {
        id: 'urgencias_matutino', shift: 'matutino', service: 'urgencias',
        residents: [{ name: 'Corral', grade: 1 }]
      },
      {
        id: 'qx_vespertino', shift: 'vespertino', service: 'qx',
        residents: [{ name: 'Corral', grade: 1 }]
      },
      {
        id: 'qx_matutino', shift: 'matutino', service: 'qx',
        residents: [{ name: 'Paredes', grade: 1 }, { name: 'Carlos', grade: 1, startDay: 19, endDay: 30 }]
      },
      {
        id: 'piso_vespertino', shift: 'vespertino', service: 'piso',
        residents: [{ name: 'Paredes', grade: 1 }, { name: 'Carlos', grade: 1, startDay: 19, endDay: 30 }]
      },
      {
        id: 'consulta_vespertino', shift: 'vespertino', service: 'consulta',
        residents: [{ name: 'Chávez', grade: 1 }]
      }
    ],
    absences: [],
    dailyOverrides: {},
    guardGroups: ['A', 'B', 'C', 'D'].map(id => ({ id, name: 'Guardia ' + id, members: [] })),
    dutySelection: { guardGroupId: 'A' },
    mobileAssignments: { matutino: [], vespertino: [] },
    r1Priorities: {},
    settings: { showDoctors: true, includeGuards: false, includeServiceSupport: true, includeDate: false, excludePostGuard: true, postGuardMode: 'previous', floorR1Reminder: false },
    history: [],
    sourceNotes: [
      'El rol semanal y las combinaciones iniciales proceden de las imágenes proporcionadas. Revisa las asignaciones antes de compartir el texto.',
      'Las guardias se forman manualmente con R1 y R2: de tres a seis grupos, con hasta diez integrantes por grupo. Avanzan cada día desde la fecha de la guardia registrada; el grupo del día anterior queda de postguardia.',
      'Un móvil sólo sustituye al fijo emparejado cuando éste está ausente o de postguardia. Los R3 y R4 conservan su médico y aparecen como Rotantes.',
      'Se conservan las actividades de residencia de Quiroz y Leyva, las coberturas de García M. y Beltrán F., y el horario manual de Esquer.',
      'Las ausencias de médicos pueden tener cobertura de cualquier turno. Las ausencias de residentes se aplican a todos sus servicios durante las fechas registradas.',
      'Las salas QX 1 a QX 6 se asignan por fecha y turno. Cada médico conserva su línea y sus residentes; en una misma sala se respeta el orden en que se agregaron.',
      'El rol de cada R1 puede configurarse por turno en Equipo: servicio o médico de base. Los servicios lo distribuyen entre los médicos disponibles; si el destino no está disponible, queda en Piso.'
    ]
  };

  root.ROLERO_DEFAULTS = defaults;
  if (typeof module !== 'undefined' && module.exports) module.exports = { defaults };
})(typeof window !== 'undefined' ? window : globalThis);
