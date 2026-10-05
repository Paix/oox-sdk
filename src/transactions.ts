import {
  Abi,
  Address,
  BigUIntType,
  BigUIntValue,
  OptionType,
  OptionValue,
  SmartContractTransactionsFactory,
  Token,
  TokenTransfer,
  Transaction,
  TransactionsFactoryConfig,
} from '@multiversx/sdk-core';
import abiJson from './abi/oox-marketplace.abi.json';
import { EGLD, GAS, MAX_NFTS_PER_LISTING_TX } from './config';

/**
 * Costruzione delle transazioni verso il contratto marketplace OOX.
 * I builder non firmano e non inviano nulla: restituiscono Transaction di sdk-core
 * da passare al wallet della dapp (sdk-dapp, xPortal, Ledger, ...).
 * Tutti gli importi sono in unità atomiche (bigint).
 */

export interface TransactionsOptions {
  chainId: string;
  marketplaceContract: string;
}

interface BaseParams {
  /** Indirizzo bech32 di chi firma */
  sender: string;
  /** Nonce dell'account; se omesso va impostato prima della firma (sdk-dapp lo fa da sé) */
  nonce?: bigint;
  /** Sovrascrive il gas limit di default */
  gasLimit?: bigint;
}

export interface PaymentParams {
  /** 'EGLD' oppure l'identificatore ESDT del token di pagamento */
  paymentToken: string;
  /** Nonce del token di pagamento: 0 per EGLD ed ESDT fungibili */
  paymentTokenNonce?: number;
}

export interface BuyParams extends BaseParams, PaymentParams {
  auctionId: number;
  collection: string;
  nftNonce: number;
  /** Importo totale da pagare, come restituito da /v1/quote */
  amount: bigint;
  /** Unità da comprare; solo per listing sft-per-unit */
  quantity?: bigint;
}

export interface BulkBuyItem {
  auctionId: number;
  collection: string;
  nftNonce: number;
  paymentToken: string;
  paymentTokenNonce?: number;
  /** Prezzo di questo item */
  amount: bigint;
  /** Unità da comprare; solo per listing sft-per-unit */
  quantity?: bigint;
}

export interface BulkBuyParams extends Omit<BaseParams, 'gasLimit'> {
  items: BulkBuyItem[];
}

export interface BidParams extends BaseParams, PaymentParams {
  auctionId: number;
  collection: string;
  nftNonce: number;
  amount: bigint;
}

export interface ListedNft {
  collection: string;
  nftNonce: number;
  /** Unità da mettere in vendita (1 per gli NFT) */
  quantity: bigint;
}

export interface ListParams extends Omit<BaseParams, 'gasLimit'> {
  nfts: ListedNft[];
  /** Prezzo minimo; per un prezzo fisso uguale a maxBid */
  minBid: bigint;
  /** Prezzo buy-now; 0n = asta senza buy-now; uguale a minBid = prezzo fisso */
  maxBid: bigint;
  paymentToken: string;
  /** Scadenza in unix seconds (i prezzi fissi restano acquistabili anche dopo) */
  deadline: number;
  /** Inizio in unix seconds; se omesso il listing parte subito */
  startTime?: number;
  /** Rilancio minimo tra un bid e il successivo (aste) */
  minBidDiff?: bigint;
  /**
   * SFT vendibili a unità (true) o come lotto intero (false). Richiede prezzo fisso.
   * Default: true se almeno un NFT ha quantity > 1, come su oox.art.
   */
  sftOnePerPayment?: boolean;
}

export interface BulkListItem extends ListedNft {
  minBid: bigint;
  maxBid: bigint;
}

export interface BulkListParams extends Omit<BaseParams, 'gasLimit'> {
  items: BulkListItem[];
  paymentToken: string;
  deadline: number;
  startTime?: number;
  /** Default: true se almeno un item della transazione ha quantity > 1 */
  sftOnePerPayment?: boolean;
}

export interface ChangePriceParams extends Omit<BaseParams, 'gasLimit'> {
  auctionIds: number[];
  minBid: bigint;
  /** 0n = asta senza buy-now; uguale a minBid = prezzo fisso */
  maxBid: bigint;
  paymentToken: string;
  gasLimit?: bigint;
}

export interface AuctionActionParams extends BaseParams {
  auctionId: number;
}

export class OOXTransactions {
  private readonly factory: SmartContractTransactionsFactory;
  private readonly contract: Address;

  constructor(options: TransactionsOptions) {
    this.factory = new SmartContractTransactionsFactory({
      config: new TransactionsFactoryConfig({ chainID: options.chainId }),
      abi: Abi.create(abiJson),
    });
    this.contract = Address.newFromBech32(options.marketplaceContract);
  }

  /** Acquisto di un listing a prezzo fisso (endpoint buy) */
  async buy(params: BuyParams): Promise<Transaction> {
    const args: unknown[] = [params.auctionId, params.collection, params.nftNonce];
    // Il quarto argomento è opzionale: senza, il contratto compra 1 unità (o il lotto intero)
    if (params.quantity !== undefined && params.quantity > 1n) {
      args.push(params.quantity);
    }

    return await this.execute(params, 'buy', args, params.gasLimit ?? GAS.buy, this.payment(params, params.amount));
  }

  /**
   * Acquisto di più listing a prezzo fisso. Il contratto accetta un solo token di pagamento
   * per transazione, quindi si ottiene una transazione per ogni token (da firmare insieme).
   */
  async bulkBuy(params: BulkBuyParams): Promise<Transaction[]> {
    const groups = new Map<string, BulkBuyItem[]>();
    for (const item of params.items) {
      const key = `${item.paymentToken}:${item.paymentTokenNonce ?? 0}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    const transactions: Transaction[] = [];
    let nonce = params.nonce;
    for (const items of groups.values()) {
      const purchases = items.map(item => ({
        auction_id: item.auctionId,
        nft_type: item.collection,
        nft_nonce: item.nftNonce,
        // Valore tipizzato: il serializer nativo darebbe a un Option vuoto il tipo Option<?>,
        // che la struct BuyStruct rifiuta
        opt_sft_buy_amount: item.quantity !== undefined && item.quantity > 1n
          ? OptionValue.newProvided(new BigUIntValue(item.quantity))
          : new OptionValue(new OptionType(new BigUIntType())),
      }));
      const total = items.reduce((sum, item) => sum + item.amount, 0n);
      const gasLimit = GAS.bulkBuyBase + GAS.bulkBuyPerItem * BigInt(items.length);

      transactions.push(await this.execute(
        { sender: params.sender, nonce },
        'bulkBuy',
        purchases,
        gasLimit,
        this.payment(items[0], total),
      ));
      nonce = nonce === undefined ? undefined : nonce + 1n;
    }

    return transactions;
  }

  /** Bid su un'asta (endpoint bid) */
  async bid(params: BidParams): Promise<Transaction> {
    return await this.execute(
      params,
      'bid',
      [params.auctionId, params.collection, params.nftNonce],
      params.gasLimit ?? GAS.bid,
      this.payment(params, params.amount),
    );
  }

  /**
   * Listing di uno o più NFT con lo stesso prezzo (endpoint auctionToken).
   * Oltre MAX_NFTS_PER_LISTING_TX NFT le transazioni sono più di una.
   */
  async list(params: ListParams): Promise<Transaction[]> {
    const sftOnePerPayment = params.sftOnePerPayment ?? params.nfts.some(nft => nft.quantity > 1n);
    const args: unknown[] = [
      params.minBid,
      params.maxBid,
      params.deadline,
      params.paymentToken,
      params.minBidDiff ?? 0n,
      sftOnePerPayment,
    ];
    if (params.startTime !== undefined) {
      args.push(0, params.startTime);
    }

    const transactions: Transaction[] = [];
    let nonce = params.nonce;
    for (const chunk of chunks(params.nfts, MAX_NFTS_PER_LISTING_TX)) {
      transactions.push(await this.execute(
        { sender: params.sender, nonce },
        'auctionToken',
        args,
        GAS.listBase + GAS.listPerItem * BigInt(chunk.length),
        { tokenTransfers: chunk.map(nftTransfer) },
      ));
      nonce = nonce === undefined ? undefined : nonce + 1n;
    }

    return transactions;
  }

  /** Listing di più NFT con un prezzo diverso per ciascuno (endpoint bulkListing) */
  async bulkList(params: BulkListParams): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    let nonce = params.nonce;
    for (const chunk of chunks(params.items, MAX_NFTS_PER_LISTING_TX)) {
      // Ogni transazione è indipendente: il default si calcola sugli item della transazione
      const sftOnePerPayment = params.sftOnePerPayment ?? chunk.some(item => item.quantity > 1n);
      const args: unknown[] = [
        params.deadline,
        params.paymentToken,
        params.startTime ?? 0,
        sftOnePerPayment,
        ...chunk.map(item => [item.minBid, item.maxBid]),
      ];

      transactions.push(await this.execute(
        { sender: params.sender, nonce },
        'bulkListing',
        args,
        GAS.listBase + GAS.listPerItem * BigInt(chunk.length),
        { tokenTransfers: chunk.map(nftTransfer) },
      ));
      nonce = nonce === undefined ? undefined : nonce + 1n;
    }

    return transactions;
  }

  /** Cambio prezzo di uno o più listing senza bid (modifyAuctionPrice / modifyMultiAuctionPrice) */
  async changePrice(params: ChangePriceParams): Promise<Transaction> {
    if (!params.auctionIds.length) {
      throw new Error('auctionIds is empty');
    }

    if (params.auctionIds.length === 1) {
      return await this.execute(
        params,
        'modifyAuctionPrice',
        [params.auctionIds[0], params.minBid, params.maxBid, params.paymentToken],
        params.gasLimit ?? GAS.changePrice,
      );
    }

    return await this.execute(
      params,
      'modifyMultiAuctionPrice',
      [params.minBid, params.maxBid, params.paymentToken, ...params.auctionIds],
      params.gasLimit ?? GAS.changePriceMultiBase + GAS.changePriceMultiPerItem * BigInt(params.auctionIds.length),
    );
  }

  /** Ritiro di un listing senza bid (endpoint withdraw) */
  async cancel(params: AuctionActionParams): Promise<Transaction> {
    return await this.execute(params, 'withdraw', [params.auctionId], params.gasLimit ?? GAS.withdraw);
  }

  /** Chiusura di un'asta scaduta o arrivata al buy-now; chiunque può chiamarla */
  async endAuction(params: AuctionActionParams): Promise<Transaction> {
    return await this.execute(params, 'endAuction', [params.auctionId], params.gasLimit ?? GAS.endAuction);
  }

  private payment(params: PaymentParams, amount: bigint): { nativeTransferAmount?: bigint; tokenTransfers?: TokenTransfer[] } {
    if (params.paymentToken === EGLD) {
      return { nativeTransferAmount: amount };
    }

    return {
      tokenTransfers: [new TokenTransfer({
        token: new Token({ identifier: params.paymentToken, nonce: BigInt(params.paymentTokenNonce ?? 0) }),
        amount,
      })],
    };
  }

  private async execute(
    base: { sender: string; nonce?: bigint },
    func: string,
    args: unknown[],
    gasLimit: bigint,
    payment: { nativeTransferAmount?: bigint; tokenTransfers?: TokenTransfer[] } = {},
  ): Promise<Transaction> {
    const transaction = await this.factory.createTransactionForExecute(Address.newFromBech32(base.sender), {
      contract: this.contract,
      function: func,
      arguments: args,
      gasLimit,
      ...payment,
    });
    if (base.nonce !== undefined) {
      transaction.nonce = base.nonce;
    }
    return transaction;
  }
}

function nftTransfer(nft: ListedNft): TokenTransfer {
  return new TokenTransfer({
    token: new Token({ identifier: nft.collection, nonce: BigInt(nft.nftNonce) }),
    amount: nft.quantity,
  });
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}
