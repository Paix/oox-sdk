# Changelog

## 0.1.1

First release. Covers the OOX marketplace contract on MultiversX.

- `OOXClient` with `prepareBuy`, `prepareBulkBuy`, `prepareBid` and `prepareListing`, which read fresh
  contract data from the OOX API before building the transaction.
- `OOXTransactions` builders: `buy`, `bulkBuy`, `bid`, `list`, `bulkList`, `changePrice`, `cancel`,
  `endAuction`.
- `OOXApiClient` for the OOX API v1: config, listings, quotes, seller listings, wallet NFTs.
- `parseAmount`, `formatAmount` and `deadlineFromDays` helpers.
