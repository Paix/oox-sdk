# @oox-marketplace/sdk

Buy and list NFTs on the [OOX marketplace](https://oox.art) from your own MultiversX dapp.

Listings created through the SDK are the same listings shown on oox.art: you share
OOX liquidity, and sales made from your dapp settle on the OOX contract.

- **Wallet agnostic.** The SDK builds unsigned `Transaction` objects from
  `@multiversx/sdk-core`. You sign and send them with the wallet you already use
  (sdk-dapp, xPortal, Ledger, Web Wallet…).
- **Exact amounts.** All amounts are atomic `bigint` values. `parseAmount` and
  `formatAmount` convert from and to human-readable strings without floating point errors.
- **Fresh data.** Listings and quotes come from the OOX API, which reads the contract state.
  `prepare*` methods fetch a fresh quote before building a transaction.

Scope of v0.1: OOX marketplace contract on MultiversX. Buy, bulk buy, bid, list, bulk list,
change price, cancel, end auction.

## Install

```bash
npm install @oox-marketplace/sdk @multiversx/sdk-core
```

`@multiversx/sdk-core` v15 is a peer dependency, so your dapp and the SDK share one copy.

## Quick start

```ts
import { OOXClient, formatAmount } from '@oox-marketplace/sdk';

const oox = new OOXClient({ network: 'mainnet', apiKey: process.env.OOX_API_KEY });

// Show the listings of a collection
const { items } = await oox.api.getListings({ collection: 'COLL-abc123', sort: 'price_asc' });
for (const listing of items) {
  console.log(listing.identifier, formatAmount(listing.price, listing.paymentTokenDecimals), listing.paymentToken);
}

// Buy one: the SDK fetches a fresh quote and builds the transaction
const { quote, transaction } = await oox.prepareBuy({ buyer: userAddress, auctionId: items[0].auctionId });
// Sign and send with your wallet provider, e.g. sdk-dapp:
// await signAndSendTransactions({ transactions: [transaction] });
```

## Buying

```ts
// Fixed price NFT or SFT lot
await oox.prepareBuy({ buyer, auctionId });

// SFT sold per unit: buy 3 units
await oox.prepareBuy({ buyer, auctionId, quantity: 3n });

// Several listings at once: one transaction per payment token, sign them together
const { transactions } = await oox.prepareBulkBuy({
  buyer,
  items: [{ auctionId: 101 }, { auctionId: 102 }, { auctionId: 230, quantity: 2n }],
});

// Auctions: bid the minimum valid amount, or a custom one
await oox.prepareBid({ bidder: buyer, auctionId });
await oox.prepareBid({ bidder: buyer, auctionId, amount: parseAmount('2.5', 18) });
```

`prepareBuy` throws `OOXPurchaseError` if the contract would reject the purchase (auction,
not started yet, not enough units, seller buying their own listing).

The quote also tells you how the payment is split:

```ts
quote.totalPrice            // exact amount paid
quote.breakdown.royalties   // to the creator
quote.breakdown.marketplaceFee
quote.breakdown.seller      // net to the seller
```

## Listing

```ts
import { deadlineFromDays, parseAmount } from '@oox-marketplace/sdk';

// Fixed price: minBid === maxBid
const transactions = await oox.prepareListing({
  sender: seller,
  nfts: [{ collection: 'COLL-abc123', nftNonce: 42, quantity: 1n }],
  minBid: parseAmount('1.5', 18),
  maxBid: parseAmount('1.5', 18),
  paymentToken: 'EGLD',
  deadline: deadlineFromDays(30),
});

// Auction with buy-now: minBid < maxBid. Auction without buy-now: maxBid = 0n.
```

More than 50 NFTs are split into several transactions. A different price per NFT:
`oox.tx.bulkList(...)`. Change price: `oox.tx.changePrice(...)`. Cancel: `oox.tx.cancel(...)`.

Which NFTs a wallet can list: `oox.api.getWalletNfts(address)`.

## Low-level builders

`oox.tx` (or `new OOXTransactions({ chainId, marketplaceContract })`) builds transactions from
values you already have, without calling the API. Use it if you index listings yourself.

```ts
import { OOXTransactions, NETWORKS } from '@oox-marketplace/sdk';

const tx = new OOXTransactions({ chainId: '1', marketplaceContract: NETWORKS.mainnet.marketplaceContract });
const buy = await tx.buy({
  sender, auctionId, collection, nftNonce, paymentToken: 'EGLD', amount: BigInt(listing.price),
});
```

Builders leave the account nonce unset unless you pass `nonce`; most wallet providers
set it before signing. Default gas limits are in `GAS` and can be overridden per call.

## API

The SDK talks to `https://api.oox.art/v1`. The OpenAPI spec is at
`https://api.oox.art/docs` under the `v1` tag.

| Method | Endpoint |
|---|---|
| `api.getConfig()` | `GET /v1/config` |
| `api.getListings(query)` | `GET /v1/listings` |
| `api.getListing(auctionId)` | `GET /v1/listings/:auctionId` |
| `api.getQuote(params)` | `GET /v1/quote` |
| `api.getAccountListings(address)` | `GET /v1/accounts/:address/listings` |
| `api.getWalletNfts(address)` | `GET /v1/accounts/:address/nfts` |

## License

MIT
