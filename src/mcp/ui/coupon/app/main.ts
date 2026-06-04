// main.ts — the MCP Apps iframe view for create_coupon. Bundled (target:browser) by
// scripts/build-ui.ts into a self-contained HTML string at ../generated/coupon-form-html.ts.
// Vanilla DOM, no framework, no network beyond the host bridge (app.callServerTool).

import { App } from '@modelcontextprotocol/ext-apps';

interface Plan {
    id: number | string;
    title: string;
    name: string;
}

interface Coupon {
    id: number | string;
    code: string;
    discount: number;
    discount_type: 'percentage' | 'dollar';
    plans: number | string | Array<number | string> | null;
    is_active?: boolean;
}

const app = new App({ name: 'freemius-coupon-form', version: '0.1.0' });

// Elements
const form = document.getElementById('coupon-form') as HTMLFormElement;
const successCard = document.getElementById('success-card') as HTMLElement;
const codeInput = document.getElementById('code') as HTMLInputElement;
const discountInput = document.getElementById('discount') as HTMLInputElement;
const discountTypeSelect = document.getElementById('discount-type') as HTMLSelectElement;
const plansContainer = document.getElementById('plans-container') as HTMLElement;
const plansLoading = document.getElementById('plans-loading') as HTMLElement;
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
const resultArea = document.getElementById('result') as HTMLElement;

// Success Screen Elements
const successCodeVal = document.getElementById('success-code-val') as HTMLElement;
const successDiscountVal = document.getElementById('success-discount-val') as HTMLElement;
const successPlansVal = document.getElementById('success-plans-val') as HTMLElement;
const successIdVal = document.getElementById('success-id-val') as HTMLElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;

// List Elements
const couponsList = document.getElementById('coupons-list') as HTMLElement;
const couponsLoading = document.getElementById('coupons-loading') as HTMLElement;
const refreshListBtn = document.getElementById('refresh-list-btn') as HTMLButtonElement;

// Memory mapping of plan IDs to their readable titles
const plansMap = new Map<string, string>();

// --- Clipboard Copy Helper ---
async function copyText(text: string, button: HTMLButtonElement): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
        const originalContent = button.innerHTML;
        button.textContent = 'Copied!';
        button.style.opacity = '0.8';
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.style.opacity = '1';
        }, 1200);
    } catch {
        // Fallback for sandboxed or insecure contexts
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            const originalContent = button.innerHTML;
            button.textContent = 'Copied!';
            button.style.opacity = '0.8';
            setTimeout(() => {
                button.innerHTML = originalContent;
                button.style.opacity = '1';
            }, 1200);
        } catch {
            button.textContent = 'Failed';
        }
        document.body.removeChild(textarea);
    }
}

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
        plansContainer.innerHTML = '';
        plansMap.clear();

        for (const plan of plans) {
            const planIdStr = String(plan.id);
            const planTitle = plan.title || plan.name || `Plan #${plan.id}`;
            plansMap.set(planIdStr, planTitle);

            const label = document.createElement('label');
            label.className = 'plan-option';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.name = 'plans';
            cb.value = planIdStr;
            label.appendChild(cb);
            label.appendChild(document.createTextNode(` ${planTitle} (#${plan.id})`));
            plansContainer.appendChild(label);
        }
    } catch {
        plansLoading.textContent = 'Could not load plans.';
    }
}

// --- Coupon list loading ---
async function loadCoupons(): Promise<void> {
    try {
        couponsLoading.style.display = 'block';
        couponsLoading.textContent = 'Loading coupons...';
        couponsList.style.display = 'none';
        couponsList.innerHTML = '';

        const result = await app.callServerTool({ name: 'list_coupons', arguments: {} });
        const text = (result.content as Array<{ type: string; text: string }>)?.[0]?.text;
        if (!text) {
            couponsLoading.textContent = 'No coupons found.';
            return;
        }
        const data = JSON.parse(text);
        const coupons: Coupon[] = Array.isArray(data) ? data : (data?.coupons ?? []);

        if (coupons.length === 0) {
            couponsLoading.textContent = 'No coupons found.';
            return;
        }

        couponsLoading.style.display = 'none';
        couponsList.style.display = 'flex';

        for (const coupon of coupons) {
            const item = document.createElement('div');
            item.className = 'coupon-item';

            const info = document.createElement('div');
            info.className = 'coupon-item-info';

            const codeSpan = document.createElement('span');
            codeSpan.className = 'coupon-item-code';
            codeSpan.textContent = coupon.code;
            info.appendChild(codeSpan);

            // Discount formatting
            const meta = document.createElement('div');
            meta.className = 'coupon-item-meta';
            const discountBadge = document.createElement('span');
            discountBadge.className = 'badge-discount';
            discountBadge.textContent =
                coupon.discount_type === 'percentage' ? `${coupon.discount}% off` : `$${coupon.discount} off`;
            meta.appendChild(discountBadge);

            // Resolve plan titles
            let planDesc = 'All plans';
            if (coupon.plans) {
                if (Array.isArray(coupon.plans)) {
                    planDesc = coupon.plans.map((p) => plansMap.get(String(p)) || `Plan #${p}`).join(', ');
                } else {
                    planDesc = plansMap.get(String(coupon.plans)) || `Plan #${coupon.plans}`;
                }
            }
            const plansText = document.createTextNode(planDesc);
            meta.appendChild(plansText);
            info.appendChild(meta);
            item.appendChild(info);

            // Actions (status and copy button)
            const actions = document.createElement('div');
            actions.className = 'coupon-item-actions';

            if (coupon.is_active !== false) {
                const activeBadge = document.createElement('span');
                activeBadge.className = 'badge-active';
                activeBadge.title = 'Active';
                actions.appendChild(activeBadge);
            }

            const itemCopyBtn = document.createElement('button');
            itemCopyBtn.className = 'icon-btn';
            itemCopyBtn.title = 'Copy coupon code';
            itemCopyBtn.innerHTML =
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

            itemCopyBtn.addEventListener('click', () => {
                void copyText(coupon.code, itemCopyBtn);
            });

            actions.appendChild(itemCopyBtn);
            item.appendChild(actions);

            couponsList.appendChild(item);
        }
    } catch {
        couponsLoading.textContent = 'Could not load coupons.';
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

            let couponId = 'N/A';
            let createdCode = code;
            let finalDiscount = discountTypeSelect.value === 'percentage' ? `${discount}%` : `$${discount}`;
            const plansApplied =
                plans.length > 0 ? plans.map((p) => plansMap.get(p) || `Plan #${p}`).join(', ') : 'All plans';

            try {
                const parsed = JSON.parse(text);
                const coupon = parsed?.coupon ?? parsed;
                if (coupon?.id) couponId = String(coupon.id);
                if (coupon?.code) createdCode = coupon.code;
                if (coupon?.discount) {
                    finalDiscount =
                        coupon.discount_type === 'percentage' ? `${coupon.discount}%` : `$${coupon.discount}`;
                }
            } catch {
                // keep fallback values
            }

            // Fill success card
            successCodeVal.textContent = createdCode;
            successDiscountVal.textContent = finalDiscount;
            successPlansVal.textContent = plansApplied;
            successIdVal.textContent = couponId;

            // Wire up copy button on the success card
            const newCopyBtn = copyBtn.cloneNode(true) as HTMLButtonElement;
            copyBtn.parentNode?.replaceChild(newCopyBtn, copyBtn);
            newCopyBtn.addEventListener('click', () => {
                void copyText(createdCode, newCopyBtn);
            });

            // Transition UI to Success Card
            form.style.display = 'none';
            successCard.style.display = 'block';

            // Reset form input values
            form.reset();

            // Refresh recent coupons in background
            void loadCoupons();
        }
    } catch (err) {
        showResult('error', `Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
        setLoading(false);
    }
});

// --- Reset back to form ---
resetBtn.addEventListener('click', () => {
    successCard.style.display = 'none';
    form.style.display = 'block';
    resultArea.style.display = 'none';
});

// --- Manual Refresh list ---
refreshListBtn.addEventListener('click', () => {
    void loadCoupons();
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
        // Load plans first so we have the plansMap fully populated for coupons list
        await loadPlans();
        // Load existing coupons
        await loadCoupons();
    } catch {
        plansLoading.textContent = 'Could not load plans.';
        couponsLoading.textContent = 'Could not load coupons.';
    }
}

void init();
