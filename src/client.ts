import { Transaction } from '@multiversx/sdk-core';
import { OOXApiClient } from './api';
import { NETWORKS, OOXNetwork } from './config';
import { BulkBuyItem, ListParams, OOXTransactions } from './transactions';
import { Listing, Quote } from './types';

export interface OOXClientOptions {
  /** Default 'mainnet' */
  network?: OOXNetwork;
  /** Sovrascrive la OOX API della rete */
  apiUrl?: string;
  /** Chiave dell'integratore */
  apiKey?: string;
  /** Sovrascrive il contratto marketplace della rete */
  marketplaceContract?: string;
  /** Sovrascrive il chain ID della rete */
  chainId?: string;
  fetch?: typeof fetch;
}

export class OOXPurchaseError extends Error {
  constructor(message: string, readonly auctionId: number) {
    super(message);
    this.name = 'OOXPurchaseError';
  }
}

/**
 * Punto d'ingresso dell'SDK: unisce la lettura dei listing (api) e la costruzione
 * delle transazioni (tx). I metodi prepare* leggono lo stato aggiornato dal contratto
 * prima di costruire la transazione, così l'importo pagato è quello che il contratto si aspetta.
 */
export class OOXClient {
  readonly api: OOXApiClient;
  readonly tx: OOXTransactions;

  constructor(options: OOXClientOptions = {}) {
    const network = NETWORKS[options.network ?? 'mainnet'];
    this.api = new OOXApiClient({
      apiUrl: options.apiUrl ?? network.apiUrl,
      apiKey: options.apiKey,
      fetch: options.fetch,
    });
    this.tx = new OOXTransactions({
      chainId: options.chainId ?? network.chainId,
      marketplaceContract: options.marketplaceContract ?? network.marketplaceContract,
    });
  }

  /** Quote aggiornata e transazione di acquisto per un listing a prezzo fisso */
  async prepareBuy(params: { buyer: string; auctionId: number; quantity?: bigint; nonce?: bigint }): Promise<{ quote: Quote; transaction: Transaction }> {
    const quote = await this.api.getQuote({ auctionId: params.auctionId, quantity: params.quantity, buyer: params.buyer });
    assertPurchasable(quote);

    const transaction = await this.tx.buy({
      sender: params.buyer,
      nonce: params.nonce,
      auctionId: quote.auctionId,
      collection: quote.listing.collection,
      nftNonce: quote.listing.nonce,
      paymentToken: quote.paymentToken,
      paymentTokenNonce: quote.paymentTokenNonce,
      amount: BigInt(quote.totalPrice),
      quantity: quote.listing.saleType === 'sft-per-unit' ? BigInt(quote.quantity) : undefined,
    });

    return { quote, transaction };
  }

  /** Acquisto di più listing: una transazione per token di pagamento */
  async prepareBulkBuy(params: { buyer: string; items: Array<{ auctionId: number; quantity?: bigint }>; nonce?: bigint }): Promise<{ quotes: Quote[]; transactions: Transaction[] }> {
    const quotes = await Promise.all(params.items.map(item =>
      this.api.getQuote({ auctionId: item.auctionId, quantity: item.quantity, buyer: params.buyer }),
    ));
    quotes.forEach(assertPurchasable);

    const items: BulkBuyItem[] = quotes.map(quote => ({
      auctionId: quote.auctionId,
      collection: quote.listing.collection,
      nftNonce: quote.listing.nonce,
      paymentToken: quote.paymentToken,
      paymentTokenNonce: quote.paymentTokenNonce,
      amount: BigInt(quote.totalPrice),
      quantity: quote.listing.saleType === 'sft-per-unit' ? BigInt(quote.quantity) : undefined,
    }));

    return { quotes, transactions: await this.tx.bulkBuy({ sender: params.buyer, nonce: params.nonce, items }) };
  }

  /** Bid su un'asta: di default offre il minimo valido (minNextBid) */
  async prepareBid(params: { bidder: string; auctionId: number; amount?: bigint; nonce?: bigint }): Promise<{ listing: Listing; transaction: Transaction }> {
    const listing = await this.api.getListing(params.auctionId);
    if (listing.priceType === 'fixed') {
      throw new OOXPurchaseError('Listing has a fixed price: use prepareBuy', listing.auctionId);
    }
    if (!listing.isActive) {
      throw new OOXPurchaseError('Auction is not active', listing.auctionId);
    }

    const amount = params.amount ?? BigInt(listing.minNextBid ?? listing.minBid);
    if (amount < BigInt(listing.minNextBid ?? listing.minBid)) {
      throw new OOXPurchaseError(`Bid must be at least ${listing.minNextBid}`, listing.auctionId);
    }

    const transaction = await this.tx.bid({
      sender: params.bidder,
      nonce: params.nonce,
      auctionId: listing.auctionId,
      collection: listing.collection,
      nftNonce: listing.nonce,
      paymentToken: listing.paymentToken,
      paymentTokenNonce: listing.paymentTokenNonce,
      amount,
    });

    return { listing, transaction };
  }

  /** Listing con verifica che il token di pagamento sia accettato dal contratto */
  async prepareListing(params: ListParams): Promise<Transaction[]> {
    const config = await this.api.getConfig();
    if (config.paymentTokens.length && !config.paymentTokens.includes(params.paymentToken)) {
      throw new Error(`Payment token ${params.paymentToken} is not accepted by the marketplace`);
    }
    return await this.tx.list(params);
  }
}

function assertPurchasable(quote: Quote): void {
  if (!quote.purchasable) {
    throw new OOXPurchaseError(quote.reason ?? 'Listing cannot be purchased', quote.auctionId);
  }
}
