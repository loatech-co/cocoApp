import { ArgumentMetadata } from '@nestjs/common';
import { IsInt, IsOptional, IsString } from 'class-validator';

import { FieldValidationPipe } from './field-validation.pipe';
import { IfPresent } from './if-present.decorator';

class Edit {
  @IfPresent()
  @IsInt()
  accountId?: number;

  @IsOptional()
  @IsString()
  note?: string | null;
}

const metadata: ArgumentMetadata = { type: 'body', metatype: Edit };
const pipe = new FieldValidationPipe({ whitelist: true, transform: true });

async function fieldsOf(body: unknown): Promise<string[]> {
  try {
    await pipe.transform(body, metadata);
    return [];
  } catch (error) {
    const response = (error as { getResponse(): { fields: { field: string }[] } }).getResponse();
    return response.fields.map((f) => f.field);
  }
}

describe('IfPresent', () => {
  it('lets the field be left out', async () => {
    expect(await fieldsOf({})).toEqual([]);
  });

  it('checks the field when it is present', async () => {
    expect(await fieldsOf({ accountId: 3 })).toEqual([]);
    expect(await fieldsOf({ accountId: 'x' })).toEqual(['accountId']);
  });

  it('rejects null, unlike IsOptional', async () => {
    expect(await fieldsOf({ accountId: null })).toEqual(['accountId']);
    expect(await fieldsOf({ note: null })).toEqual([]);
  });
});
