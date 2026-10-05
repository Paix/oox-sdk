/**
 * Tipi della OOX API v1. Gli importi sono stringhe in unità atomiche.
 * Rispecchiano src/endpoints/v1/entities/v1.entities.ts di oox-api-service.
 */

export type SaleType = 'nft' | 'sft-lot' | 'sft-per-unit';
export type PriceType = 'fixed' | 'auction' | 'auction-buy-now';
export type ListingSort = 'price_asc' | 'price_desc' | 'newest' | 'ending_soon';

export interface MarketplaceConfig {
  chain: string;
  network: string;
  chainId: string;
  marketplaceContract: string;
  /** Fee del marketplace in basis point (100 = 1%) */
  marketplaceCutBps: number;
  onxCutBps: number;
  onxToken: string;
  /** Token di pagamento accettati; vuoto = qualsiasi */
  paymentTokens: string[];
}

export interface Listing {
  auctionId: number;
  identifier: string;
  collection: string;
  nonce: number;
  /** Unità ancora in vendita */
  quantity: string;
  saleType: SaleType;
  priceType: PriceType;
  seller: string;
  paymentToken: string;
  paymentTokenNonce: number;
  paymentTokenDecimals: number;
  /** Prezzo fisso (per unità se sft-per-unit, per il lotto se sft-lot) o prezzo buy-now delle aste */
  price: string;
  minBid: string;
  maxBid: string | null;
  currentBid: string;
  currentWinner: string | null;
  minBidDiff: string;
  /** Importo minimo del prossimo bid (solo aste) */
  minNextBid: string | null;
  startTime: number;
  deadline: number;
  royaltiesBps: number;
  marketplaceCutBps: number;
  isActive: boolean;
  name?: string;
}

export interface ListingPage {
  items: Listing[];
  total: number;
  from: number;
  size: number;
}

export interface Quote {
  auctionId: number;
  quantity: string;
  purchasable: boolean;
  reason?: string;
  paymentToken: string;
  paymentTokenNonce: number;
  paymentTokenDecimals: number;
  /** Importo esatto da pagare */
  totalPrice: string;
  breakdown: {
    royalties: string;
    marketplaceFee: string;
    seller: string;
  };
  listing: Listing;
}

export interface WalletNft {
  identifier: string;
  collection: string;
  nonce: number;
  type: string;
  balance: string;
  name?: string;
  royaltiesBps: number;
  thumbnailUrl?: string;
}

export interface WalletNftPage {
  items: WalletNft[];
  from: number;
  size: number;
}
