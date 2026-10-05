import {
  Abi,
  Address,
  BigUIntType,
  BigUIntValue,
  BooleanValue,
  CompositeType,
  CompositeValue,
  Field,
  FieldDefinition,
  OptionValue,
  SmartContractTransactionsFactory,
  Struct,
  StructType,
  Token,
  TokenIdentifierType,
  TokenIdentifierValue,
  TokenTransfer,
  Transaction,
  TransactionsFactoryConfig,
  U64Type,
  U64Value,
  VariadicType,
  VariadicValue,
} from '@multiversx/sdk-core';
import abiJson from '../src/abi/oox-marketplace.abi.json';
import { NETWORKS, OOXTransactions } from '../src';

/**
 * Riferimento: le transazioni come le costruiscono oggi gli hook di oox.art
 * (src/hooks/marketplace/*), con argomenti tipizzati scritti a mano.
 * L'SDK deve produrre esattamente gli stessi byte.
 */

const SENDER = 'erd1kfrxa85zsqharcg78n3tc90flh590x2lk4r65y8spr8gr0hr899qt4hs9v';
const CONTRACT = NETWORKS.mainnet.marketplaceContract;

const legacyFactory = new SmartContractTransactionsFactory({
  config: new TransactionsFactoryConfig({ chainID: '1' }),
  abi: Abi.create(abiJson),
});

function legacy(func: string, args: any[], gasLimit: bigint, payment: { nativeTransferAmount?: bigint; tokenTransfers?: TokenTransfer[] } = {}) {
  return legacyFactory.createTransactionForExecute(Address.newFromBech32(SENDER), {
    contract: Address.newFromBech32(CONTRACT),
    function: func,
    arguments: args,
    gasLimit,
    ...payment,
  });
}

function wire(tx: Transaction) {
  return {
    sender: tx.sender.toBech32(),
    receiver: tx.receiver.toBech32(),
    value: tx.value.toString(),
    gasLimit: tx.gasLimit.toString(),
    chainID: tx.chainID,
    data: Buffer.from(tx.data).toString(),
  };
}

const sdk = new OOXTransactions({ chainId: '1', marketplaceContract: CONTRACT });

describe('OOXTransactions matches oox.art encoding', () => {
  it('buy NFT with EGLD', async () => {
    const expected = await legacy('buy', [
      new U64Value(1234),
      new TokenIdentifierValue('COLL-abc123'),
      new U64Value(42),
    ], 16_000_000n, { nativeTransferAmount: 1_500_000_000_000_000_000n });

    const actual = await sdk.buy({
      sender: SENDER,
      auctionId: 1234,
      collection: 'COLL-abc123',
      nftNonce: 42,
      paymentToken: 'EGLD',
      amount: 1_500_000_000_000_000_000n,
    });

    expect(wire(actual)).toEqual(wire(expected));
  });

  it('buy SFT units with an ESDT', async () => {
    const expected = await legacy('buy', [
      new U64Value(77),
      new TokenIdentifierValue('SFT-abc123'),
      new U64Value(3),
      new BigUIntValue(4),
    ], 16_000_000n, {
      tokenTransfers: [new TokenTransfer({ token: new Token({ identifier: 'USDC-c76f1f' }), amount: 4_000_000n })],
    });

    const actual = await sdk.buy({
      sender: SENDER,
      auctionId: 77,
      collection: 'SFT-abc123',
      nftNonce: 3,
      paymentToken: 'USDC-c76f1f',
      amount: 4_000_000n,
      quantity: 4n,
    });

    expect(wire(actual)).toEqual(wire(expected));
  });

  it('WEGLD is paid as an ESDT, not as native EGLD', async () => {
    const tx = await sdk.buy({
      sender: SENDER,
      auctionId: 1,
      collection: 'COLL-abc123',
      nftNonce: 1,
      paymentToken: 'WEGLD-bd4d79',
      amount: 10n,
    });
    expect(tx.value).toBe(0n);
    expect(Buffer.from(tx.data).toString()).toMatch(/^ESDTTransfer@/);
  });

  it('bid', async () => {
    const expected = await legacy('bid', [
      new U64Value(9),
      new TokenIdentifierValue('COLL-abc123'),
      new U64Value(255),
    ], 16_000_000n, { nativeTransferAmount: 2_000_000_000_000_000_000n });

    const actual = await sdk.bid({
      sender: SENDER,
      auctionId: 9,
      collection: 'COLL-abc123',
      nftNonce: 255,
      paymentToken: 'EGLD',
      amount: 2_000_000_000_000_000_000n,
    });

    expect(wire(actual)).toEqual(wire(expected));
  });

  it('bulk buy groups by payment token', async () => {
    const buyStructType = new StructType('BuyStruct', [
      new FieldDefinition('auction_id', '', new U64Type()),
      new FieldDefinition('nft_type', '', new TokenIdentifierType()),
      new FieldDefinition('nft_nonce', '', new U64Type()),
      new FieldDefinition('opt_sft_buy_amount', '', new BigUIntType()),
    ]);
    const purchase = (auctionId: number, collection: string, nonce: number) => new Struct(buyStructType, [
      new Field(new U64Value(auctionId), 'auction_id'),
      new Field(new TokenIdentifierValue(collection), 'nft_type'),
      new Field(new U64Value(nonce), 'nft_nonce'),
      new Field(new OptionValue(new BigUIntType(), undefined), 'opt_sft_buy_amount'),
    ]);

    const expectedEgld = await legacy('bulkBuy', [
      new VariadicValue(new VariadicType(buyStructType), [purchase(1, 'COLL-abc123', 1), purchase(2, 'COLL-abc123', 2)]),
    ], 6_000_000n + 5_000_000n * 2n, { nativeTransferAmount: 3n });
    const expectedUsdc = await legacy('bulkBuy', [
      new VariadicValue(new VariadicType(buyStructType), [purchase(3, 'OTHER-def456', 10)]),
    ], 6_000_000n + 5_000_000n, {
      tokenTransfers: [new TokenTransfer({ token: new Token({ identifier: 'USDC-c76f1f' }), amount: 5n })],
    });

    const actual = await sdk.bulkBuy({
      sender: SENDER,
      items: [
        { auctionId: 1, collection: 'COLL-abc123', nftNonce: 1, paymentToken: 'EGLD', amount: 1n },
        { auctionId: 3, collection: 'OTHER-def456', nftNonce: 10, paymentToken: 'USDC-c76f1f', amount: 5n },
        { auctionId: 2, collection: 'COLL-abc123', nftNonce: 2, paymentToken: 'EGLD', amount: 2n },
      ],
    });

    expect(actual.map(wire)).toEqual([wire(expectedEgld), wire(expectedUsdc)]);
  });

  it('list at a fixed price, starting now', async () => {
    const expected = await legacy('auctionToken', [
      new BigUIntValue(1000),
      new BigUIntValue(1000),
      new U64Value(1_900_000_000),
      new TokenIdentifierValue('EGLD'),
      new BigUIntValue(0),
      new BooleanValue(false),
    ], 6_000_000n + 6_000_000n * 2n, {
      tokenTransfers: [
        new TokenTransfer({ token: new Token({ identifier: 'COLL-abc123', nonce: 1n }), amount: 1n }),
        new TokenTransfer({ token: new Token({ identifier: 'COLL-abc123', nonce: 2n }), amount: 1n }),
      ],
    });

    const [actual] = await sdk.list({
      sender: SENDER,
      nfts: [
        { collection: 'COLL-abc123', nftNonce: 1, quantity: 1n },
        { collection: 'COLL-abc123', nftNonce: 2, quantity: 1n },
      ],
      minBid: 1000n,
      maxBid: 1000n,
      paymentToken: 'EGLD',
      deadline: 1_900_000_000,
    });

    expect(wire(actual)).toEqual(wire(expected));
  });

  it('list SFT units with a scheduled start', async () => {
    const expected = await legacy('auctionToken', [
      new BigUIntValue(500),
      new BigUIntValue(500),
      new U64Value(1_900_000_000),
      new TokenIdentifierValue('USDC-c76f1f'),
      new BigUIntValue(0),
      new BooleanValue(true),
      new U64Value(0),
      new U64Value(1_800_000_000),
    ], 6_000_000n + 6_000_000n, {
      tokenTransfers: [new TokenTransfer({ token: new Token({ identifier: 'SFT-abc123', nonce: 7n }), amount: 25n })],
    });

    const [actual] = await sdk.list({
      sender: SENDER,
      nfts: [{ collection: 'SFT-abc123', nftNonce: 7, quantity: 25n }],
      minBid: 500n,
      maxBid: 500n,
      paymentToken: 'USDC-c76f1f',
      deadline: 1_900_000_000,
      startTime: 1_800_000_000,
    });

    expect(wire(actual)).toEqual(wire(expected));
  });

  it('list more than 50 NFTs in several transactions', async () => {
    const nfts = Array.from({ length: 120 }, (_, i) => ({ collection: 'COLL-abc123', nftNonce: i + 1, quantity: 1n }));
    const txs = await sdk.list({ sender: SENDER, nfts, minBid: 1n, maxBid: 1n, paymentToken: 'EGLD', deadline: 1_900_000_000, nonce: 10n });

    expect(txs).toHaveLength(3);
    expect(txs.map(tx => tx.nonce)).toEqual([10n, 11n, 12n]);
    expect(txs.map(tx => tx.gasLimit)).toEqual([306_000_000n, 306_000_000n, 126_000_000n]);
  });

  it('bulk list with a price per item', async () => {
    const pricePairType = new CompositeType(new BigUIntType(), new BigUIntType());
    const expected = await legacy('bulkListing', [
      new U64Value(1_900_000_000),
      new TokenIdentifierValue('EGLD'),
      new U64Value(0),
      new BooleanValue(false),
      new VariadicValue(new VariadicType(pricePairType), [
        new CompositeValue(pricePairType, [new BigUIntValue(100), new BigUIntValue(100)]),
        new CompositeValue(pricePairType, [new BigUIntValue(250), new BigUIntValue(250)]),
      ]),
    ], 6_000_000n + 6_000_000n * 2n, {
      tokenTransfers: [
        new TokenTransfer({ token: new Token({ identifier: 'COLL-abc123', nonce: 1n }), amount: 1n }),
        new TokenTransfer({ token: new Token({ identifier: 'COLL-abc123', nonce: 2n }), amount: 1n }),
      ],
    });

    const [actual] = await sdk.bulkList({
      sender: SENDER,
      items: [
        { collection: 'COLL-abc123', nftNonce: 1, quantity: 1n, minBid: 100n, maxBid: 100n },
        { collection: 'COLL-abc123', nftNonce: 2, quantity: 1n, minBid: 250n, maxBid: 250n },
      ],
      paymentToken: 'EGLD',
      deadline: 1_900_000_000,
    });

    expect(wire(actual)).toEqual(wire(expected));
  });

  it('change price of one and many listings', async () => {
    const expectedOne = await legacy('modifyAuctionPrice', [
      new U64Value(5),
      new BigUIntValue(10),
      new BigUIntValue(10),
      new TokenIdentifierValue('EGLD'),
    ], 11_000_000n);
    const expectedMany = await legacy('modifyMultiAuctionPrice', [
      new BigUIntValue(10),
      new BigUIntValue(0),
      new TokenIdentifierValue('USDC-c76f1f'),
      new VariadicValue(new VariadicType(new U64Type()), [new U64Value(5), new U64Value(6), new U64Value(7)]),
    ], 10_000_000n + 3_000_000n * 3n);

    const one = await sdk.changePrice({ sender: SENDER, auctionIds: [5], minBid: 10n, maxBid: 10n, paymentToken: 'EGLD' });
    const many = await sdk.changePrice({ sender: SENDER, auctionIds: [5, 6, 7], minBid: 10n, maxBid: 0n, paymentToken: 'USDC-c76f1f' });

    expect(wire(one)).toEqual(wire(expectedOne));
    expect(wire(many)).toEqual(wire(expectedMany));
  });

  it('cancel and end auction', async () => {
    expect(wire(await sdk.cancel({ sender: SENDER, auctionId: 300 }))).toEqual(wire(await legacy('withdraw', [new U64Value(300)], 11_000_000n)));
    expect(wire(await sdk.endAuction({ sender: SENDER, auctionId: 300 }))).toEqual(wire(await legacy('endAuction', [new U64Value(300)], 11_000_000n)));
  });
});
