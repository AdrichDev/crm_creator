import { describe, it, expect } from 'vitest';
import { parseCsvToRows } from '@/lib/comercial/csv';

describe('parseCsvToRows (RF-03)', () => {
  it('mapea cabeceras con sinónimos y tildes', () => {
    const csv = 'Nombre,Teléfono,Email,Dirección,Ciudad\nAna Gómez,600555666,ana@mail.com,Calle Mayor 1,Madrid';
    const rows = parseCsvToRows(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ nombre: 'Ana Gómez', telefono: '600555666', email: 'ana@mail.com', direccion: 'Calle Mayor 1', localidad: 'Madrid' });
  });

  it('soporta separador punto y coma', () => {
    const csv = 'nombre;telefono\nLuis;611222333';
    const rows = parseCsvToRows(csv);
    expect(rows[0]).toEqual({ nombre: 'Luis', telefono: '611222333' });
  });

  it('respeta comillas con comas internas', () => {
    const csv = 'nombre,direccion\n"Bar, El Rincón","Calle A, 3"';
    const rows = parseCsvToRows(csv);
    expect(rows[0].nombre).toBe('Bar, El Rincón');
    expect(rows[0].direccion).toBe('Calle A, 3');
  });

  it('ignora filas sin nombre y CSV vacío', () => {
    expect(parseCsvToRows('')).toHaveLength(0);
    expect(parseCsvToRows('nombre,telefono\n,600000000')).toHaveLength(0);
  });
});
