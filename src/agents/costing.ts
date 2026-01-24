import { getPricing, estimateCost } from '@/pricing/index.ts';
import type { AgentSessionAggregate, AgentSessionStream } from './types.ts';

export async function priceStream(stream: AgentSessionStream): Promise<AgentSessionStream> {
  const pricing = await getPricing(stream.providerId, stream.modelId);
  
  if (!pricing) {
    return { ...stream, pricingSource: 'unknown' };
  }

  const breakdown = estimateCost(stream.tokens, pricing);
  const source = pricing.source === 'models.dev' ? 'models.dev' : 'fallback';
  
  return {
    ...stream,
    costUsd: breakdown.total,
    pricingSource: source,
  };
}

export async function priceSession(session: AgentSessionAggregate): Promise<AgentSessionAggregate> {
  const pricedStreams = await Promise.all(session.streams.map(priceStream));
  
  const totalCostUsd = pricedStreams.reduce((sum, s) => {
    return sum + (s.costUsd ?? 0);
  }, 0);

  const hasAnyCost = pricedStreams.some(s => s.costUsd !== undefined);

  const result: AgentSessionAggregate = {
    ...session,
    streams: pricedStreams,
  };
  if (hasAnyCost) result.totalCostUsd = totalCostUsd;

  return result;
}

export async function priceSessions(sessions: AgentSessionAggregate[]): Promise<AgentSessionAggregate[]> {
  return Promise.all(sessions.map(priceSession));
}
