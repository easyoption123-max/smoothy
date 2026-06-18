/**
 * Smoothy - Core Arbitrage & DEX AMM Simulator Engine
 * Implements realistic Constant Product AMM Pools for Orca, Raydium, and Jupiter.
 * Simulates real-time market fluctuations, slippage / price impact math, and priority fees.
 */

export interface Pool {
  dex: string;
  pair: string;
  reserveBase: number;  // Base token (e.g., SOL)
  reserveQuote: number; // Quote token (e.g., USDC, BONK, JUP)
  fee: number;          // Pool swap fee (e.g., 0.003 for 0.3%)
}

export interface ArbitrageOpportunity {
  id: string;
  timestamp: string;
  route: string[];
  dexPath: string[];
  grossMargin: number; // percentage, e.g., 1.25
  grossProfit: number; // in SOL
  netProfit: number;   // in SOL
  gasFee: number;      // in SOL
  profitShareFee: number; // in SOL
  slippage: number;    // expected average slippage %
  status: 'active' | 'expired' | 'executing' | 'executed' | 'simulated';
}

// Initial AMM pool reserves to represent realistic starting spot prices
// SOL Price = ~$140.00, BONK Price = ~$0.000022, JUP Price = ~$0.90
const INITIAL_POOLS: Pool[] = [
  // Jupiter Pools (Deep Liquidity)
  { dex: 'Jupiter', pair: 'SOL/USDC', reserveBase: 250000, reserveQuote: 35000000, fee: 0.001 }, // 0.1% fee
  { dex: 'Jupiter', pair: 'SOL/BONK', reserveBase: 120000, reserveQuote: 763636363636, fee: 0.002 },
  { dex: 'Jupiter', pair: 'SOL/JUP',  reserveBase: 150000, reserveQuote: 23333333, fee: 0.001 },

  // Raydium Pools (Medium Liquidity, slightly different prices)
  { dex: 'Raydium', pair: 'SOL/USDC', reserveBase: 180000, reserveQuote: 25380000, fee: 0.0025 }, // 0.25% fee (SOL price ~141.00)
  { dex: 'Raydium', pair: 'SOL/BONK', reserveBase: 95000,  reserveQuote: 584000000000, fee: 0.003 }, // BONK price ~0.0000229
  { dex: 'Raydium', pair: 'SOL/JUP',  reserveBase: 110000, reserveQuote: 16500000, fee: 0.0025 }, // JUP price ~0.875

  // Orca Pools (Focused Liquidity, slightly different starting state)
  { dex: 'Orca', pair: 'SOL/USDC', reserveBase: 140000, reserveQuote: 19460000, fee: 0.002 }, // 0.2% fee (SOL price ~139.00)
  { dex: 'Orca', pair: 'SOL/BONK', reserveBase: 78000,  reserveQuote: 509090909090, fee: 0.002 }, // BONK price ~0.0000213
  { dex: 'Orca', pair: 'SOL/JUP',  reserveBase: 90000,  reserveQuote: 14100000, fee: 0.002 }, // JUP price ~0.91
];

export class ArbitrageEngine {
  private pools: Pool[];
  private activeDEXs: Record<string, boolean>;

  constructor() {
    // Deep clone to keep instances separated
    this.pools = JSON.parse(JSON.stringify(INITIAL_POOLS));
    this.activeDEXs = { jupiter: true, raydium: true, orca: true };
  }

  /**
   * Updates the list of active exchanges to scan
   */
  public updateActiveDEXs(dexConfig: Record<string, boolean>) {
    this.activeDEXs = { ...dexConfig };
  }

  /**
   * Simulates market transactions by introducing price noise and random trading volume.
   * This shifts AMM reserves dynamically and creates live arbitrage opportunities.
   */
  public simulateMarketActivity(): string[] {
    const changes: string[] = [];
    
    // Choose 1 to 2 random pools to apply a trade simulation
    const numTrades = Math.floor(Math.random() * 2) + 1;
    
    for (let i = 0; i < numTrades; i++) {
      const poolIndex = Math.floor(Math.random() * this.pools.length);
      const pool = this.pools[poolIndex];
      
      // Determine random trade direction (Buy SOL vs Sell SOL)
      const isBuySOL = Math.random() > 0.5;
      const solAmount = parseFloat((Math.random() * 80 + 5).toFixed(2)); // 5 to 85 SOL size
      
      if (isBuySOL) {
        // Simulating a user buying SOL with Quote token
        // Token quote goes into the pool, SOL goes out
        const quoteIn = solAmount * (pool.reserveQuote / pool.reserveBase);
        pool.reserveBase -= solAmount;
        pool.reserveQuote += quoteIn;
        changes.push(`Simulated Trade on ${pool.dex}: User bought ${solAmount} SOL in ${pool.pair} pool (+USDC/-SOL)`);
      } else {
        // Simulating a user selling SOL for Quote token
        // SOL goes into the pool, Token quote goes out
        const quoteOut = solAmount * (pool.reserveQuote / pool.reserveBase) * 0.99;
        pool.reserveBase += solAmount;
        pool.reserveQuote -= quoteOut;
        changes.push(`Simulated Trade on ${pool.dex}: User sold ${solAmount} SOL in ${pool.pair} pool (-USDC/+SOL)`);
      }

      // Safeguard reserves from dropping to zero
      if (pool.reserveBase < 5000) pool.reserveBase = 50000;
      if (pool.reserveQuote < 50000) pool.reserveQuote = 5000000;
    }
    
    return changes;
  }

  /**
   * Calculates the output amount received after swapping in a constant product AMM pool.
   * Formula: dy = (y * dx_with_fee) / (x + dx_with_fee)
   */
  private getSwapOutput(amountIn: number, reserveIn: number, reserveOut: number, feePercent: number): { amountOut: number; slippage: number } {
    const amountInWithFee = amountIn * (1 - feePercent);
    const amountOut = (reserveOut * amountInWithFee) / (reserveIn + amountInWithFee);
    
    // Slippage calculation = (1 - execution_price / spot_price) * 100
    const spotPrice = reserveOut / reserveIn;
    const executionPrice = amountOut / amountIn;
    const slippage = Math.max(0, (1 - executionPrice / spotPrice) * 100);
    
    return { amountOut, slippage };
  }

  /**
   * Finds pools for a specific exchange and pair
   */
  private findPool(dex: string, pair: string): Pool | undefined {
    return this.pools.find(
      (p) => p.dex.toLowerCase() === dex.toLowerCase() && p.pair.toUpperCase() === pair.toUpperCase()
    );
  }

  /**
   * Scans for buy-low, sell-high loops based on currently selected exchanges.
   * Path: SOL -> QuoteToken on DEX_A (Buy Token), QuoteToken -> SOL on DEX_B (Sell Token).
   */
  public scanArbitrage(investmentSOL: number): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];
    const timestamp = new Date().toTimeString().split(' ')[0];
    
    // Filter out only active exchanges
    const allowedDEXs = Object.entries(this.activeDEXs)
      .filter(([_, active]) => active)
      .map(([name]) => name.charAt(0).toUpperCase() + name.slice(1));

    if (allowedDEXs.length < 2) {
      // Need at least 2 exchanges to check discrepancies
      return [];
    }

    const targetPairs = ['USDC', 'BONK', 'JUP'];

    // Double loop over DEXs to find discrepancy pairs
    for (const token of targetPairs) {
      const pairName = `SOL/${token}`;

      for (const buyDEX of allowedDEXs) {
        for (const sellDEX of allowedDEXs) {
          if (buyDEX === sellDEX) continue;

          const buyPool = this.findPool(buyDEX, pairName);
          const sellPool = this.findPool(sellDEX, pairName);

          if (!buyPool || !sellPool) continue;

          // Swap 1: Swap SOL -> Token on BuyDEX (Pool: reserveBase is SOL, reserveQuote is Token)
          // We swap base to quote
          const firstSwap = this.getSwapOutput(
            investmentSOL,
            buyPool.reserveBase,
            buyPool.reserveQuote,
            buyPool.fee
          );

          const tokensAcquired = firstSwap.amountOut;

          // Swap 2: Swap Token -> SOL on SellDEX (Pool: reserveQuote is Token, reserveBase is SOL)
          // We swap quote to base
          const secondSwap = this.getSwapOutput(
            tokensAcquired,
            sellPool.reserveQuote,
            sellPool.reserveBase,
            sellPool.fee
          );

          const finalSOLReceived = secondSwap.amountOut;
          
          // Profit Math
          const grossProfit = finalSOLReceived - investmentSOL;
          
          if (grossProfit <= 0) continue; // Route is unprofitable at spot level

          const grossMargin = (grossProfit / investmentSOL) * 100;
          const averageSlippage = (firstSwap.slippage + secondSwap.slippage) / 2;

          // Network Priority Gas fee
          // Fixed estimate: 0.0003 SOL baseline + 0.0001 per additional route step
          const gasFee = 0.0005; 

          // Profit share fee: 0.5% applied on gross profit of successful trade
          const profitShareFee = grossProfit * 0.005;

          const netProfit = grossProfit - gasFee - profitShareFee;

          opportunities.push({
            id: `opp-${Math.random().toString(36).substr(2, 9)}`,
            timestamp,
            route: ['SOL', token, 'SOL'],
            dexPath: [buyDEX, sellDEX],
            grossMargin: parseFloat(grossMargin.toFixed(3)),
            grossProfit: parseFloat(grossProfit.toFixed(6)),
            netProfit: parseFloat(netProfit.toFixed(6)),
            gasFee,
            profitShareFee: parseFloat(profitShareFee.toFixed(6)),
            slippage: parseFloat(averageSlippage.toFixed(3)),
            status: 'active'
          });
        }
      }
    }

    // Sort opportunities by highest net profit
    return opportunities.sort((a, b) => b.netProfit - a.netProfit);
  }

  /**
   * Simulates a custom user-defined arbitrage route and returns full analytical results.
   */
  public simulateCustomRoute(
    investmentSOL: number,
    token: string,
    buyDEX: string,
    sellDEX: string,
    priorityGasFee: number
  ): {
    success: boolean;
    error?: string;
    buySpotPrice?: number;
    buyExecutionPrice?: number;
    buySlippage?: number;
    tokensAcquired?: number;
    sellSpotPrice?: number;
    sellExecutionPrice?: number;
    sellSlippage?: number;
    finalSOL?: number;
    grossProfit?: number;
    grossMargin?: number;
    profitShareFee?: number;
    netProfit?: number;
  } {
    const pairName = `SOL/${token}`;
    const buyPool = this.findPool(buyDEX, pairName);
    const sellPool = this.findPool(sellDEX, pairName);

    if (!buyPool || !sellPool) {
      return {
        success: false,
        error: `Liquidity pool for ${pairName} not found on selected exchanges.`
      };
    }

    // Spot prices before swap (Token quote per SOL base)
    const buySpotPrice = buyPool.reserveQuote / buyPool.reserveBase;
    const sellSpotPrice = sellPool.reserveQuote / sellPool.reserveBase;

    // Swap 1: SOL -> Token on BuyDEX (reserveBase to reserveQuote)
    const firstSwap = this.getSwapOutput(
      investmentSOL,
      buyPool.reserveBase,
      buyPool.reserveQuote,
      buyPool.fee
    );
    const tokensAcquired = firstSwap.amountOut;
    const buyExecutionPrice = tokensAcquired / investmentSOL;

    // Swap 2: Token -> SOL on SellDEX (reserveQuote to reserveBase)
    const secondSwap = this.getSwapOutput(
      tokensAcquired,
      sellPool.reserveQuote,
      sellPool.reserveBase,
      sellPool.fee
    );
    const finalSOL = secondSwap.amountOut;
    const sellExecutionPrice = tokensAcquired / finalSOL; // token per SOL

    const grossProfit = finalSOL - investmentSOL;
    const grossMargin = (grossProfit / investmentSOL) * 100;
    const profitShareFee = grossProfit > 0 ? grossProfit * 0.005 : 0;
    const netProfit = grossProfit - priorityGasFee - profitShareFee;

    return {
      success: true,
      buySpotPrice: parseFloat(buySpotPrice.toFixed(4)),
      buyExecutionPrice: parseFloat(buyExecutionPrice.toFixed(4)),
      buySlippage: parseFloat(firstSwap.slippage.toFixed(3)),
      tokensAcquired: parseFloat(tokensAcquired.toFixed(4)),
      sellSpotPrice: parseFloat(sellSpotPrice.toFixed(4)),
      sellExecutionPrice: parseFloat(sellExecutionPrice.toFixed(4)),
      sellSlippage: parseFloat(secondSwap.slippage.toFixed(3)),
      finalSOL: parseFloat(finalSOL.toFixed(6)),
      grossProfit: parseFloat(grossProfit.toFixed(6)),
      grossMargin: parseFloat(grossMargin.toFixed(3)),
      profitShareFee: parseFloat(profitShareFee.toFixed(6)),
      netProfit: parseFloat(netProfit.toFixed(6))
    };
  }
}
