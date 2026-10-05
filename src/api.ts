import { ListingPage, ListingSort, Listing, MarketplaceConfig, Quote, WalletNftPage } from './types';

export interface ApiClientOptions {
  /** Base URL della OOX API, es. https://api.oox.art */
  apiUrl: string;
  /** Chiave dell'integratore, inviata nell'header x-api-key */
  apiKey?: string;
  /** fetch alternativo (Node < 18, test, retry) */
  fetch?: typeof fetch;
  /** Timeout delle richieste in millisecondi (default 15 s) */
  timeoutMs?: number;
}

export interface ListingsQuery {
  identifiers?: string[];
  collection?: string;
  seller?: string;
  sort?: ListingSort;
  from?: number;
  size?: number;
}

export interface PageQuery {
  from?: number;
  size?: number;
}

export class OOXApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'OOXApiError';
  }
}

/** Client della OOX API v1 (sola lettura) */
export class OOXApiClient {
  private readonly apiUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ApiClientOptions) {
    if (!options.apiUrl) {
      throw new Error('apiUrl is required');
    }
    this.apiUrl = options.apiUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  getConfig(): Promise<MarketplaceConfig> {
    return this.get('/v1/config');
  }

  getListings(query: ListingsQuery): Promise<ListingPage> {
    return this.get('/v1/listings', {
      identifiers: query.identifiers?.join(','),
      collection: query.collection,
      seller: query.seller,
      sort: query.sort,
      from: query.from,
      size: query.size,
    });
  }

  getListing(auctionId: number): Promise<Listing> {
    return this.get(`/v1/listings/${auctionId}`);
  }

  getQuote(params: { auctionId: number; quantity?: bigint | number; buyer?: string }): Promise<Quote> {
    return this.get('/v1/quote', {
      auctionId: params.auctionId,
      quantity: params.quantity,
      buyer: params.buyer,
    });
  }

  getAccountListings(address: string, query: PageQuery & { sort?: ListingSort } = {}): Promise<ListingPage> {
    return this.get(`/v1/accounts/${address}/listings`, { ...query });
  }

  getWalletNfts(address: string, query: PageQuery & { collection?: string } = {}): Promise<WalletNftPage> {
    return this.get(`/v1/accounts/${address}/nfts`, { ...query });
  }

  private async get<T>(path: string, params: Record<string, string | number | bigint | undefined> = {}): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        search.set(key, value.toString());
      }
    }
    const query = search.toString();
    const url = `${this.apiUrl}${path}${query ? `?${query}` : ''}`;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.options.apiKey) {
      headers['x-api-key'] = this.options.apiKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000);
    try {
      const response = await this.fetchImpl(url, { headers, signal: controller.signal });
      const body = await response.json().catch(() => undefined);
      if (!response.ok) {
        const message = typeof body === 'object' && body && 'message' in body ? String((body as { message: unknown }).message) : response.statusText;
        throw new OOXApiError(message || `HTTP ${response.status}`, response.status, body);
      }
      return body as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
