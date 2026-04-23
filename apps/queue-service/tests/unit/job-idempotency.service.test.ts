import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/db';
import type { JobIdempotencyRow } from '../../src/db/schema';
import { getBoss } from '../../src/queue/boss';
import { clearExistingJob } from '../../src/services/job-idempotency.service';

vi.mock('../../src/queue/boss', () => ({ getBoss: vi.fn() }));
vi.mock('../../src/db', () => ({
  db: {
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

const mockRow = (
  overrides: Partial<JobIdempotencyRow> = {},
): JobIdempotencyRow =>
  ({
    idempotencyKey: 'key-1',
    jobType: 'one_off',
    pgBossJobId: 'pg-job-123',
    queue: 'my-queue',
    createdAt: new Date(),
    ...overrides,
  }) as JobIdempotencyRow;

describe('clearExistingJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.delete).mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof db.delete>);
  });

  it('calls boss.cancel and db.delete when boss is available', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getBoss).mockReturnValue({
      cancel,
    } as unknown as ReturnType<typeof getBoss>);
    const row = mockRow();

    await clearExistingJob(row);

    expect(cancel).toHaveBeenCalledWith('my-queue', 'pg-job-123');
    expect(db.delete).toHaveBeenCalled();
    const whereCall = (db.delete as ReturnType<typeof vi.fn>).mock.results[0]
      ?.value?.where;
    expect(whereCall).toHaveBeenCalled();
  });

  it('still deletes from db when boss is null', async () => {
    vi.mocked(getBoss).mockReturnValue(null);
    const row = mockRow();

    await clearExistingJob(row);

    expect(db.delete).toHaveBeenCalled();
  });

  it('still deletes from db when boss.cancel throws', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('cancel failed'));
    vi.mocked(getBoss).mockReturnValue({
      cancel,
    } as unknown as ReturnType<typeof getBoss>);
    const row = mockRow();

    await clearExistingJob(row);

    expect(cancel).toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalled();
  });
});
