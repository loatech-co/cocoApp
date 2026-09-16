import type { Readable } from 'node:stream';

import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { abrir, existe } from './soportes.almacen';

/** La ficha de un soporte, sin el binario. Es lo que se lista en el modal. */
export interface SoporteView {
  id: bigint;
  orden: number;
  nombre_archivo: string;
  mime_type: string;
  tamano: number;
  /** Si el binario está de verdad en el almacén. */
  disponible: boolean;
}

@Injectable()
export class SoportesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Los soportes de un movimiento.
   *
   * ── Por qué el `userId` va en el WHERE y no en un `if` ──────────────────
   * Porque un `if` se olvida y un `where` no. Pedir los soportes de un
   * movimiento ajeno no devuelve "prohibido": devuelve la lista vacía, porque
   * para esta consulta esos soportes no existen. No hay una rama del código
   * donde la comprobación pueda saltarse.
   */
  async listar(userId: bigint, transactionId: bigint): Promise<SoporteView[]> {
    const filas = await this.prisma.soporte.findMany({
      where: { userId, transactionId },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
    });

    return filas.map((s) => ({
      id: s.id,
      orden: s.orden,
      nombre_archivo: s.nombreArchivo,
      mime_type: s.mimeType,
      tamano: s.tamano,
      disponible: existe(s.storageKey),
    }));
  }

  /**
   * El binario de un soporte, con su ficha.
   *
   * Las TRES condiciones van juntas en el mismo `where`: el soporte, su
   * movimiento y su dueño. Pedir el soporte de otro con un id de movimiento
   * propio —o al revés— no encuentra nada.
   *
   * ── Por qué 404 y no 403 ────────────────────────────────────────────────
   * Un 403 confirma que el recurso existe. Con una lista de ids y un puñado
   * de peticiones, esa diferencia dibuja el mapa de lo que hay en la base de
   * otro. Para quien no es el dueño, aquí no hay nada, y eso es lo que se
   * responde.
   */
  async descargar(
    userId: bigint,
    transactionId: bigint,
    soporteId: bigint,
  ): Promise<{ flujo: Readable; nombre: string; mime: string; tamano: number }> {
    const soporte = await this.prisma.soporte.findFirst({
      where: { id: soporteId, transactionId, userId },
    });

    if (!soporte) throw new NotFoundException('No existe ese soporte.');

    const flujo = abrir(soporte.storageKey);
    if (!flujo) {
      // La ficha está y el archivo no. Es un estado posible —un almacén a
      // medio sincronizar— y decirlo así es más útil que un 404 pelado, que
      // haría pensar que el soporte nunca existió.
      throw new NotFoundException('El archivo de ese soporte no está en el almacén.');
    }

    return {
      flujo,
      nombre: soporte.nombreArchivo,
      mime: soporte.mimeType,
      tamano: soporte.tamano,
    };
  }
}
