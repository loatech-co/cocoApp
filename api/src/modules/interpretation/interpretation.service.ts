import { Injectable } from '@nestjs/common';

import type { SearchableNode } from '@coco/receipt-parser';

import { DUPLICATING_SOURCES, twinCriteria, twinVerdict, type NewCapture } from './duplicates';
import {
  interpret,
  summaryOf,
  type InterpretedClassification,
  type Interpreted,
} from './interpret';
import {
  classificationOf,
  interpretationOf,
  todayInBogota,
  categoryIdToSave,
  notesOf,
  type Capture,
  type Interpretation,
} from './interpretation.domain';
import type { CaptureBodyDto, InterpretBodyDto } from './interpretation.dto';
import { nest } from '../../common/categories/categories.tree';
import { DuplicateError, NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { CategoryLookupService } from '../categories/category-lookup.service';
import { CategorizationService } from '../categorization/categorization.service';
import { LedgerService } from '../transactions/ledger.service';
import { TransactionsService, type Transaction } from '../transactions/transactions.service';

/**
 * The one brain: interprets, classifies, detects duplicates and records.
 *
 * ── Two doors, one head ─────────────────────────────────────────────────────
 * `interpret` writes nothing: it fills a form before confirming. `capture`
 * does it all at once —interpret, classify, look for the other side of the
 * same payment and create— for whoever has no form in front of them: a
 * Shortcuts action in the background, an incoming SMS.
 *
 * The decision itself lives in `interpret()` and `decideDuplicate()`, which
 * are pure functions; here they are only handed what they need from the
 * database, and what they say gets written.
 */
@Injectable()
export class InterpretationService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly categories: CategoryLookupService,
    private readonly categorization: CategorizationService,
    private readonly transactions: TransactionsService,
  ) {}

  async interpret(userId: bigint, dto: InterpretBodyDto): Promise<Interpretation> {
    const interpreted = await this.read(userId, dto);
    return interpretationOf(interpreted);
  }

  async capture(userId: bigint, dto: CaptureBodyDto): Promise<Capture> {
    /*
      ── Idempotency, before anything else ───────────────────────────────────
      A client that retries sends the same `external_ref`. If it is already
      there, what exists is returned and nothing is interpreted or created:
      the answer is the same one it got —or never got— the first time.
    */
    const existingId = await this.ledger.findIdByExternalRef(userId, dto.external_ref);
    if (existingId !== null) return this.alreadyRecorded(userId, existingId, dto, true, false);

    /*
      ── The choice wins ─────────────────────────────────────────────────────
      If the person already chose the concept in the quick form, the engine
      has nothing to propose: the choice is checked to be theirs and able to
      classify, and saved as is. It is resolved BEFORE interpreting so a bad
      id answers 422 without spending a read of the tree.
    */
    const chosen =
      dto.category_id === undefined
        ? null
        : await this.chosenClassification(userId, BigInt(dto.category_id));
    const interpreted = await this.read(userId, dto, chosen);
    const capturedAt = dto.captured_at ? new Date(dto.captured_at) : new Date();

    const incoming: NewCapture = {
      source: dto.source,
      // With no readable date, the moment of the capture: an expense needs a
      // day, and the capture's is the best approximation. It stays flagged.
      date: interpreted.date ?? capturedAt.toISOString().slice(0, 10),
      // With no amount, zero and flagged: Wallet sometimes runs out of time and
      // sends the transaction without a value. Losing it would be worse than
      // recording it at zero for somebody to fill in the figure.
      amount: interpreted.amount ?? '0',
      capturedAt,
      rawText: dto.texto ?? null,
      merchant: interpreted.merchant,
      description: interpreted.description,
    };

    return this.record(userId, dto, incoming, interpreted);
  }

  /*
    ── The other side of the same payment ──────────────────────────────────
    Only from Wallet or SMS. Looking for the twin and writing go in ONE
    transaction, under a lock per person and amount (`LedgerService.
    createUnlessTwin`): if Wallet and the SMS arrive together, the second
    waits for the first and finds it. Exact: the existing one is enriched and
    returned. Partial: it is created, but flagged. The pure function decides.
  */
  private async record(
    userId: bigint,
    dto: CaptureBodyDto,
    incoming: NewCapture,
    interpreted: Interpreted,
  ): Promise<Capture> {
    const newTransaction = newTransactionOf(dto, incoming, interpreted);
    try {
      if (!DUPLICATING_SOURCES.has(dto.source)) {
        return createdCapture(await this.transactions.create(userId, newTransaction), interpreted);
      }
      const prepared = await this.transactions.prepareCreate(userId, newTransaction);
      const outcome = await this.ledger.createUnlessTwin(
        prepared,
        twinCriteria(userId, dto.source, incoming),
        (rows) => twinVerdict(incoming, rows),
      );
      if (outcome.kind === 'merged') {
        return await this.alreadyRecorded(
          userId,
          outcome.id,
          dto,
          false,
          true,
          interpreted.classification,
        );
      }
      return createdCapture(await this.transactions.get(userId, outcome.id), interpreted);
    } catch (error) {
      /*
        Two captures with the same `external_ref` at once —two retries that
        cross— both pass the check above and both get to insert. The second
        hits the unique index: that is idempotency doing its job in the
        database, and the answer is the same as if it had been there from the
        start.
      */
      if (!(error instanceof DuplicateError)) throw error;
      const existingId = await this.ledger.findIdByExternalRef(userId, dto.external_ref);
      // Parity with the former findFirstOrThrow: a vanished row is a 404.
      if (existingId === null) throw new NotFoundError('El recurso no existe.');
      return this.alreadyRecorded(userId, existingId, dto, true, false, interpreted.classification);
    }
  }

  // ── Plumbing ───────────────────────────────────────────────────────────────

  private async read(
    userId: bigint,
    dto: InterpretBodyDto,
    chosen: InterpretedClassification | null = null,
  ): Promise<Interpreted> {
    const amount = dto.monto?.replace(',', '.');
    if (!dto.texto?.trim() && !dto.comercio?.trim()) {
      /*
        An expense typed by hand on the phone —concept and amount, nothing
        else— has nothing to interpret: there is no text to get a merchant or a
        date from, and the classification is already decided. The result is
        built directly without going through `interpret()`, which would keep
        searching in the void. Without an amount or a choice, something is
        indeed missing.
      */
      if (chosen && amount !== undefined) {
        return {
          amount,
          date: dto.fecha ?? null,
          merchant: null,
          description: null,
          classification: chosen,
          needsReview: chosen.certainty !== 'alta',
        };
      }
      throw new ValidationError('Hace falta un texto o, al menos, el comercio.', {
        code: 'interpretation_needs_text',
      });
    }

    const [tree, history] = await Promise.all([
      this.treeOf(userId),
      // The history is asked with the closest thing to a description: the
      // merchant if it came; otherwise the text. A whole SMS carries a lot of
      // bank noise and the history shows it in its confidence, which is right.
      this.categorization.suggestFor(userId, dto.comercio?.trim() || dto.texto?.trim() || ''),
    ]);

    const parsed = interpret(
      {
        text: dto.texto,
        merchant: dto.comercio,
        amount,
        date: dto.fecha,
        fileName: dto.nombre_de_archivo,
        period: dto.periodo,
      },
      {
        tree,
        history: history
          ? { categoryId: String(history.categoryId), confidence: history.confidence }
          : null,
        today: todayInBogota(),
      },
    );
    if (!chosen) return parsed;

    // What the engine understood from the text —amount, date, merchant—
    // stays; what it proposed as a classification does not: the person
    // already decided. And what flags for review is only a half choice (a
    // category without a concept), not the engine's doubt, which does not
    // count here.
    return { ...parsed, classification: chosen, needsReview: chosen.certainty !== 'alta' };
  }

  /**
   * The classification the person chose by hand, with the same shape as the
   * engine's proposal so the rest of the way cannot tell them apart.
   *
   * A concept (depth 3) is high certainty: fully classified. A category
   * (depth 2) is medium and for review: halfway in the right place, just as
   * when the engine only gets that far and as in the web's search, which
   * offers both. A cost center classifies nothing —transactions live three
   * levels below— and what is archived does not come back, so neither is
   * accepted.
   */
  private async chosenClassification(
    userId: bigint,
    id: bigint,
  ): Promise<InterpretedClassification> {
    const row = await this.categories.findChosen(userId, id);
    // The same answer for «does not exist» and «is not yours»: telling which
    // would reveal other people's ids.
    if (!row)
      throw new ValidationError('La categoría indicada no existe o no es tuya.', {
        code: 'category_not_owned',
      });
    if (row.isArchived)
      throw new ValidationError('Ese concepto está archivado.', { code: 'concept_archived' });
    if (!row.parent)
      throw new ValidationError('Un centro de costos no clasifica nada: elige un concepto.', {
        code: 'cost_center_cannot_classify',
      });

    const isConcept = row.parent.parentId !== null;
    return {
      certainty: isConcept ? 'alta' : 'media',
      source: null,
      conceptId: isConcept ? row.id.toString() : null,
      categoryId: isConcept ? row.parent.id.toString() : row.id.toString(),
      name: row.name,
      candidates: [],
      reason: 'Lo eligió la persona.',
    };
  }

  /**
   * The person's tree, with ids as strings, without what is archived.
   *
   * Archived means «this is not coming back»: proposing it would classify
   * today's expense under the gym that was cancelled.
   */
  private async treeOf(userId: bigint): Promise<SearchableNode[]> {
    const rows = await this.categories.findSearchable(userId);
    const toNode = (f: {
      id: bigint;
      name: string;
      keywords: string[];
      children: unknown[];
    }): SearchableNode => ({
      id: f.id.toString(),
      name: f.name,
      keywords: f.keywords,
      children: (f.children as (typeof f)[]).map(toNode),
    });
    return nest(rows).map(toNode);
  }

  private async alreadyRecorded(
    userId: bigint,
    id: bigint,
    dto: CaptureBodyDto,
    isDuplicate: boolean,
    isMerged: boolean,
    classification?: InterpretedClassification,
  ): Promise<Capture> {
    const transaction = await this.transactions.get(userId, id);
    const shown: InterpretedClassification = classification ??
      // A repeat is not interpreted again: what matters is what was saved,
      // and that is what it is told.
      {
        certainty: transaction.categoryId === null ? 'ninguna' : 'alta',
        source: null,
        conceptId: transaction.categoryId === null ? null : transaction.categoryId.toString(),
        categoryId: null,
        name: null,
        candidates: [],
        reason: `Ya estaba registrado con la referencia ${dto.external_ref}.`,
      };
    return {
      transaction,
      classification: classificationOf(shown),
      summary: isMerged
        ? `Era el mismo pago: ${summaryOf(transaction.amount, shown).replace(/^Registrado: /, '')}`
        : summaryOf(transaction.amount, shown),
      isDuplicate,
      isMerged,
    };
  }
}

/** What `TransactionsService` needs to create, without importing its DTO (modules talk through services). */
type NewTransaction = Parameters<TransactionsService['create']>[1];

/** What a capture writes, as `TransactionsService` asks for it. */
function newTransactionOf(
  dto: CaptureBodyDto,
  incoming: NewCapture,
  interpreted: Interpreted,
): NewTransaction {
  return {
    date: incoming.date,
    amount: incoming.amount,
    type: 'expense',
    category_id: categoryIdToSave(interpreted.classification),
    description: interpreted.description ?? undefined,
    merchant: interpreted.merchant ?? undefined,
    notes: notesOf(dto.nota, interpreted.amount),
    external_ref: dto.external_ref,
    source: dto.source,
    raw_text: dto.texto ?? null,
    captured_at: incoming.capturedAt.toISOString(),
    por_revisar: interpreted.needsReview,
  };
}

function createdCapture(created: Transaction, interpreted: Interpreted): Capture {
  return {
    transaction: created,
    classification: classificationOf(interpreted.classification),
    summary: summaryOf(interpreted.amount, interpreted.classification),
    isDuplicate: false,
    isMerged: false,
  };
}
