-- El "i de N" sale del NOMBRE y pasa a calcularse.
--
-- El lote inicial se guardó con el nombre del archivo tal como venía, y en él
-- venía horneado el total: "Claro Movil - 2024-10-03 - 1 de 3.pdf". Ese 3 deja
-- de ser cierto en cuanto se añade un cuarto soporte, y para arreglarlo habría
-- que renombrar los tres anteriores cada vez.
--
-- El orden ya vive en su columna, así que el nombre se queda con lo que no
-- cambia —concepto y fecha— y el "i de N" se calcula al mirarlo: i del orden,
-- N del conteo. Así lo subido desde la aplicación y lo importado se nombran
-- igual.
UPDATE "soportes"
SET "nombre_archivo" = regexp_replace(
      "nombre_archivo",
      ' - [0-9]+ de [0-9]+(\.[A-Za-z0-9]+)$',
      '\1'
    )
WHERE "nombre_archivo" ~ ' - [0-9]+ de [0-9]+\.[A-Za-z0-9]+$';
