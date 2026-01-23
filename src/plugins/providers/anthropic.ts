import type {
  ProviderPlugin,
  ProviderFetchContext,
  ProviderUsageData,
  Credentials,
} from '../types/provider.ts';

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

interface AnthropicUsageResponse {
  five_hour?: {
    utilization?: number;
    resets_at?: string;
  };
  seven_day?: {
    utilization?: number;
    resets_at?: string;
  };
}

export const anthropicPlugin: ProviderPlugin = {
  id: 'anthropic',
  type: 'provider',
  name: 'Anthropic',
  version: '1.0.0',

  meta: {
    description: 'Anthropic Claude subscription usage tracking',
    homepage: 'https://anthropic.com',
    color: '#d4a27f',
  },

  permissions: {
    network: {
      enabled: true,
      allowedDomains: ['api.anthropic.com'],
    },
    env: {
      read: true,
      vars: ['ANTHROPIC_API_KEY'],
    },
    filesystem: {
      read: true,
      paths: ['~/.claude', '~/.local/share/opencode'],
    },
  },

  capabilities: {
    usageLimits: true,
    apiRateLimits: false,
    tokenUsage: false,
    actualCosts: false,
  },

  auth: {
    envVars: ['ANTHROPIC_API_KEY'],
    externalPaths: [
      { path: '~/.claude/.credentials.json', type: 'claude-code' },
    ],
    types: ['oauth', 'api'],
  },

  isConfigured(credentials: Credentials): boolean {
    return !!(credentials.oauth?.accessToken || credentials.apiKey);
  },

  async fetchUsage(ctx: ProviderFetchContext): Promise<ProviderUsageData> {
    const { credentials, http, log } = ctx;

    const hasOAuth = !!credentials.oauth?.accessToken;
    const hasApiKey = !!credentials.apiKey;

    if (!hasOAuth && !hasApiKey) {
      return {
        fetchedAt: Date.now(),
        error: 'OAuth token or API key required. Authenticate via OpenCode or Claude Code.',
      };
    }

    if (hasApiKey && !hasOAuth) {
      return {
        planType: 'API',
        allowed: true,
        fetchedAt: Date.now(),
      };
    }

    if (credentials.oauth?.expiresAt) {
      const isExpired = credentials.oauth.expiresAt <= Date.now() + TOKEN_EXPIRY_BUFFER_MS;
      if (isExpired) {
        return {
          fetchedAt: Date.now(),
          error: 'Token expired. Run any command in OpenCode to refresh.',
        };
      }
    }

    const accessToken = credentials.oauth!.accessToken;
    const subscriptionType = (credentials.oauth as { subscriptionType?: string } | undefined)?.subscriptionType;
    const planType = getPlanName(subscriptionType);

    try {
      const response = await http.fetch('https://api.anthropic.com/api/oauth/usage', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'User-Agent': 'tokentop/1.0',
        },
      });

      if (!response.ok) {
        log.warn('Failed to fetch Anthropic usage', { status: response.status });
        
        if (response.status === 401) {
          return {
            fetchedAt: Date.now(),
            error: 'Token expired or invalid. Re-authenticate in OpenCode or Claude Code.',
          };
        }
        if (response.status === 403) {
          return {
            fetchedAt: Date.now(),
            error: 'Token lacks required scope. Re-authenticate in OpenCode or Claude Code.',
          };
        }
        
        return {
          fetchedAt: Date.now(),
          error: `API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as AnthropicUsageResponse;

      const result: ProviderUsageData = {
        planType: planType ?? 'Pro/Max',
        allowed: true,
        limitReached: false,
        fetchedAt: Date.now(),
      };

      const fiveHour = parseUtilization(data.five_hour?.utilization);
      const sevenDay = parseUtilization(data.seven_day?.utilization);

      if (fiveHour !== null || sevenDay !== null) {
        result.limits = {};

        if (fiveHour !== null) {
          result.limits.primary = {
            usedPercent: fiveHour,
            windowMinutes: 300,
            label: '5-hour window',
          };
          if (data.five_hour?.resets_at) {
            const resetTime = new Date(data.five_hour.resets_at).getTime();
            if (!isNaN(resetTime)) {
              result.limits.primary.resetsAt = resetTime;
            }
          }
        }

        if (sevenDay !== null) {
          result.limits.secondary = {
            usedPercent: sevenDay,
            windowMinutes: 10080,
            label: '7-day window',
          };
          if (data.seven_day?.resets_at) {
            const resetTime = new Date(data.seven_day.resets_at).getTime();
            if (!isNaN(resetTime)) {
              result.limits.secondary.resetsAt = resetTime;
            }
          }
        }

        if (fiveHour !== null && fiveHour >= 100) {
          result.limitReached = true;
        }
        if (sevenDay !== null && sevenDay >= 100) {
          result.limitReached = true;
        }
      }

      return result;
    } catch (err) {
      log.error('Failed to fetch Anthropic usage', { error: err });
      return {
        fetchedAt: Date.now(),
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  },
};

function getPlanName(subscriptionType?: string): string | null {
  if (!subscriptionType) return null;
  const lower = subscriptionType.toLowerCase();
  if (lower.includes('max')) return 'Max';
  if (lower.includes('pro')) return 'Pro';
  if (lower.includes('team')) return 'Team';
  if (lower.includes('api')) return null;
  return subscriptionType.charAt(0).toUpperCase() + subscriptionType.slice(1);
}

function parseUtilization(value?: number): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(100, value)));
}
