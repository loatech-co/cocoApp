import { Eye, KeyRound, LogOut, ScrollText, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { ComponentType } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Avatar } from '@/components/navegacion';
import { FILA_DE_PANEL, PanelInferior } from '@/components/panel-inferior';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

/**
 * La hoja del avatar.
 *
 * ── Qué contesta ────────────────────────────────────────────────────────────
 * Lo mismo que el menú de la cuenta del riel en el escritorio: «¿con qué
 * cuenta estoy dentro?» y «¿por dónde salgo?». Lo de en medio son las páginas
 * que se configuran una vez y casi no se tocan — las que no merecen un hueco
 * fijo en una barra de cinco.
 *
 * ── Por qué sube desde abajo y no baja desde el avatar ──────────────────────
 * Porque el avatar vive en la esquina de abajo a la derecha. Un desplegable
 * colgado de ahí crece hacia el borde y hacia el pie: se recorta contra los
 * dos. Una hoja llega por el mismo borde por el que se tocó, que es el único
 * movimiento que el ojo puede seguir de vuelta.
 *
 * ── El perfil no es una fila más ────────────────────────────────────────────
 * Va en la cabeza, con su avatar, su nombre y su correo. Es lo que la hoja
 * CONTESTA nada más abrirse —con qué cuenta se está dentro—, y puesto como
 * sexta fila haría falta leerlo para encontrarlo. El correo va debajo del
 * nombre porque dos personas pueden llamarse igual y no tener el mismo correo.
 *
 * ── Lo que no está para todo el mundo, no está ──────────────────────────────
 * Usuarios y Bitácora son de administración: quien no lo es no las tiene ni
 * apagadas ni escondidas con CSS. Ausentes, como en el riel.
 */
export function PanelDeLaCuenta({
  abierto,
  onCerrar,
}: {
  abierto: boolean;
  onCerrar: () => void;
}) {
  const { usuario, esAdmin, esAdminDeVerdad, viendoComoUsuario, verComoUsuario, salir } =
    useAuth();
  const navegar = useNavigate();
  const nombre = usuario?.display_name ?? usuario?.email ?? '?';

  return (
    <PanelInferior abierto={abierto} titulo="Mi cuenta" cabeza={<Perfil nombre={nombre} />} onCerrar={onCerrar}>
      <div className="flex flex-col">
        {/*
          Ajustes y Seguridad son dos TROZOS de Mi cuenta, no dos pantallas.
          Por eso van por ancla y no por ruta: partir esa página en tres dejaría
          tres pantallas de una tarjeta cada una, y la de en medio sin nada que
          justificara el viaje. El ancla lleva al sitio exacto y la página sigue
          siendo una.
        */}
        <Fila Icono={SlidersHorizontal} a="/mi-cuenta#ajustes" onIr={onCerrar}>
          Ajustes
        </Fila>

        {esAdmin && (
          <Fila Icono={ShieldCheck} a="/administracion" onIr={onCerrar}>
            Usuarios
          </Fila>
        )}

        <Fila Icono={KeyRound} a="/mi-cuenta#seguridad" onIr={onCerrar}>
          Seguridad
        </Fila>

        {esAdmin && (
          <Fila Icono={ScrollText} a="/administracion/bitacora" onIr={onCerrar}>
            Bitácora
          </Fila>
        )}

        {/* La raya, y no un hueco: lo de abajo no lleva a ninguna página. */}
        <hr className="my-2 border-border" />

        {/*
          Ver la aplicación como la ve quien no administra nada.

          Se enseña con el rol DE VERDAD y no con el efectivo: encendida la
          vista, `esAdmin` es falso —para eso está— y con esa condición el
          interruptor desaparecería justo cuando hace falta para apagarlo.
        */}
        {esAdminDeVerdad && (
          <button
            type="button"
            onClick={() => {
              onCerrar();
              verComoUsuario(!viendoComoUsuario);
              // Encendiéndola desde una pantalla de administración, quedarse
              // sería quedarse mirando un «no tienes acceso».
              if (!viendoComoUsuario) navegar('/');
            }}
            className={FILA_DE_PANEL}
          >
            {viendoComoUsuario ? (
              <ShieldCheck className="size-4 shrink-0 opacity-70" aria-hidden="true" />
            ) : (
              <Eye className="size-4 shrink-0 opacity-70" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {viendoComoUsuario ? 'Volver a administrador' : 'Ver como usuario'}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => void salir()}
          className={cn(FILA_DE_PANEL, 'font-medium text-destructive hover:bg-destructive/10')}
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Cerrar sesión</span>
        </button>
      </div>
    </PanelInferior>
  );
}

/**
 * La cabeza: con qué cuenta se está dentro.
 *
 * Es un enlace a Mi cuenta —lo que uno espera al tocar su propia cara— y no un
 * rótulo: la página entera está detrás, y las dos filas de abajo solo llevan a
 * trozos suyos.
 */
function Perfil({ nombre }: { nombre: string }) {
  const { usuario } = useAuth();

  return (
    <Link
      to="/mi-cuenta"
      className={cn(FILA_DE_PANEL, '-mx-1.5 gap-3')}
      aria-label={`Mi cuenta, ${nombre}`}
    >
      <Avatar nombre={nombre} className="size-10" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-base font-semibold">
          {usuario?.display_name ?? '—'}
        </span>
        {usuario?.email && (
          <span className="block truncate text-xs text-muted-foreground">{usuario.email}</span>
        )}
      </span>
    </Link>
  );
}

function Fila({
  Icono,
  a,
  onIr,
  children,
}: {
  Icono: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  a: string;
  /**
   * Cerrar la hoja es de la fila y no del armazón.
   *
   * El armazón cierra lo que tapa la página cada vez que cambia la RUTA, y dos
   * de estas filas no la cambian: estando ya en Mi cuenta, ir a su ancla de
   * Seguridad deja la ruta igual y la hoja se habría quedado abierta encima
   * del sitio al que acababa de llevar.
   */
  onIr: () => void;
  children: string;
}) {
  return (
    <Link to={a} onClick={onIr} className={FILA_DE_PANEL}>
      <Icono className="size-4 shrink-0 opacity-70" aria-hidden={true} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Link>
  );
}
