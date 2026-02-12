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

  let costInDay = 0;
  let costInWeek = 0;
  let costInMonth = 0;

  if (hasAnyCost && session._streamWindowedTokens) {
    for (const stream of pricedStreams) {
      const streamCost = stream.costUsd ?? 0;
      if (streamCost === 0) continue;

      const keyStr = `${stream.providerId}::${stream.modelId}`;
      const windowed = session._streamWindowedTokens.get(keyStr);
      if (!windowed || windowed.totalTokens === 0) continue;

      const ratio = 1 / windowed.totalTokens;
      costInDay += streamCost * windowed.dayTokens * ratio;
      costInWeek += streamCost * windowed.weekTokens * ratio;
      costInMonth += streamCost * windowed.monthTokens * ratio;
    }
  }

  const result: AgentSessionAggregate = {
    ...session,
    streams: pricedStreams,
    costInDay,
    costInWeek,
    costInMonth,
  };
  if (hasAnyCost) result.totalCostUsd = totalCostUsd;
  delete result._streamWindowedTokens;

  return result;
}

export async function priceSessions(sessions: AgentSessionAggregate[]): Promise<AgentSessionAggregate[]> {
  return Promise.all(sessions.map(priceSession));
}
