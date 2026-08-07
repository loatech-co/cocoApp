import type { CategoryKind } from '@prisma/client';

/**
 * Diccionario inicial sugerido, adaptado al contexto colombiano.
 *
 * Es una SUGERENCIA, no un esquema: el usuario renombra, archiva, reordena o
 * amplía lo que quiera. Existe para que nadie arranque frente a una pantalla
 * vacía teniendo que inventarse una taxonomía.
 *
 * Colores: salen todos de la paleta cerrada del proyecto (índigo, morado,
 * ámbar, teal, azul) en distintas intensidades. No hay ni un hue fuera de ella,
 * y el rojo no aparece: está reservado para errores.
 *
 * Iconos: nombres de lucide, el único set permitido.
 */

export interface CategoriaSembrada {
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
  children: { name: string; icon: string }[];
}

export const DICCIONARIO_INICIAL: readonly CategoriaSembrada[] = [
  {
    name: 'Hogar y servicios',
    kind: 'expense',
    color: '#2A2058',
    icon: 'house',
    children: [
      { name: 'Arriendo o cuota', icon: 'key' },
      { name: 'Administración', icon: 'building' },
      { name: 'Energía', icon: 'zap' },
      { name: 'Agua', icon: 'droplet' },
      { name: 'Gas', icon: 'flame' },
      { name: 'Internet y TV', icon: 'wifi' },
      { name: 'Telefonía', icon: 'smartphone' },
      { name: 'Mantenimiento', icon: 'wrench' },
    ],
  },
  {
    name: 'Alimentación',
    kind: 'expense',
    color: '#089C89',
    icon: 'utensils',
    children: [
      { name: 'Mercado', icon: 'shopping-cart' },
      { name: 'Restaurantes', icon: 'utensils-crossed' },
      { name: 'Domicilios', icon: 'bike' },
      { name: 'Café y snacks', icon: 'coffee' },
    ],
  },
  {
    name: 'Vehículo',
    kind: 'expense',
    color: '#7F4886',
    icon: 'car',
    children: [
      { name: 'Combustible', icon: 'fuel' },
      { name: 'Mantenimiento', icon: 'wrench' },
      { name: 'Peajes', icon: 'circle-parking' },
      { name: 'Parqueadero y lavado', icon: 'square-parking' },
      { name: 'Impuesto vehicular', icon: 'file-text' },
      { name: 'Revisión técnico-mecánica', icon: 'clipboard-check' },
    ],
  },
  {
    name: 'Seguros',
    kind: 'expense',
    color: '#77BFC9',
    icon: 'shield',
    children: [
      { name: 'SOAT', icon: 'shield-check' },
      { name: 'Todo riesgo', icon: 'car-front' },
      { name: 'Salud y prepagada', icon: 'heart-pulse' },
      { name: 'Vida', icon: 'shield-half' },
    ],
  },
  {
    name: 'Salud',
    kind: 'expense',
    color: '#0A7063',
    icon: 'stethoscope',
    children: [
      { name: 'EPS y copagos', icon: 'building-2' },
      { name: 'Medicamentos', icon: 'pill' },
      { name: 'Consultas', icon: 'user-round' },
      { name: 'Odontología', icon: 'smile' },
    ],
  },
  {
    name: 'Transporte',
    kind: 'expense',
    color: '#3B8B99',
    icon: 'bus',
    children: [
      { name: 'Transporte público', icon: 'train-front' },
      { name: 'Taxi y apps', icon: 'car-taxi-front' },
      { name: 'Vuelos', icon: 'plane' },
    ],
  },
  {
    name: 'Educación',
    kind: 'expense',
    color: '#43356F',
    icon: 'graduation-cap',
    children: [
      { name: 'Matrícula', icon: 'school' },
      { name: 'Cursos', icon: 'book-open' },
      { name: 'Libros y útiles', icon: 'book' },
    ],
  },
  {
    name: 'Ocio',
    kind: 'expense',
    color: '#9C60AB',
    icon: 'party-popper',
    children: [
      { name: 'Suscripciones', icon: 'tv' },
      { name: 'Cine y eventos', icon: 'ticket' },
      { name: 'Viajes', icon: 'luggage' },
      { name: 'Deporte y gimnasio', icon: 'dumbbell' },
    ],
  },
  {
    name: 'Personal',
    kind: 'expense',
    color: '#B885C3',
    icon: 'shirt',
    children: [
      { name: 'Ropa y calzado', icon: 'shopping-bag' },
      { name: 'Cuidado personal', icon: 'scissors' },
      { name: 'Regalos', icon: 'gift' },
    ],
  },
  {
    name: 'Mascotas',
    kind: 'expense',
    color: '#56A8B5',
    icon: 'paw-print',
    children: [
      { name: 'Alimento', icon: 'bone' },
      { name: 'Veterinario', icon: 'syringe' },
    ],
  },
  {
    name: 'Financiero',
    kind: 'expense',
    color: '#FBBF40',
    icon: 'landmark',
    children: [
      { name: 'Intereses', icon: 'percent' },
      { name: 'Cuota de manejo', icon: 'credit-card' },
      { name: 'Comisiones', icon: 'receipt' },
      { name: '4×1000 (GMF)', icon: 'banknote' },
    ],
  },
  {
    name: 'Impuestos',
    kind: 'expense',
    color: '#A96209',
    icon: 'file-text',
    children: [
      { name: 'Renta', icon: 'file-check' },
      { name: 'Predial', icon: 'home' },
    ],
  },
  {
    name: 'Ingresos',
    kind: 'income',
    color: '#089C89',
    icon: 'trending-up',
    children: [
      { name: 'Salario', icon: 'wallet' },
      { name: 'Honorarios', icon: 'briefcase' },
      { name: 'Rendimientos', icon: 'chart-line' },
      { name: 'Arriendos recibidos', icon: 'building' },
      { name: 'Reembolsos', icon: 'undo-2' },
      { name: 'Otros ingresos', icon: 'plus' },
    ],
  },
  {
    name: 'Transferencias',
    kind: 'transfer',
    color: '#77BFC9',
    icon: 'arrow-left-right',
    children: [
      { name: 'Entre cuentas propias', icon: 'repeat' },
      { name: 'Pago de tarjeta', icon: 'credit-card' },
      { name: 'Aporte a meta', icon: 'target' },
    ],
  },
] as const;
