// reads.ts — shared shape for curated single-entity reads (docs/specs §5).
// Curated-error contract: a missing entity surfaces a clear not-found, never a bare null.

export type GetResult<T> = { found: true; data: T } | { found: false; id: string };

export function toGetResult<T>(entity: T | null, id: string): GetResult<T> {
    return entity ? { found: true, data: entity } : { found: false, id };
}
