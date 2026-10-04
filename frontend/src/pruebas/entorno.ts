/**
 * Lo que jsdom no trae y el código sí necesita.
 *
 * ── `matchMedia` ────────────────────────────────────────────────────────────
 * jsdom no lo implementa, y desde que `Menu` pregunta si está por debajo del
 * corte —para abrirse como hoja en vez de colgar del botón— media aplicación
 * pasa por ahí: un desplegable, un selector de fecha, un filtro. Sin esto,
 * treinta pruebas que no hablan del teléfono para nada se caen con
 * «window.matchMedia is not a function».
 *
 * Contesta que NO es un teléfono, que es la misma respuesta que da el código
 * cuando no hay ventana que medir: pinta el riel y los desplegables cuelgan de
 * su botón, que es lo que casi todas las pruebas están mirando. La que quiera
 * la otra respuesta la escribe ella —`app-shell.test.tsx` lo hace—, y para eso
 * esto solo se pone si no hay nada puesto.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (consulta: string) => ({
    matches: false,
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
