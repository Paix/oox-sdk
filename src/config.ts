export type OOXNetwork = 'mainnet' | 'devnet';

export interface OOXNetworkConfig {
  network: OOXNetwork;
  /** Chain ID MultiversX ('1' mainnet, 'D' devnet) */
  chainId: string;
  /** Base URL della OOX API (endpoint /v1) */
  apiUrl: string;
  /** Contratto marketplace OOX */
  marketplaceContract: string;
}

export const NETWORKS: Record<OOXNetwork, OOXNetworkConfig> = {
  mainnet: {
    network: 'mainnet',
    chainId: '1',
    apiUrl: 'https://api.oox.art',
    marketplaceContract: 'erd1qqqqqqqqqqqqqpgqwp73w2a9eyzs64eltupuz3y3hv798vlv899qrjnflg',
  },
  devnet: {
    network: 'devnet',
    chainId: 'D',
    // Non c'è una OOX API pubblica su devnet: va passato apiUrl a OOXClient
    apiUrl: '',
    marketplaceContract: 'erd1qqqqqqqqqqqqqpgqzlm8u9gpyaadmafa3032h8jqs0utzm6f899q3jvcha',
  },
};

/** Token nativo: nei listing e nei pagamenti è indicato come 'EGLD' */
export const EGLD = 'EGLD';

/** Massimo di NFT per singola transazione di listing (limite di gas) */
export const MAX_NFTS_PER_LISTING_TX = 50;

/**
 * Gas limit usati da oox.art per ogni chiamata. Sono valori misurati in produzione
 * con margine; si possono sovrascrivere chiamata per chiamata.
 */
export const GAS = {
  buy: 16_000_000n,
  bid: 16_000_000n,
  bulkBuyBase: 6_000_000n,
  bulkBuyPerItem: 5_000_000n,
  listBase: 6_000_000n,
  listPerItem: 6_000_000n,
  changePrice: 11_000_000n,
  changePriceMultiBase: 10_000_000n,
  changePriceMultiPerItem: 3_000_000n,
  withdraw: 11_000_000n,
  endAuction: 11_000_000n,
} as const;
