import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { spanishValidationMessage, TRANSLATED_CONSTRAINTS } from './validation-messages';

/** Every class-validator decorator without its own message, failing once. */
class EveryDefault {
  @IsString() text: unknown = 1;
  @IsInt() whole: unknown = 1.5;
  @IsNumber() number: unknown = 'x';
  @IsBoolean() flag: unknown = 'x';
  @IsArray() list: unknown = 'x';
  @IsNotEmpty() filled: unknown = '';
  @IsEmail() email: unknown = 'x';
  @IsUUID() id: unknown = 'x';
  @IsDateString() day: unknown = 'x';
  @IsISO8601() moment: unknown = 'x';
  @IsIn(['a', 'b']) choice: unknown = 'c';
  @IsEnum(['admin', 'user']) role: unknown = 'x';
  @Matches(/^\d{4}$/) last4: unknown = 'x';
  @MaxLength(3) short: unknown = 'xxxx';
  @MinLength(3) long: unknown = 'x';
  @Min(1) page: unknown = 0;
  @Max(31) dayOfMonth: unknown = 32;
  @ArrayMaxSize(1) few: unknown = [1, 2];
  @ArrayMinSize(1) some: unknown = [];
  @IsString({ each: true }) tags: unknown = [1];
}

/** Imported from class-validator but not a constraint with a message. */
const NOT_A_CONSTRAINT = new Set([
  'IsOptional',
  'ValidateNested',
  'ValidateIf',
  'Allow',
  'validate',
  'validateSync',
  'registerDecorator',
  'ValidationArguments',
  'ValidationOptions',
  'ValidatorConstraint',
  'ValidatorConstraintInterface',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'generated' ? [] : sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('spanishValidationMessage', () => {
  const errors = validateSync(new EveryDefault());

  it('translates every default into Spanish, naming the field', () => {
    const messages = errors.flatMap((error) =>
      Object.entries(error.constraints ?? {}).map(([constraint, message]) =>
        spanishValidationMessage(constraint, error.property, error.property, message),
      ),
    );

    expect(messages).toHaveLength(Object.keys(new EveryDefault()).length);
    for (const message of messages) expect(message).toMatch(/^(El campo|Cada valor del campo) «/);
  });

  it('keeps the numbers and the allowed values', () => {
    const byProperty = new Map(
      errors.map((e) => {
        const [constraint, message] = Object.entries(e.constraints ?? {})[0] ?? ['', ''];
        return [e.property, spanishValidationMessage(constraint, e.property, e.property, message)];
      }),
    );

    expect(byProperty.get('short')).toBe('El campo «short» admite como mucho 3 caracteres.');
    expect(byProperty.get('page')).toBe('El campo «page» no puede ser menor que 1.');
    expect(byProperty.get('choice')).toBe(
      'El campo «choice» tiene que ser uno de estos valores: a, b.',
    );
    expect(byProperty.get('tags')).toBe('Cada valor del campo «tags» tiene que ser un texto.');
  });

  it('translates the two checks class-validator writes itself', () => {
    expect(
      spanishValidationMessage(
        'whitelistValidation',
        'name',
        'name',
        'property name should not exist',
      ),
    ).toBe('El campo «name» no se admite en esta solicitud.');
    expect(
      spanishValidationMessage(
        'nestedValidation',
        'splits',
        'splits',
        'nested property splits must be either object or array',
      ),
    ).toBe('El campo «splits» tiene que ser un objeto o una lista.');
  });

  it("leaves a decorator's own message as it was written", () => {
    const own = 'last4 deben ser exactamente 4 dígitos.';
    expect(spanishValidationMessage('matches', 'last4', 'last4', own)).toBe(own);
    expect(
      spanishValidationMessage('isMoney', 'amount', 'amount', 'El importe no es válido.'),
    ).toBe('El importe no es válido.');
  });

  it('has a translation for every class-validator decorator the API uses', () => {
    // The decorators `EveryDefault` exercises, read from this very file.
    const covered = new Set(
      [...readFileSync(__filename, 'utf8').matchAll(/^ {2}@(\w+)\(/gm)].map((m) => m[1]),
    );
    const used = new Set<string>();
    for (const file of sourceFiles(join(__dirname, '..', '..'))) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'class-validator'/g)) {
        for (const name of (match[1] ?? '').split(',')) {
          const clean = name.replace(/^\s*type\s+/, '').trim();
          if (clean !== '') used.add(clean);
        }
      }
    }

    const missing = [...used].filter((name) => !NOT_A_CONSTRAINT.has(name) && !covered.has(name));
    expect(missing).toEqual([]);
  });

  it('has no translation that the decorators above do not exercise', () => {
    const exercised = new Set(errors.flatMap((e) => Object.keys(e.constraints ?? {})));
    expect(TRANSLATED_CONSTRAINTS.filter((c) => !exercised.has(c))).toEqual([]);
  });
});
