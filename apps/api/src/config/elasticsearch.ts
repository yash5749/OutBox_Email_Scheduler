import { Client } from '@elastic/elasticsearch';
import { getEnv } from './env';

const env = getEnv();

export const esClient = new Client({
  node: env.ELASTICSEARCH_URL,
  auth: env.ELASTICSEARCH_USERNAME && env.ELASTICSEARCH_PASSWORD
    ? { username: env.ELASTICSEARCH_USERNAME, password: env.ELASTICSEARCH_PASSWORD }
    : undefined,
  maxRetries: 3,
  requestTimeout: 30000,
  sniffOnStart: false,
});

export const ES_INDEX = env.ELASTICSEARCH_INDEX;

export async function ensureIndex(): Promise<void> {
  const exists = await esClient.indices.exists({ index: ES_INDEX });
  if (!exists) {
    await esClient.indices.create({
      index: ES_INDEX,
      mappings: {
        properties: {
          emailId: { type: 'keyword' },
          userId: { type: 'keyword' },
          campaignId: { type: 'keyword' },
          senderId: { type: 'keyword' },
          recipient: { type: 'keyword' },
          subject: { type: 'text', analyzer: 'standard' },
          body: { type: 'text', analyzer: 'standard' },
          status: { type: 'keyword' },
          scheduledAt: { type: 'date' },
          sentAt: { type: 'date' },
          failedAt: { type: 'date' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
        },
      },
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        refresh_interval: '5s',
      },
    });
    console.log(`[Elasticsearch] Created index: ${ES_INDEX}`);
  }
}

export async function indexEmail(doc: Record<string, unknown>): Promise<void> {
  await esClient.index({
    index: ES_INDEX,
    id: doc.emailId as string,
    document: doc,
    refresh: 'wait_for',
  });
}

export async function deleteEmail(emailId: string): Promise<void> {
  await esClient.delete({ index: ES_INDEX, id: emailId, refresh: 'wait_for' });
}

interface SearchParams {
  userId: string;
  query?: string;
  status?: string[];
  senderId?: string;
  campaignId?: string;
  from?: Date;
  to?: Date;
  cursor?: string; // Expecting base64 encoded cursor "scheduledAt|emailId" or single sort
  limit: number;
}

export async function searchEmails(params: SearchParams): Promise<{ hits: unknown[]; nextCursor?: string; total: number }> {
  const must: Array<Record<string, unknown>> = [{ term: { userId: params.userId } }];

  if (params.query) {
    must.push({
      multi_match: {
        query: params.query,
        fields: ['subject^2', 'body', 'recipient'],
        type: 'best_fields',
      },
    });
  }

  if (params.status && params.status.length > 0) {
    must.push({ terms: { status: params.status } });
  }

  if (params.senderId) {
    must.push({ term: { senderId: params.senderId } });
  }

  if (params.campaignId) {
    must.push({ term: { campaignId: params.campaignId } });
  }

  if (params.from || params.to) {
    const range: Record<string, string> = {};
    if (params.from) range.gte = params.from.toISOString();
    if (params.to) range.lte = params.to.toISOString();
    must.push({ range: { scheduledAt: range } });
  }

  // Parse compound cursor if provided (e.g. "1761048000000_22f7cfce-1719-4cb8-8142-af0a89e87eab")
  let searchAfter: unknown[] | undefined = undefined;
  if (params.cursor) {
    if (params.cursor.includes('_')) {
      const [scheduledAtStr, emailId] = params.cursor.split('_');
      searchAfter = [Number(scheduledAtStr) || scheduledAtStr, emailId];
    } else {
      searchAfter = [params.cursor];
    }
  }

  const result = await esClient.search({
    index: ES_INDEX,
    query: { bool: { must } },
    sort: [{ scheduledAt: { order: 'desc' } }, { emailId: { order: 'desc' } }],
    size: params.limit,
    ...(searchAfter ? { search_after: searchAfter } : {}),
    track_total_hits: true,
  });

  const hits = result.hits.hits.map(h => {
    const source = h._source as Record<string, unknown>;
    return { ...source, _id: h._id, sort: h.sort };
  });

  // Construct compound nextCursor using sort values [scheduledAtTimestamp, emailId]
  let nextCursor: string | undefined = undefined;
  if (hits.length === params.limit) {
    const lastHit = result.hits.hits[result.hits.hits.length - 1];
    if (lastHit.sort && lastHit.sort.length >= 2) {
      nextCursor = `${lastHit.sort[0]}_${lastHit.sort[1]}`;
    } else {
      nextCursor = hits[hits.length - 1]._id;
    }
  }

  return {
    hits,
    nextCursor,
    total: typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value ?? 0,
  };
}