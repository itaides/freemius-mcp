import { describe, it, expect } from 'vitest';
import {
    assertWriteEnabled,
    assertConfirmed,
    WriteNotAllowedError,
    ConfirmationRequiredError,
} from '../../src/core/guards.js';

describe('assertWriteEnabled', () => {
    it('throws when write mode is off (fail-closed)', () => {
        expect(() => assertWriteEnabled(false)).toThrow(WriteNotAllowedError);
    });

    it('passes when write mode is on', () => {
        expect(() => assertWriteEnabled(true)).not.toThrow();
    });
});

describe('assertConfirmed', () => {
    it('passes when confirm echoes the target id', () => {
        expect(() => assertConfirmed('42', '42')).not.toThrow();
    });

    it('throws when confirm does not match the target id', () => {
        expect(() => assertConfirmed('42', '41')).toThrow(ConfirmationRequiredError);
    });

    it('throws when confirm is missing', () => {
        expect(() => assertConfirmed('42', undefined)).toThrow(ConfirmationRequiredError);
    });
});
