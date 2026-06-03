// main.ts — the MCP Apps iframe view for create_coupon. Bundled (target:browser) by
// scripts/build-ui.ts into a self-contained HTML string at ../generated/coupon-form-html.ts.
// Vanilla DOM, no framework, no network beyond the host bridge (app.callServerTool).

import { App } from '@modelcontextprotocol/ext-apps';

interface Plan {
    id: number | string;
    title: string;
    name: string;
}

const app = new App({ name: 'freemius-coupon-form', version: '0.1.0' });

const form = document.getElementById('coupon-form') as HTMLFormElement;
const codeInput = document.getElementById('code') as HTMLInputElement;
const discountInput = document.getElementById('discount') as HTMLInputElement;
const discountTypeSelect = document.getElementById('discount-type') as HTMLSelectElement;
const plansContainer = document.getElementById('plans-container') as HTMLElement;
const plansLoading = document.getElementById('plans-loading') as HTMLElement;
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
const resultArea = document.getElementById('result') as HTMLElement;

// --- Plan loading ---

async function loadPlans(): Promise<void> {
    try {
        const result = await app.callServerTool({ name: 'list_plans', arguments: {} });
        const text = (result.content as Array<{ type: string; text: string }>)?.[0]?.text;
        if (!text) {
            plansLoading.textContent = 'No plans found.';
            return;
        }
        const data = JSON.parse(text);
        const plans: Plan[] = data?.plans ?? data ?? [];
        if (!Array.isArray(plans) || plans.length === 0) {
            plansLoading.textContent = 'No plans found.';
            return;
        }
        plansLoading.style.display = 'none';
        for (const plan of plans) {
            const label = document.createElement('label');
            label.className = 'plan-option';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.name = 'plans';
            cb.value = String(plan.id);
            label.appendChild(cb);
            label.appendChild(document.createTextNode(` ${plan.title || plan.name} (#${plan.id})`));
            plansContainer.appendChild(label);
        }
    } catch {
        plansLoading.textContent = 'Could not load plans.';
    }
}

// --- Validation ---

function validate(): string | null {
    const code = codeInput.value.trim();
    if (!code) return 'Code is required.';
    const discount = Number(discountInput.value);
    if (Number.isNaN(discount) || discount <= 0) return 'Discount must be a positive number.';
    if (discountTypeSelect.value === 'percentage' && discount > 100) return 'Percentage discount cannot exceed 100.';
    return null;
}

// --- Submit ---

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = validate();
    if (error) {
        showResult('error', error);
        return;
    }

    const code = codeInput.value.trim();
    const discount = Number(discountInput.value);
    const discount_type = discountTypeSelect.value;
    const planCheckboxes = plansContainer.querySelectorAll<HTMLInputElement>('input[name="plans"]:checked');
    const plans = Array.from(planCheckboxes).map((cb) => cb.value);

    const args: Record<string, unknown> = { code, discount, discount_type };
    if (plans.length > 0) args.plans = plans;

    setLoading(true);
    try {
        const result = await app.callServerTool({ name: 'create_coupon', arguments: args });
        if (result.isError) {
            const text = (result.content as Array<{ type: string; text: string }>)?.[0]?.text ?? '';
            let msg = 'Failed to create coupon.';
            try {
                const parsed = JSON.parse(text);
                if (parsed.error === 'WriteNotAllowedError' || parsed.message?.includes('write')) {
                    msg = 'Write mode is disabled. Set FREEMIUS_MCP_ALLOW_WRITE=1 to enable coupon creation.';
                } else {
                    msg = parsed.message || parsed.error?.message || text;
                }
            } catch {
                if (text) msg = text;
            }
            showResult('error', msg);
        } else {
            const text = (result.content as Array<{ type: string; text: string }>)?.[0]?.text ?? '';
            let detail = 'Coupon created successfully!';
            try {
                const parsed = JSON.parse(text);
                const coupon = parsed?.coupon ?? parsed;
                if (coupon?.id) detail = `Coupon created — ID: ${coupon.id}, code: ${coupon.code ?? code}`;
            } catch {
                // keep default detail
            }
            showResult('success', detail);
            form.reset();
        }
    } catch (err) {
        showResult('error', `Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
        setLoading(false);
    }
});

// --- UI helpers ---

function showResult(kind: 'success' | 'error', message: string): void {
    resultArea.className = `result ${kind}`;
    resultArea.textContent = message;
    resultArea.style.display = 'block';
}

function setLoading(loading: boolean): void {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? 'Creating…' : 'Create Coupon';
}

// --- Init ---

async function init(): Promise<void> {
    try {
        await app.connect();
        await loadPlans();
    } catch {
        plansLoading.textContent = 'Could not load plans.';
    }
}

void init();
