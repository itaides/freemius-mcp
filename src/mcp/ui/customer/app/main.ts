// main.ts — the MCP Apps iframe view for get_user (customer profile card).
// Bundled (target:browser) by scripts/build-ui.ts into a self-contained HTML string.
// Vanilla DOM, no framework, no network beyond the host bridge (app.callServerTool).

import { App } from '@modelcontextprotocol/ext-apps';

interface Subscription {
    id: number;
    plan_id: number;
    billing_cycle: string;
    status: string;
    gross?: number;
    currency?: string;
    next_payment?: string;
    created?: string;
}

interface Payment {
    id: number;
    gross: number;
    net: number;
    currency: string;
    created: string;
    status?: string;
}

interface License {
    id: number;
    plan_id: number;
    secret_key: string;
    quota?: number | null;
    activated: number;
    is_active?: boolean;
    is_cancelled?: boolean;
}

interface User {
    id: number | string;
    email?: string;
    first_name?: string;
    last_name?: string;
    country_code?: string;
    created?: string;
}

const app = new App({ name: 'freemius-customer-profile', version: '0.1.0' });

const planMap = new Map<string, string>();

function getCurrencySymbol(currency?: string): string {
    if (!currency) return '$';
    const symbols: Record<string, string> = {
        usd: '$',
        eur: '€',
        gbp: '£',
        cad: 'CA$',
        aud: 'A$',
        jpy: '¥',
    };
    return symbols[currency.toLowerCase()] || currency.toUpperCase();
}

function getFlagEmoji(countryCode?: string): string {
    if (!countryCode) return '🌍';
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map((char) => 127397 + char.charCodeAt(0));
    try {
        return String.fromCodePoint(...codePoints);
    } catch {
        return '🌍';
    }
}

// Render helper for lists
function renderList<T>(containerId: string, items: T[], emptyMessage: string, renderItemFn: (item: T) => string): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📂</div>
                <div>${emptyMessage}</div>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(renderItemFn).join('');
}

function renderError(containerId: string, message: string): void {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="empty-state text-error" style="color: var(--error);">
            <div class="empty-icon">⚠️</div>
            <div>${message}</div>
        </div>
    `;
}

// Initial display setup
function initCustomerView(user: User): void {
    const root = document.getElementById('root');
    if (!root) return;

    // Build the container HTML structure if not already rendered
    root.innerHTML = `
        <div class="profile-header">
            <div class="user-identity">
                <h1 class="user-name" id="user-name">Loading...</h1>
                <p class="user-email" id="user-email"></p>
            </div>
            <div class="user-meta-right">
                <div class="country-badge" id="country-badge">🌍 --</div>
                <div class="member-since" id="member-since"></div>
                <div class="user-id" id="user-id"></div>
            </div>
        </div>

        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-label">Subscriptions</div>
                <div class="metric-value" id="metric-subscriptions">-</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Active Licenses</div>
                <div class="metric-value" id="metric-licenses">-</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">LTV</div>
                <div class="metric-value" id="metric-ltv">-</div>
            </div>
        </div>

        <nav class="tabs-nav">
            <button class="tab-btn active" data-tab="subscriptions">Subscriptions</button>
            <button class="tab-btn" data-tab="payments">Payments</button>
            <button class="tab-btn" data-tab="licenses">Licenses</button>
        </nav>

        <div class="tab-content">
            <div class="tab-panel active" id="panel-subscriptions">
                <div class="shimmer shimmer-block" style="width: 100%; height: 50px; margin-bottom: 12px; border-radius: 8px;"></div>
                <div class="shimmer shimmer-block" style="width: 100%; height: 50px; border-radius: 8px;"></div>
            </div>
            <div class="tab-panel" id="panel-payments">
                <div class="shimmer shimmer-block" style="width: 100%; height: 50px; margin-bottom: 12px; border-radius: 8px;"></div>
                <div class="shimmer shimmer-block" style="width: 100%; height: 50px; border-radius: 8px;"></div>
            </div>
            <div class="tab-panel" id="panel-licenses">
                <div class="shimmer shimmer-block" style="width: 100%; height: 50px; margin-bottom: 12px; border-radius: 8px;"></div>
                <div class="shimmer shimmer-block" style="width: 100%; height: 50px; border-radius: 8px;"></div>
            </div>
        </div>
    `;

    // Hook up tab navigation
    const tabs = document.querySelectorAll('.tab-btn');
    for (const tab of Array.from(tabs)) {
        tab.addEventListener('click', () => {
            for (const t of Array.from(tabs)) {
                t.classList.remove('active');
            }
            tab.classList.add('active');
            const targetTab = tab.getAttribute('data-tab');
            const panels = document.querySelectorAll('.tab-panel');
            for (const panel of Array.from(panels)) {
                panel.classList.remove('active');
            }
            const activePanel = document.getElementById(`panel-${targetTab}`);
            if (activePanel) {
                activePanel.classList.add('active');
            }
        });
    }

    // Populate header details
    const userDisplayName =
        user.first_name || user.last_name
            ? [user.first_name, user.last_name].filter(Boolean).join(' ')
            : 'Unnamed Customer';

    const userNameEl = document.getElementById('user-name');
    if (userNameEl) userNameEl.textContent = userDisplayName;

    const userEmailEl = document.getElementById('user-email');
    if (userEmailEl) userEmailEl.textContent = user.email || 'No email';

    const countryBadgeEl = document.getElementById('country-badge');
    if (countryBadgeEl) {
        countryBadgeEl.textContent = `${getFlagEmoji(user.country_code)} ${user.country_code || 'Global'}`;
    }

    const memberSinceEl = document.getElementById('member-since');
    if (memberSinceEl && user.created) {
        const dateStr = new Date(user.created).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
        memberSinceEl.textContent = `Member since ${dateStr}`;
    }

    const userIdEl = document.getElementById('user-id');
    if (userIdEl) userIdEl.textContent = `#${user.id}`;

    // Kick off data fetches
    void loadAllData(user.id);
}

async function loadAllData(userId: number | string): Promise<void> {
    // 1. Load plans so names resolve correctly
    await loadPlans();

    // 2. Fetch lists concurrently but render independently
    void fetchSubscriptions(userId);
    void fetchPayments(userId);
    void fetchLicenses(userId);
}

async function loadPlans(): Promise<void> {
    try {
        const result = await app.callServerTool({ name: 'list_plans', arguments: {} });
        const text = (result.content as Array<{ type: string; text: string }>)?.[0]?.text;
        if (text) {
            const data = JSON.parse(text);
            const plans = data?.plans ?? data ?? [];
            for (const plan of plans) {
                if (plan?.id) {
                    planMap.set(String(plan.id), plan.title || plan.name || `Plan #${plan.id}`);
                }
            }
        }
    } catch (e) {
        console.error('Failed to load plans:', e);
    }
}

async function fetchSubscriptions(userId: number | string): Promise<void> {
    try {
        const result = await app.callServerTool({
            name: 'freemius_execute_tool',
            arguments: {
                operationId: 'users/list-subscriptions',
                params: { user_id: String(userId) },
            },
        });
        const text = (result.content as Array<{ type: string; text: string }>)?.[0]?.text;
        if (!text) {
            renderSubscriptionsList([]);
            return;
        }
        const data = JSON.parse(text);
        const subs = data?.subscriptions ?? data ?? [];
        renderSubscriptionsList(subs);
    } catch {
        renderError('panel-subscriptions', 'Failed to load subscriptions.');
    }
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderSubscriptionsList(subs: Subscription[]): void {
    const activeCount = subs.filter((s) => s.status === 'active' || s.status === 'trialing').length;
    const subMetricEl = document.getElementById('metric-subscriptions');
    if (subMetricEl) {
        subMetricEl.textContent = String(activeCount);
    }

    renderList('panel-subscriptions', subs, 'No subscriptions found', (sub: Subscription) => {
        const planName = planMap.get(String(sub.plan_id)) || `Plan #${sub.plan_id}`;
        const cycle = sub.billing_cycle || 'N/A';
        const dateStr = sub.next_payment ? new Date(sub.next_payment).toLocaleDateString() : 'N/A';
        const amount = sub.gross ? `${getCurrencySymbol(sub.currency)}${sub.gross.toFixed(2)}` : '';
        const status = sub.status || 'unknown';

        return `
            <div class="list-item">
                <div class="item-left">
                    <span class="item-title">${escapeHtml(planName)}</span>
                    <span class="item-subtitle">Billing: ${escapeHtml(cycle)} · Next due: ${escapeHtml(dateStr)}</span>
                </div>
                <div class="item-right">
                    ${amount ? `<span style="font-weight: 600;">${escapeHtml(amount)}</span>` : ''}
                    <span class="badge ${escapeHtml(status)}">${escapeHtml(status)}</span>
                </div>
            </div>
        `;
    });
}

async function fetchPayments(userId: number | string): Promise<void> {
    try {
        const result = await app.callServerTool({
            name: 'freemius_execute_tool',
            arguments: {
                operationId: 'users/list-payments',
                params: { user_id: String(userId) },
            },
        });
        const text = (result.content as Array<{ type: string; text: string }>)?.[0]?.text;
        if (!text) {
            renderPaymentsList([]);
            return;
        }
        const data = JSON.parse(text);
        const payments = data?.payments ?? data ?? [];
        renderPaymentsList(payments);
    } catch {
        renderError('panel-payments', 'Failed to load payments.');
    }
}

function renderPaymentsList(payments: Payment[]): void {
    // Calculate LTV
    const ltvByCurrency: Record<string, number> = {};
    for (const p of payments) {
        if (p.currency && typeof p.gross === 'number') {
            const cur = p.currency.toLowerCase();
            const val = p.status === 'refunded' ? 0 : (p.net ?? p.gross);
            ltvByCurrency[cur] = (ltvByCurrency[cur] || 0) + val;
        }
    }
    const ltvString =
        Object.entries(ltvByCurrency)
            .map(([cur, val]) => `${getCurrencySymbol(cur)}${val.toFixed(2)}`)
            .join(', ') || '$0.00';

    const ltvMetricEl = document.getElementById('metric-ltv');
    if (ltvMetricEl) {
        ltvMetricEl.textContent = ltvString;
    }

    renderList('panel-payments', payments, 'No payment history', (payment: Payment) => {
        const dateStr = payment.created ? new Date(payment.created).toLocaleDateString() : 'N/A';
        const amount = `${getCurrencySymbol(payment.currency)}${payment.gross.toFixed(2)}`;
        const status = payment.status || 'paid';

        return `
            <div class="list-item">
                <div class="item-left">
                    <span class="item-title">Payment #${escapeHtml(String(payment.id))}</span>
                    <span class="item-subtitle">Date: ${escapeHtml(dateStr)}</span>
                </div>
                <div class="item-right">
                    <span style="font-weight: 600;">${escapeHtml(amount)}</span>
                    <span class="badge ${escapeHtml(status)}">${escapeHtml(status)}</span>
                </div>
            </div>
        `;
    });
}

async function fetchLicenses(userId: number | string): Promise<void> {
    try {
        const result = await app.callServerTool({
            name: 'freemius_execute_tool',
            arguments: {
                operationId: 'users/list-licenses',
                params: { user_id: String(userId) },
            },
        });
        const text = (result.content as Array<{ type: string; text: string }>)?.[0]?.text;
        if (!text) {
            renderLicensesList([]);
            return;
        }
        const data = JSON.parse(text);
        const licenses = data?.licenses ?? data ?? [];
        renderLicensesList(licenses);
    } catch {
        renderError('panel-licenses', 'Failed to load licenses.');
    }
}

function renderLicensesList(licenses: License[]): void {
    const activeCount = licenses.filter((l) => l.is_active !== false && l.is_cancelled !== true).length;
    const licenseMetricEl = document.getElementById('metric-licenses');
    if (licenseMetricEl) {
        licenseMetricEl.textContent = String(activeCount);
    }

    renderList('panel-licenses', licenses, 'No licenses found', (license: License) => {
        const planName = planMap.get(String(license.plan_id)) || `Plan #${license.plan_id}`;

        let key = 'No key';
        if (license.secret_key) {
            const len = license.secret_key.length;
            if (len <= 4) {
                key = 'xxxx';
            } else {
                key = `xxxx-xxxx-xxxx-${license.secret_key.substring(len - 4)}`;
            }
        }

        const quota = license.quota;
        const quotaLimit = quota === undefined || quota === null || quota === 0 ? 'Unlimited' : String(quota);
        const usageStr = `${license.activated ?? 0} / ${quotaLimit}`;
        const status = license.is_cancelled ? 'cancelled' : license.is_active ? 'active' : 'inactive';

        return `
            <div class="list-item">
                <div class="item-left">
                    <span class="item-title">${escapeHtml(planName)}</span>
                    <span class="item-subtitle">${escapeHtml(key)}</span>
                </div>
                <div class="item-right">
                    <span style="font-weight: 600; font-size: 13px;">${escapeHtml(usageStr)} installs</span>
                    <span class="badge ${escapeHtml(status)}">${escapeHtml(status)}</span>
                </div>
            </div>
        `;
    });
}

// --- Init ---

app.ontoolresult = (params) => {
    // biome-ignore lint/suspicious/noExplicitAny: incoming raw params payload
    let user: any = params.structuredContent;
    if (!user && params.content?.[0] && params.content[0].type === 'text') {
        try {
            user = JSON.parse(params.content[0].text);
        } catch {
            // failed to parse
        }
    }
    if (user) {
        initCustomerView(user as User);
    } else {
        const root = document.getElementById('root');
        if (root) {
            root.innerHTML = `
                <div class="empty-state text-error" style="color: var(--error);">
                    <div class="empty-icon">⚠️</div>
                    <div>Could not load customer information.</div>
                </div>
            `;
        }
    }
};

async function init(): Promise<void> {
    try {
        await app.connect();
    } catch (e) {
        console.error('Failed to connect to extension app bridge:', e);
    }
}

void init();
