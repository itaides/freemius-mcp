// register.ts — the "apps layer" resource registration for the customer profile card.
// Serves the self-contained customer profile HTML via ui://freemius/customer-profile.html.

import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { freemiusCustomerProfileHtml } from './generated/profile-html.js';

const RESOURCE_URI = 'ui://freemius/customer-profile.html';

export function registerCustomerApp(server: McpServer): void {
    registerAppResource(
        server,
        'Customer Profile Card',
        RESOURCE_URI,
        { description: 'Interactive visual customer profile card displaying subscriptions, payments, and licenses.' },
        async () => ({
            contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: freemiusCustomerProfileHtml }],
        })
    );
}
