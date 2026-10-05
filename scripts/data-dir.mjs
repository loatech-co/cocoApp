// Where the real financial data lives: the historical CSV (`datos/`) and the
// database and receipt backups (`respaldos/`).
//
// It is OUTSIDE the repository on purpose: inside the project folder lives
// only the project and what it needs to run. Being in `.gitignore` is not a
// reason to keep real money data next to the code, where a stray `git add -f`,
// a zip of the folder or a sync tool can take it along.
//
// Override with COCO_DATA_DIR. The shell scripts read the same variable with
// the same default (scripts/respaldar.sh, scripts/soportes/backup-from-server.sh).
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DATA_DIR =
  process.env.COCO_DATA_DIR ?? join(homedir(), 'Documents', 'VS Code', 'Personal', 'coco-datos');

/** The canonical expenses CSV, the default `--csv` of the receipt scripts. */
export const DEFAULT_CSV = join(DATA_DIR, 'datos', 'Gastos_Consolidado.csv');
