import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';

import { PANEL_ROW_CLASS } from '@/shared/ui/atoms/panel-row';

/**
 * Una fila que lleva a una página: icono y nombre.
 *
 * Exportada porque Mi cuenta, dentro de la app del teléfono, ofrece las
 * secciones de administración con esta misma fila —esta hoja no se monta
 * allí—. Un componente y no una copia: la primera copia aprendería a marcar
 * algo que la otra no.
 */
export function LinkRow({
  Icon,
  to,
  onNavigate,
  children,
}: {
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  to: string;
  /**
   * Cerrar la hoja es de la fila y no del armazón.
   *
   * El armazón cierra lo que tapa la página cada vez que cambia la RUTA, y dos
   * de estas filas no la cambian: estando ya en Mi cuenta, ir a su ancla de
   * Seguridad deja la ruta igual y la hoja se habría quedado abierta encima
   * del sitio al que acababa de llevar. Fuera de una hoja no hay nada que
   * cerrar, y por eso es opcional.
   */
  onNavigate?: () => void;
  children: string;
}) {
  return (
    <Link to={to} onClick={onNavigate} className={PANEL_ROW_CLASS}>
      <Icon className="size-4 shrink-0 opacity-70" aria-hidden={true} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Link>
  );
}
