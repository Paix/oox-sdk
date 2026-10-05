import { Listing, OOXApiError, OOXClient, OOXPurchaseError, Quote } from '../src';

const BUYER = 'erd15gshjtp0ny5lpwtlqfj3gsy4kszmkurej84wfglftsvggknva3lstx5hw5';
const SELLER = 'erd1kfrxa85zsqharcg78n3tc90flh590x2lk4r65y8spr8gr0hr899qt4hs9v';

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    auctionId: 152,
    identifier: 'SENTINELS-1054d2-02',
    collection: 'SENTINELS-1054d2',
    nonce: 2,
    quantity: '7',
    saleType: 'sft-per-unit',
    priceType: 'fixed',
    seller: SELLER,
    paymentToken: 'EGLD',
    paymentTokenNonce: 0,
    paymentTokenDecimals: 18,
    price: '190000000000000000',
    minBid: '190000000000000000',
    maxBid: '190000000000000000',
    currentBid: '0',
    currentWinner: null,
    minBidDiff: '0',
    minNextBid: null,
    startTime: 1730278818,
    deadline: 1761814782,
    royaltiesBps: 600,
    marketplaceCutBps: 100,
    isActive: true,
    ...overrides,
  };
}

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    auctionId: 152,
    quantity: '3',
    purchasable: true,
    paymentToken: 'EGLD',
    paymentTokenNonce: 0,
    paymentTokenDecimals: 18,
    totalPrice: '570000000000000000',
    breakdown: { royalties: '34200000000000000', marketplaceFee: '5700000000000000', seller: '530100000000000000' },
    listing: listing(),
    ...overrides,
  };
}

function mockFetch(routes: Record<string, unknown>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const path = url.replace('https://api.oox.art', '');
    const key = Object.keys(routes).find(route => path.startsWith(route));
    if (!key) {
      return new Response(JSON.stringify({ statusCode: 404, message: 'Not found' }), { status: 404 });
    }
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('OOXClient', () => {
  it('prepares a buy from a fresh quote', async () => {
    const { fetchImpl, calls } = mockFetch({ '/v1/quote': quote() });
    const client = new OOXClient({ fetch: fetchImpl, apiKey: 'test-key' });

    const { transaction } = await client.prepareBuy({ buyer: BUYER, auctionId: 152, quantity: 3n });

    expect(calls[0].url).toBe(`https://api.oox.art/v1/quote?auctionId=152&quantity=3&buyer=${BUYER}`);
    expect(calls[0].headers['x-api-key']).toBe('test-key');
    expect(transaction.value).toBe(570_000_000_000_000_000n);
    expect(transaction.receiver.toBech32()).toBe('erd1qqqqqqqqqqqqqpgqwp73w2a9eyzs64eltupuz3y3hv798vlv899qrjnflg');
    // buy@auctionId@collection@nonce@quantity
    expect(Buffer.from(transaction.data).toString()).toBe(`buy@98@${Buffer.from('SENTINELS-1054d2').toString('hex')}@02@03`);
  });

  it('refuses purchases the contract would reject', async () => {
    const { fetchImpl } = mockFetch({ '/v1/quote': quote({ purchasable: false, reason: 'Seller cannot buy their own listing' }) });
    const client = new OOXClient({ fetch: fetchImpl });

    await expect(client.prepareBuy({ buyer: SELLER, auctionId: 152 })).rejects.toBeInstanceOf(OOXPurchaseError);
  });

  it('bids the minimum valid amount by default', async () => {
    const { fetchImpl } = mockFetch({
      '/v1/listings/9': listing({ auctionId: 9, saleType: 'nft', quantity: '1', priceType: 'auction', maxBid: null, minNextBid: '2100000000000000000' }),
    });
    const client = new OOXClient({ fetch: fetchImpl });

    const { transaction } = await client.prepareBid({ bidder: BUYER, auctionId: 9 });
    expect(transaction.value).toBe(2_100_000_000_000_000_000n);

    await expect(client.prepareBid({ bidder: BUYER, auctionId: 9, amount: 1n })).rejects.toThrow('Bid must be at least');
  });

  it('checks the payment token whitelist before listing', async () => {
    const { fetchImpl } = mockFetch({
      '/v1/config': { paymentTokens: ['EGLD', 'USDC-c76f1f'], marketplaceCutBps: 100 },
    });
    const client = new OOXClient({ fetch: fetchImpl });
    const base = { sender: SELLER, nfts: [{ collection: 'COLL-abc123', nftNonce: 1, quantity: 1n }], minBid: 1n, maxBid: 1n, deadline: 1_900_000_000 };

    await expect(client.prepareListing({ ...base, paymentToken: 'SCAM-123456' })).rejects.toThrow('not accepted');
    await expect(client.prepareListing({ ...base, paymentToken: 'USDC-c76f1f' })).resolves.toHaveLength(1);
  });

  it('surfaces API errors', async () => {
    const { fetchImpl } = mockFetch({});
    const client = new OOXClient({ fetch: fetchImpl });

    const error = await client.api.getListing(404).catch(e => e);
    expect(error).toBeInstanceOf(OOXApiError);
    expect(error.status).toBe(404);
    expect(error.message).toBe('Not found');
  });
});
