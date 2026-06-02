// result.ts — the uniform return shape for every read/write handler (review #6/#7).
// Replaces the old `GetResult`/`toGetResult` and the bare-array list contract: a swallowed
// non-2xx now surfaces honestly as `{ ok:false, error }` instead of an empty array or a bare null.

export interface ApiError {
    code: string;
    message: string;
    status?: number;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const err = <T = never>(code: string, message: string, status?: number): Result<T> => ({
    ok: false,
    error: status === undefined ? { code, message } : { code, message, status },
});
