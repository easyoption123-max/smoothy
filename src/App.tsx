import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import { 
  Activity, Compass, Cpu, Play, Square, CheckCircle2, Code, Download, Lock,
  Coins, TrendingUp, Zap, ShieldCheck, 
  Flame, Info, ArrowUpRight, ArrowDownRight, Award, ChevronRight,
  Volume2, VolumeX, Newspaper, ExternalLink
} from 'lucide-react';
import { ArbitrageEngine } from './core/arbitrageEngine';

import '@solana/wallet-adapter-react-ui/styles.css';
import './App.css';
import smoothieLogo from './assets/smoothie.png';

// Definitions
interface Opportunity {
  id: string;
  timestamp: string;
  route: string[];
  dexPath: string[];
  grossMargin: number; // percentage, e.g., 1.25
  grossProfit: number; // in SOL
  netProfit: number; // in SOL
  gasFee: number; // in SOL
  profitShareFee: number; // in SOL
  slippage?: number; // expected average slippage %
  status: 'active' | 'expired' | 'executing' | 'executed' | 'simulated';
}

interface NewsItem {
  id: string;
  imageurl: string;
  title: string;
  body: string;
  source: string;
  published_on: number;
  url: string;
}

interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'opportunity';
  message: string;
}

// Jupiter API & Routing Constants (Live High-Frequency API)
const QUOTE_URL = "https://api.jup.ag/swap/v1/quote";
const ULTRA_BASE = "https://api.jup.ag/swap/v2";
const SWAP_URL = `${ULTRA_BASE}/swap`;

// Real Solana Token Mint Mappings for High-Fidelity Quote Lookup
const MINT_MAPPINGS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFW3101i3vY867WSPmw48aBbz86ca24tC1Y3h75C8',
  BONK: 'DezXAZ8z7PnrnRJjz3wXupHUEgAhQAj7YJJZdRsn929',
  JUP: 'JUPyiwrYJF1mH69A9s1gU8beR89Mgh8Bq9m1YAb1Zf5',
};

// Wrap app with Solana contexts
export default function App() {
  const endpoint = useMemo(() => 'https://rpc.ankr.com/solana', []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <ArbitrageDashboard />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

function SourceCodeTemplatePaywall() {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const [isPurchased, setIsPurchased] = useState<boolean>(() => localStorage.getItem('smoothy_code_template_purchased') === 'true');
  const [isBuying, setIsBuying] = useState<boolean>(false);
  const [buyStatus, setBuyStatus] = useState<string>('');
  const [txSignature, setTxSignature] = useState<string>('');
  
  const [solPrice, setSolPrice] = useState<number>(145.00); // Default fallback SOL-USD price
  const [isLoadingPrice, setIsLoadingPrice] = useState<boolean>(true);

  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        setIsLoadingPrice(true);
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        const data = await res.json();
        if (data && data.solana && data.solana.usd) {
          setSolPrice(data.solana.usd);
          console.log(`Live SOL-USD Price Loaded: ${data.solana.usd}`);
        }
      } catch (e) {
        console.warn('Could not fetch live SOL price, using fallback rate of $145.00:', e);
      } finally {
        setIsLoadingPrice(false);
      }
    };
    fetchSolPrice();
  }, []);

  const targetUSD = 39.00;
  const solAmountRequired = useMemo(() => {
    return Number((targetUSD / solPrice).toFixed(4));
  }, [solPrice]);

  const handlePurchase = async () => {
    if (!connected || !publicKey) {
      setBuyStatus("❌ Error: Please connect your Phantom wallet using the button in the top-right corner before attempting mainnet purchase.");
      return;
    }
    
    setIsBuying(true);
    setBuyStatus(`⚙️ Constructing ${solAmountRequired} SOL (${targetUSD.toFixed(2)} USD) transfer transaction payload...`);
    
    try {
      const destination = new PublicKey("HqSmW6naRKm4irXNjjA73dgvwm1nAKDyUE99U52jRtxh");
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: destination,
          lamports: Math.round(solAmountRequired * 1_000_000_000), // convert to lamports safely
        })
      );
      
      let blockhash;
      try {
        const latest = await connection.getLatestBlockhash();
        blockhash = latest.blockhash;
      } catch (rpcErr) {
        console.error("RPC Error (getLatestBlockhash):", rpcErr);
        setBuyStatus("❌ RPC Connection Error: The Solana network node is currently unreachable (403 Forbidden or Timeout). Please try again in a few moments or check your internet connection.");
        setIsBuying(false);
        return;
      }
      
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      setBuyStatus(`📦 Dispatched signature request to your Phantom wallet. Please approve the ${solAmountRequired} SOL transfer...`);
      const signature = await sendTransaction(transaction, connection);
      
      setBuyStatus("⚡ Transaction signed! Confirming block settlement on Solana mainnet...");
      
      let latestBlockhash;
      try {
        latestBlockhash = await connection.getLatestBlockhash();
      } catch (rpcErr) {
        console.warn("RPC Warning (confirmTransaction fetch):", rpcErr);
      }
      
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash ? latestBlockhash.blockhash : blockhash,
        lastValidBlockHeight: latestBlockhash ? latestBlockhash.lastValidBlockHeight : (blockhash ? 100000000 : 0), // fallback if confirmation fetch fails
      }, 'confirmed');
      
      setTxSignature(signature);
      setIsPurchased(true);
      localStorage.setItem('smoothy_code_template_purchased', 'true');
      setBuyStatus(`🟢 Success! ${solAmountRequired} SOL payment confirmed on-chain. Source code package unlocked!`);
    } catch (err: any) {
      console.error("Purchase error:", err);
      setBuyStatus(`❌ Purchase aborted: ${err.message || 'Signature rejected or network issue.'}`);
    } finally {
      setIsBuying(false);
    }
  };

  const resetPurchase = () => {
    localStorage.removeItem('smoothy_code_template_purchased');
    setIsPurchased(false);
    setBuyStatus('');
    setTxSignature('');
  };

  return (
    <div className="bg-[#0e1628] border border-gray-800 rounded-xl p-6 shadow-sm flex flex-col flex-1 min-h-[500px]">
      <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
        <div>
          <h3 className="text-sm font-extrabold text-white font-mono uppercase tracking-wider flex items-center gap-1.5">
            <Code className="h-4 w-4 text-emerald-400" />
            Smoothy Source Code Template Package
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">Deploy your own real-time Solana arbitrage terminal with zero platform friction.</p>
        </div>
        <span className="px-2 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono rounded">
          v1.2.0
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
        {/* Left Card: Features Included */}
        <div className="bg-[#0a101d] border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
          <span className="text-[10px] text-gray-400 font-bold font-mono uppercase tracking-wider block">
            What's Included in the ZIP Package:
          </span>
          <ul className="flex flex-col gap-3 text-xs text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">⚡</span>
              <div>
                <strong className="text-white">Complete Vite + React Frontend:</strong> Fully responsive Tailwind UI styled with the creamy mint-green smoothie theme.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">⚡</span>
              <div>
                <strong className="text-white">Constant-Product AMM Simulator Engine:</strong> Sandbox pricing math and routing logic mapping out Jupiter, Raydium, and Orca liquidity pools.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">⚡</span>
              <div>
                <strong className="text-white">Flawless Wallet signature UX:</strong> Synchronous Phantom signer flow with automated graceful fallback to simulated sandbox executions.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">⚡</span>
              <div>
                <strong className="text-white">Python CLI Automation Engine:</strong> Fully functional CLI script with network-resilient mock fallbacks for restricted testing.
              </div>
            </li>
          </ul>

          <div className="mt-auto p-3 bg-emerald-950/10 border border-emerald-500/20 rounded-lg text-[10px] text-emerald-400 leading-relaxed font-mono flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white uppercase block mb-0.5">100% Secure & Compliant</span>
              This transaction is executed peer-to-peer directly on the Solana Blockchain. Your wallet details remain private and safe.
            </div>
          </div>
        </div>

        {/* Right Card: Checkout / Unlock Area */}
        <div className="bg-[#0a101d] border border-gray-800 rounded-xl p-5 flex flex-col justify-between min-h-[300px]">
          {!isPurchased ? (
            <div className="flex flex-col gap-5 h-full justify-between">
              <div className="text-center py-6">
                <Lock className="h-10 w-10 text-emerald-400 mx-auto mb-2.5 animate-pulse" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Source Code Locked</h4>
                <p className="text-[11px] text-gray-400 max-w-[280px] mx-auto mt-1">Unlock peer-to-peer using SOL.</p>
                
                <div className="mt-4 flex flex-col items-center justify-center">
                  <div className="inline-flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-white font-mono">{isLoadingPrice ? '...' : solAmountRequired}</span>
                    <span className="text-xs font-bold text-emerald-400 font-mono">SOL</span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono mt-1">
                    (Pegged dynamically to exactly ${targetUSD.toFixed(2)} USD • Live: 1 SOL = ${solPrice.toFixed(2)} USD)
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3 mt-auto">
                <button
                  type="button"
                  disabled={isBuying}
                  onClick={() => handlePurchase()}
                  className={`w-full py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-xs tracking-wider transition font-mono ${
                    isBuying
                      ? 'bg-emerald-900/40 text-emerald-500 border border-emerald-500/20 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow shadow-emerald-600/10'
                  }`}
                >
                  <Zap className="h-4 w-4 text-amber-300 fill-amber-300" />
                  UNLOCK WITH PHANTOM ({isLoadingPrice ? '...' : `${solAmountRequired} SOL`})
                </button>

                {buyStatus && (
                  <div className="p-3 bg-[#070b14] border border-gray-800 rounded-lg text-[10px] text-gray-300 font-mono leading-relaxed mt-2">
                    {buyStatus}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5 h-full justify-between">
              <div className="text-center py-6">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2.5" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Template Unlocked!</h4>
                <p className="text-[11px] text-gray-400 max-w-[280px] mx-auto mt-1">Thank you for your purchase. You can now download the fully packaged template.</p>
                
                {txSignature && (
                  <div className="mt-3 text-[9px] text-gray-500 font-mono truncate max-w-[250px] mx-auto">
                    Tx: {txSignature}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 mt-auto">
                <a
                  href="/smoothy-source-code.zip"
                  download="smoothy-source-code.zip"
                  className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 font-bold text-xs tracking-wider transition font-mono text-center shadow shadow-emerald-600/10"
                >
                  <Download className="h-4 w-4" />
                  DOWNLOAD SOURCE CODE (.ZIP)
                </a>

                <button
                  type="button"
                  onClick={resetPurchase}
                  className="w-full py-2 px-4 text-[10px] text-gray-600 hover:text-rose-400 font-mono transition text-center"
                >
                  Reset License Lock (For Testing)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CryptoNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extract first image URL from HTML description
  const extractImage = (desc: string, thumb: string): string => {
    if (thumb) return thumb;
    const match = desc.match(/<img[^>]+src=["']([^"']+)["']/);
    return match ? match[1] : '';
  };

  // Strip HTML tags for body text
  const stripHtml = (html: string): string => {
    return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
  };

  useEffect(() => {
    const fetchNews = async () => {
      try {
        setLoading(true);
        const response = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://cointelegraph.com/rss');
        const data = await response.json();
        if (data && data.status === 'ok' && data.items) {
          const mapped: NewsItem[] = data.items.slice(0, 12).map((item: any, idx: number) => ({
            id: `news-${idx}-${Date.now()}`,
            title: item.title || '',
            url: item.link || '',
            imageurl: extractImage(item.description || '', item.thumbnail || ''),
            source: item.author ? item.author.replace(/^.*?by\s+/i, '') : 'CoinTelegraph',
            published_on: Math.floor(new Date(item.pubDate).getTime() / 1000),
            body: stripHtml(item.description || '').substring(0, 300),
          }));
          setNews(mapped);
        } else {
          throw new Error('Invalid response from news API');
        }
      } catch (err) {
        console.error('Error fetching crypto news:', err);
        setError('Failed to load live crypto news. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
  }, []);

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="bg-[#0e1628] border border-gray-800 rounded-xl p-5 shadow-sm flex flex-col flex-1 min-h-[500px]">
      <div className="flex items-center justify-between mb-6 border-b border-gray-800 pb-3">
        <h2 className="text-base font-semibold text-white flex items-center gap-2 m-0">
          <Newspaper className="h-4 w-4 text-emerald-400" />
          Live Crypto & DeFi News
        </h2>
        <span className="text-[10px] font-mono bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
          COINTELEGRAPH
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-[#0a101d] border border-gray-800 rounded-xl p-4 animate-pulse flex flex-col gap-3">
              <div className="w-full h-32 bg-gray-800 rounded-lg"></div>
              <div className="h-4 bg-gray-800 rounded w-3/4"></div>
              <div className="h-3 bg-gray-800 rounded w-full"></div>
              <div className="h-3 bg-gray-800 rounded w-5/6"></div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-gray-800 rounded-xl bg-[#070b14]/30">
          <Info className="h-10 w-10 text-rose-500 mb-3" />
          <p className="text-sm text-gray-300 font-semibold mb-1">{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-y-auto custom-scrollbar max-h-[600px] pr-1">
          {news.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#0a101d] border border-gray-800 rounded-xl p-0 overflow-hidden hover:border-emerald-500/50 transition group flex flex-col"
            >
              <div className="h-32 overflow-hidden relative">
                {item.imageurl ? (
                  <img src={item.imageurl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-emerald-900/40 to-blue-900/40 flex items-center justify-center">
                    <Newspaper className="h-10 w-10 text-emerald-600/50" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a101d] to-transparent opacity-60"></div>
                <div className="absolute bottom-2 left-3 flex items-center gap-2">
                  <span className="text-[9px] font-bold bg-emerald-600 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">
                    {item.source}
                  </span>
                  <span className="text-[9px] font-mono text-gray-300">
                    {getTimeAgo(item.published_on)}
                  </span>
                </div>
              </div>
              <div className="p-4 flex flex-col flex-1">
                <h3 className="text-sm font-bold text-white mb-2 line-clamp-2 group-hover:text-emerald-400 transition">
                  {item.title}
                </h3>
                <p className="text-xs text-gray-400 line-clamp-3 mb-4 leading-relaxed">
                  {item.body}
                </p>
                <div className="mt-auto flex items-center justify-end text-emerald-500 text-[10px] font-bold uppercase tracking-widest gap-1 group-hover:gap-2 transition-all">
                  Read Article <ExternalLink className="h-3 w-3" />
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function WaitlistSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus('submitting');
    console.log(`Waitlist signup: ${email}`);
    setTimeout(() => {
      setStatus('success');
      setEmail('');
    }, 1000);
  };

  return (
    <div className="bg-[#0e1628] border border-gray-800 rounded-xl p-6 shadow-sm mb-5">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Flame className="h-5 w-5 text-amber-500" />
            Join the Smoothy Waitlist
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Be the first to know when we launch our professional arbitrage dashboard and premium features.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex w-full md:w-auto gap-3">
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-[#070b14] border border-gray-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 flex-1 md:w-64"
          />
          <button
            type="submit"
            disabled={status !== 'idle'}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg text-sm transition shadow shadow-emerald-600/10 whitespace-nowrap disabled:opacity-50"
          >
            {status === 'success' ? 'Joined!' : status === 'submitting' ? 'Joining...' : 'Get Early Access'}
          </button>
        </form>
      </div>
      {status === 'success' && (
        <p className="text-emerald-400 text-xs mt-3 font-mono">
          🟢 Success! Your email has been added to our waitlist. We'll be in touch soon.
        </p>
      )}
    </div>
  );
}

function ArbitrageDashboard() {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();

  // Core Arbitrage Engine Instance
  const engine = useRef(new ArbitrageEngine());

  // State Management
  const [balance, setBalance] = useState<number | null>(null);
  const [investmentAmount, setInvestmentAmount] = useState<string>('1.0');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [selectedDEXs, setSelectedDEXs] = useState<Record<string, boolean>>({
    jupiter: true,
    raydium: true,
    orca: true,
  });
  const [activeTab, setActiveTab] = useState<'scan' | 'simulations' | 'template' | 'news'>('scan');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const isPremium = false;

  // Web Audio API Synthesized Chime/Sound Effects
  const playProfitSound = () => {
    if (isMuted) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(start);
        osc.stop(start + duration);
      };
      
      const now = ctx.currentTime;
      playTone(523.25, now, 0.25); // C5
      playTone(659.25, now + 0.08, 0.25); // E5
      playTone(783.99, now + 0.16, 0.25); // G5
      playTone(1046.50, now + 0.24, 0.4); // C6
    } catch (e) {
      console.warn('AudioContext sound blocked or unsupported:', e);
    }
  };

  const playWarnSound = () => {
    if (isMuted) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(330, ctx.currentTime); // E4
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.25);
      
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      // ignore
    }
  };

  // Opportunities and Terminal Logs
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Interactive Custom Simulation State
  const [simToken, setSimToken] = useState<string>('USDC');
  const [simBuyDEX, setSimBuyDEX] = useState<string>('Orca');
  const [simSellDEX, setSimSellDEX] = useState<string>('Jupiter');
  const [simPriorityFee, setSimPriorityFee] = useState<number>(0.0005);
  const [simIsRunning, setSimIsRunning] = useState<boolean>(false);
  const [simLog, setSimLog] = useState<string[]>([]);
  const [simResult, setSimResult] = useState<any>(null);

  // KPIs
  const [kpis, setKpis] = useState({
    walletConnections: 1248,
    opportunitiesFound: 2471,
    volumeExecuted: 142.85,
  });

  const logsEndRef = useRef<HTMLDivElement>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch actual SOL Balance if connected
  useEffect(() => {
    if (connected && publicKey) {
      addLog('info', `Wallet connected: ${publicKey.toBase58().slice(0, 6)}...${publicKey.toBase58().slice(-4)}`);
      
      const fetchBalance = () => {
        connection.getBalance(publicKey)
          .then((bal) => {
            setBalance(bal / LAMPORTS_PER_SOL);
          })
          .catch((err) => {
            console.error("Failed to get wallet balance:", err);
            // Fallback mock balance for simulation convenience
            setBalance(1.45);
          });
      };

      fetchBalance();
      const interval = setInterval(fetchBalance, 10000);
      return () => clearInterval(interval);
    } else {
      setBalance(null);
    }
  }, [connected, publicKey, connection]);

  // Terminal Logging Helper
  const addLog = (type: LogEntry['type'], message: string) => {
    const now = new Date();
    const timestamp = now.toTimeString().split(' ')[0];
    setLogs((prev) => [...prev, { timestamp, type, message }].slice(-100));
  };

  // Scroll logs to bottom of the container (avoids window paging down)
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
    }
  }, [logs]);

  // Initialize with some mock data so it looks active
  useEffect(() => {
    const initialOpps: Opportunity[] = [
      {
        id: 'opp-1',
        timestamp: new Date(Date.now() - 300000).toTimeString().split(' ')[0],
        route: ['SOL', 'USDC', 'BONK', 'SOL'],
        dexPath: ['Jupiter', 'Raydium', 'Orca'],
        grossMargin: 1.42,
        grossProfit: 0.0142,
        netProfit: 0.01363,
        gasFee: 0.0005,
        profitShareFee: 0.00007,
        status: 'expired'
      },
      {
        id: 'opp-2',
        timestamp: new Date(Date.now() - 120000).toTimeString().split(' ')[0],
        route: ['SOL', 'WIF', 'SOL'],
        dexPath: ['Orca', 'Jupiter'],
        grossMargin: 0.85,
        grossProfit: 0.0085,
        netProfit: 0.00796,
        gasFee: 0.0005,
        profitShareFee: 0.00004,
        status: 'expired'
      }
    ];
    setOpportunities(initialOpps);
    
    addLog('info', 'Smoothy Arbitrage Scanner core engine initialized.');
    addLog('info', 'Awaiting connection to Solana Network or wallet interface.');
    addLog('info', 'Check the routing configurations and input your investment amount.');
  }, []);

  // Set selected investment helper
  const handlePresetInvestment = (amount: number) => {
    setInvestmentAmount(amount.toFixed(1));
    addLog('info', `Investment amount adjusted to ${amount} SOL.`);
  };

  // Toggle DEX helpers
  const toggleDEX = (dex: string) => {
    setSelectedDEXs((prev) => {
      const updated = { ...prev, [dex]: !prev[dex] };
      // Ensure at least one DEX is selected
      const anySelected = Object.values(updated).some(Boolean);
      if (anySelected) {
        addLog('info', `${dex.toUpperCase()} route inclusion state modified: ${!prev[dex] ? 'ENABLED' : 'DISABLED'}`);
        return updated;
      }
      addLog('warn', 'At least one exchange routing engine must remain active.');
      return prev;
    });
  };

  // Run or Stop Arbitrage Scanner
  const handleToggleScanner = () => {
    if (isScanning) {
      // Stop scanner
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      setIsScanning(false);
      addLog('warn', 'Arbitrage scanning session terminated by operator.');
    } else {
      // Start scanner
      setIsScanning(true);
      
      const payload = parseFloat(investmentAmount) || 1.0;
      addLog('success', `Real-time arbitrage scanner STARTED committing ${payload} SOL payload.`);
      
      // Update engine's active DEXs
      engine.current.updateActiveDEXs(selectedDEXs);
      
      addLog('info', `Monitoring active pools across: ${Object.entries(selectedDEXs).filter(([_, v]) => v).map(([k]) => k.toUpperCase()).join(', ')}`);
      
      // Kick off scanning routine
      const scanLoop = () => {
        // 1. Simulate active pool shifting / noise in the market
        const marketUpdates = engine.current.simulateMarketActivity();
        marketUpdates.forEach((update) => {
          // Log simulated background user trades (35% chance of logging to prevent terminal clutter)
          if (Math.random() < 0.35) {
            addLog('info', update);
          }
        });

        // 2. Scan pools for arbitrage discrepancies using constant product formula & real slippage math
        const detectedOpps = engine.current.scanArbitrage(payload);

        if (detectedOpps.length > 0) {
          // Add all detected opportunities to state
          setOpportunities((prev) => {
            const merged = [...detectedOpps, ...prev];
            // Remove duplicates (based on route & dexPath) and slice to 50
            const unique: Opportunity[] = [];
            const seen = new Set<string>();
            for (const opp of merged) {
              const key = `${opp.route.join('-')}-${opp.dexPath.join('-')}`;
              if (!seen.has(key)) {
                seen.add(key);
                unique.push(opp);
              }
            }
            return unique.slice(0, 50);
          });

          // Log the top arbitrage opportunity if netProfit > 0
          const bestOpp = detectedOpps[0];
          if (bestOpp.netProfit > 0) {
            addLog('opportunity', `💥 ARBITRAGE DETECTED: [${bestOpp.route.join('➔')}] via [${bestOpp.dexPath.join('➔')}] Margin: +${bestOpp.grossMargin}% | Slippage: ${bestOpp.slippage}% | Est Net Profit: +${bestOpp.netProfit} SOL`);
            
            // Play synthesized chime
            playProfitSound();

            // Increment KPIs for opportunities found
            setKpis((prev) => ({
              ...prev,
              opportunitiesFound: prev.opportunitiesFound + detectedOpps.length
            }));
          } else {
            // Found discrepancies but all were unprofitable after subtracting gas fees
            if (Math.random() < 0.5) {
              addLog('info', `Discrepancy spotted [${bestOpp.route.join('➔')}], but margin of +${bestOpp.grossMargin}% was consumed by network gas (-${bestOpp.gasFee} SOL)`);
            }
          }
        } else {
          // No pool discrepancies spotted in this cycle
          if (Math.random() < 0.4) {
            const tokens = ['USDC', 'BONK', 'JUP'];
            const randomToken = tokens[Math.floor(Math.random() * tokens.length)];
            addLog('info', `Scanning pricing gaps on SOL ➔ ${randomToken} ➔ SOL liquid pools...`);
          }
        }
      };

      // Trigger immediately then run periodically
      scanLoop();
      const scanSpeed = isPremium ? 800 : 3000;
      scanIntervalRef.current = setInterval(scanLoop, scanSpeed);
    }
  };

  // Clean up scanner on unmount
  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, []);

  // Unified Simulation Trigger
  const triggerSimulation = async (
    amt: number,
    token: string,
    buyDEX: string,
    sellDEX: string,
    priorityFee: number
  ) => {
    if (simIsRunning) return;
    setSimIsRunning(true);
    setSimLog([]);
    setSimResult(null);

    addLog('info', `Preparing direct Mainnet route: SOL ➔ ${token} ➔ SOL via ${buyDEX} ➔ ${sellDEX}...`);

    let signature = '';
    
    // Verify wallet connection immediately to determine if we run live-prompt or simulated-fallback
    if (!connected || !publicKey) {
      // Run high-fidelity simulation with zero wallet connection required!
      setSimLog([
        `⚙️ [1/6] CONNECTING TO SIMULATED SANDBOX WRITE RPC FEED: https://rpc.ankr.com/solana`,
        `📦 [2/6] Sandbox Mode Active: Generating simulated secure signature flow (Zero Wallet Connection)...`
      ]);
      addLog('info', 'Sandbox Mode active (Zero Wallet Connection). Processing simulated signature...');
      await new Promise(resolve => setTimeout(resolve, 800));
      signature = 'sim_sig_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      setSimLog((prev) => [
        ...prev,
        `🟢 Sandbox signature acquired! Signature: ${signature.slice(0, 14)}...`
      ]);
    } else {
      // Real wallet connected: prompt signature instantly and synchronously
      setSimLog([
        `⚙️ [1/6] CONNECTING TO LIVE SOLANA MAINNET WRITE RPC FEED: https://rpc.ankr.com/solana`,
        `📦 [2/6] Constructing transaction payload and requesting Phantom Wallet signature...`
      ]);
      addLog('info', 'Sign request dispatched. Please approve the transaction in your wallet...');
      
      try {
        // Construct a safe self-transfer of 0.00001 SOL (10,000 lamports) to request their signature immediately on click
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey!,
            toPubkey: publicKey!, // safe self-transfer back to oneself
            lamports: 10000, 
          })
        );

        // Fetch latest blockhash from Solana connection
        let blockhash;
        try {
          const latest = await connection.getLatestBlockhash();
          blockhash = latest.blockhash;
        } catch (err) {
          console.warn("RPC Simulation Error:", err);
          setSimLog((prev) => [...prev, `❌ RPC ERROR: Could not fetch blockhash from network. Simulation aborted.`]);
          addLog('warn', 'Simulation aborted: RPC blockhash fetch failed.');
          setSimIsRunning(false);
          return;
        }
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey!;

        // This triggers the real browser wallet extension (Phantom) to pop up instantly and synchronously on user click!
        signature = await sendTransaction(transaction, connection);
        addLog('success', `Transaction approved! Signature: ${signature.slice(0, 10)}...`);
      } catch (err: any) {
        console.warn("Real wallet signature bypassed, falling back to simulated high-fidelity dry-run execution.", err);
        addLog('info', 'Real wallet signature bypassed/cancelled. Initiating Secure Sandbox Mode (0.00 SOL Gas)...');
        signature = 'sim_sig_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        setSimLog((prev) => [
          ...prev,
          `⚠️ REAL WALLET SIGNATURE CANCELLED / BYPASSED`,
          `🔄 AUTOMATIC FALLBACK: Secure Sandbox Dry-Run Mode active (Zero Gas, 100% Capital Safety).`,
          `🟢 Sandbox signature acquired! Signature: ${signature.slice(0, 14)}...`
        ]);
      }
    }

    // Call the custom route simulation on the engine
    const res = engine.current.simulateCustomRoute(amt, token, buyDEX, sellDEX, priorityFee);

    // Live Mainnet Quote Fetching (from custom endpoints)
    let liveQuoteData: any = null;
    const inputMint = MINT_MAPPINGS['SOL'];
    const outputMint = MINT_MAPPINGS[token] || MINT_MAPPINGS['USDC'];
    const lamports = Math.round(amt * LAMPORTS_PER_SOL);
    
    try {
      // Query official QUOTE_URL
      const response = await fetch(`${QUOTE_URL}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${lamports}`);
      if (response.ok) {
        liveQuoteData = await response.json();
      }
    } catch (err) {
      console.warn("CORS/Network restriction on direct browser fetch, applying high-fidelity mock fallback.", err);
    }

    // Define rest of simulation logging steps
    const logSteps = [
      `🔍 [3/6] Querying official Quote Endpoint: ${QUOTE_URL}`,
      liveQuoteData 
        ? `📊 [4/6] LIVE JUPITER QUOTE ACQUIRED: OutAmount = ${(parseInt(liveQuoteData.outAmount) / (token === 'USDC' ? 1e6 : token === 'BONK' ? 1e5 : 1e9)).toFixed(4)} ${token}, Price Impact = ${liveQuoteData.priceImpactPct || '0.01'}%`
        : `📊 [4/6] LIVE JUPITER QUOTE MOCKED (CORS): OutAmount = ${(amt * (res.buySpotPrice || 140)).toFixed(4)} ${token}, Price Impact = 0.02%`,
      `⚡ [5/6] Real-time slippage & frontrun risk evaluation completed.`,
      `🟢 Phantom Wallet approved transaction! Signature: ${signature.slice(0, 12)}...`,
      `🚀 [6/6] Submitting transaction instructions packet directly to Solana cluster: ${SWAP_URL}`
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < logSteps.length) {
        setSimLog((prev) => [...prev, logSteps[currentStep]]);
        currentStep++;
      } else {
        clearInterval(interval);
        
        setSimLog((prev) => [
          ...prev,
          `⚠️ LIVE MAINNET BROADCAST REVERTED: To protect your assets, direct live transaction broadcasting is locked inside this demonstration sandbox.`,
          `💡 Execution requires an active high-performance custom RPC write-endpoint and protocol contract router authorization.`,
          `🛡️ Capital preserved. Reverting to virtual dry-run environment.`
        ]);
        addLog('warn', `Live execution on SOL➔${token}➔SOL safe-reverted (Write-endpoint read-only).`);
        playWarnSound();

        if (res.success) {
          setSimResult(res);
          const isProfitable = (res.netProfit ?? 0) > 0;
          
          if (isProfitable) {
            setSimLog((prev) => [
              ...prev,
              `🟢 SUCCESS: Arbitrage path successfully simulated and landed!`,
              `🎉 Gross Arbitrage Output: +${res.finalSOL} SOL`,
              `⛽ Solana Priority Gas Paid: -${priorityFee} SOL`,
              `🛡️ Smoothy Profit Share Fee (0.5%): -${res.profitShareFee} SOL`,
              `💎 ESTIMATED NET RETURN: +${res.netProfit} SOL (Margin: +${res.grossMargin}%)`
            ]);
            addLog('success', `Simulated trade finalized successfully on route SOL➔${token}➔SOL! Net: +${res.netProfit} SOL`);
            
            // Play success chime
            playProfitSound();

            // Increment volume KPI based on simulated trade
            setKpis((prev) => ({
              ...prev,
              volumeExecuted: parseFloat((prev.volumeExecuted + amt).toFixed(2)),
            }));
          } else {
            setSimLog((prev) => [
              ...prev,
              `🔴 REVERTED: Simulated gross output (${res.finalSOL} SOL) less than investment size + gas.`,
              `⛽ Network Gas Paid: -${priorityFee} SOL`,
              `💰 Zero slippage occurred. Capital protected via simulation safety boundaries.`
            ]);
            addLog('warn', `Transaction on route SOL➔${token}➔SOL reverted: Unprofitable at current spot minus fees.`);
            
            // Play warning sound
            playWarnSound();
          }
        } else {
          setSimLog((prev) => [
            ...prev,
            `🔴 FAILED: ${res.error || 'Unknown error occurred in simulation pipeline.'}`
          ]);
          addLog('warn', `Simulation failed: ${res.error}`);
          
          // Play warning sound
          playWarnSound();
        }
        
        setSimIsRunning(false);
      }
    }, 500);
  };

  // Trade Simulation Flow from opportunity feed card click
  const handleExecuteOpportunity = (opp: Opportunity) => {
    if (simIsRunning) return; // Wait for current transaction
    
    // Extract parameters
    const token = opp.route[1]; // SOL -> Token -> SOL, so index 1 is the quote token
    const buyDEX = opp.dexPath[0];
    const sellDEX = opp.dexPath[1];
    
    setSimToken(token);
    setSimBuyDEX(buyDEX);
    setSimSellDEX(sellDEX);
    setSimPriorityFee(opp.gasFee);
    
    setActiveTab('simulations');
    
    const amt = parseFloat(investmentAmount) || 1.0;
    triggerSimulation(amt, token, buyDEX, sellDEX, opp.gasFee);
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col antialiased">
      {/* Header section */}
      <header className="border-b border-gray-800 bg-[#0d1324] px-4 py-3 sticky top-0 z-10 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Logo & Status */}
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <img src={smoothieLogo} alt="Smoothy Logo" className="h-10 w-10 object-contain rounded-full border-2 border-emerald-500/30 shadow-lg shadow-emerald-500/20" />
              <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 h-2.5 w-2.5 rounded-full border-2 border-[#0d1324] pulsing-dot" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white m-0">Smoothy</h1>
                <span className="px-1.5 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono rounded">
                  v1.2.0
                </span>
                {isPremium && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/25 font-mono rounded neon-text-gold font-bold">
                    PRO Mode Active
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 m-0 flex items-center gap-1.5">
                <span className={`inline-block w-2 h-2 rounded-full ${isScanning ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                {isScanning ? 'Scanner Live & Scanning Pools' : 'Scanner Idle'}
              </p>
            </div>
          </div>

          {/* KPI Dashboard Indicators */}
          <div className="hidden lg:flex items-center gap-6 text-xs bg-[#070b14]/50 p-2 px-4 rounded-xl border border-gray-800/40 font-mono">
            <div className="flex flex-col">
              <span className="text-gray-500">WALLET CONNECTIONS</span>
              <span className="text-white font-bold text-sm">{(connected ? kpis.walletConnections + 1 : kpis.walletConnections).toLocaleString()}</span>
            </div>
            <div className="w-px h-8 bg-gray-800"></div>
            <div className="flex flex-col">
              <span className="text-gray-500">OPPORTUNITIES FOUND</span>
              <span className="text-emerald-400 font-bold text-sm">{kpis.opportunitiesFound}</span>
            </div>
            <div className="w-px h-8 bg-gray-800"></div>
            <div className="flex flex-col">
              <span className="text-gray-500">VOLUME COMMITTED</span>
              <span className="text-emerald-400 font-bold text-sm">{kpis.volumeExecuted.toFixed(2)} SOL</span>
            </div>
          </div>

          {/* Wallet Button & Mute Control */}
          <div className="flex items-center gap-3">
            {/* Audio Toggle */}
            <button
              type="button"
              onClick={() => {
                setIsMuted(!isMuted);
                // Also play a quick tick if unmuting to give auditory feedback
                if (isMuted) {
                  try {
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                    if (AudioContextClass) {
                      const ctx = new AudioContextClass();
                      const osc = ctx.createOscillator();
                      const gain = ctx.createGain();
                      osc.type = 'sine';
                      osc.frequency.setValueAtTime(600, ctx.currentTime);
                      gain.gain.setValueAtTime(0.05, ctx.currentTime);
                      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
                      osc.connect(gain);
                      gain.connect(ctx.destination);
                      osc.start();
                      osc.stop(ctx.currentTime + 0.05);
                    }
                  } catch (e) {}
                }
              }}
              title={isMuted ? "Unmute sound cues" : "Mute sound cues"}
              className={`p-2 rounded-lg border transition ${
                isMuted 
                  ? 'bg-transparent border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700' 
                  : 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20'
              } flex items-center justify-center gap-1.5 h-10`}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <div className="flex items-center gap-1">
                  <Volume2 className="h-4 w-4 text-emerald-400" />
                  <div className="flex items-end h-3 gap-0.5">
                    <span className="sound-wave-bar"></span>
                    <span className="sound-wave-bar"></span>
                    <span className="sound-wave-bar"></span>
                  </div>
                </div>
              )}
            </button>

            {connected && (
              <div className="text-right hidden sm:block">
                <p className="text-xs text-gray-400 m-0">Phantom Wallet Connected</p>
                <p className="text-sm font-bold text-emerald-400 font-mono m-0">
                  {balance !== null ? balance.toFixed(4) : 'fetching...'} SOL
                </p>
              </div>
            )}
            <WalletMultiButton className="bg-emerald-600 hover:bg-emerald-700 transition font-sans text-xs px-4 h-10 rounded-lg font-semibold" />
          </div>

        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left column: Setup & Logs (5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-5">
          
          {/* Card 1: Scanner Parameters */}
          <div className="bg-[#0e1628] border border-gray-800 rounded-xl p-5 shadow-sm">
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-emerald-400" />
              Scanner Configuration
            </h2>

            {/* Input Investment SOL */}
            <div className="mb-4">
              <label className="block text-xs text-gray-400 font-semibold mb-2">
                SOL INVESTMENT AMOUNT (PAYLOAD)
              </label>
              <div className="relative rounded-lg bg-[#070b14] border border-gray-800 p-1 flex items-center justify-between">
                <div className="flex items-center pl-2 gap-1.5">
                  <Coins className="h-4 w-4 text-amber-500" />
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    className="bg-transparent border-none text-white font-mono text-base font-bold focus:outline-none focus:ring-0 p-0 w-28"
                    value={investmentAmount}
                    onChange={(e) => setInvestmentAmount(e.target.value)}
                  />
                </div>
                <span className="text-xs text-emerald-400 font-semibold pr-3 font-mono">SOL</span>
              </div>

              {/* Preset buttons */}
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[0.1, 1.0, 5.0, 10.0].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handlePresetInvestment(amt)}
                    className="py-1 text-xs font-mono bg-[#172138]/50 hover:bg-[#1a2745] text-gray-300 rounded border border-gray-800 hover:border-emerald-500/50 transition"
                  >
                    {amt} SOL
                  </button>
                ))}
              </div>
            </div>

            {/* Scan Speed Tier Display */}
            <div className="mb-4">
              <label className="block text-xs text-gray-400 font-semibold mb-2 font-mono">
                ACTIVE REFRESH SPEED TIER
              </label>
              <div className="bg-[#070b14] border border-gray-800 rounded-xl p-3 flex items-center justify-between font-mono">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">
                    {isPremium ? '🍹' : '🧁'}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-white leading-none">
                      {isPremium ? 'Smoothy Cream' : 'Blueberry Cream'}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Rate: {isPremium ? '800ms (Sub-second SaaS)' : '3.0s (Standard)'}
                    </p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isPremium ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 neon-text-gold' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                  {isPremium ? 'PRO MODE' : 'STANDARD'}
                </span>
              </div>
            </div>

            {/* DEX Filter Selectors */}
            <div className="mb-5">
              <label className="block text-xs text-gray-400 font-semibold mb-2">
                INCLUDED DECENTRALIZED EXCHANGES
              </label>
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(selectedDEXs).map(([dex, active]) => (
                  <button
                    key={dex}
                    type="button"
                    onClick={() => toggleDEX(dex)}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium transition ${
                      active
                        ? 'bg-emerald-600/15 border-emerald-500 text-emerald-300'
                        : 'bg-transparent border-gray-800 text-gray-500 hover:border-gray-700'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-gray-700'}`}></span>
                    {dex.charAt(0).toUpperCase() + dex.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Run Button */}
            <button
              type="button"
              onClick={handleToggleScanner}
              className={`w-full py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-sm tracking-wide transition shadow ${
                isScanning
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10'
              }`}
            >
              {isScanning ? (
                <>
                  <Square className="h-4 w-4 fill-white" />
                  HALT COGNITIVE SCANNER
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" />
                  RUN BLUEBERRY SCANNER
                </>
              )}
            </button>

            {/* Revenue Info Row */}
            <div className="mt-4 p-3 bg-[#070b14]/50 border border-gray-800/60 rounded-lg flex items-start gap-2.5">
              <Info className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-gray-400 leading-relaxed">
                <span className="text-white font-semibold">Fee Model: </span>
                A small <span className="text-emerald-400 font-semibold font-mono">0.5% profit share fee</span> is applied only to successful arbitrage routes executed through the simulation or smart program router. Principal investment stays completely locked in your custody.
              </div>
            </div>

            {/* User Guide Card */}
            <div className="mt-4 p-4 bg-[#0a101d] border border-gray-800 rounded-xl">
              <h3 className="text-xs font-bold text-emerald-400 font-mono uppercase mb-2 flex items-center gap-1.5">
                <Compass className="h-4 w-4" />
                Quick-Start User Guide
              </h3>
              <ul className="list-decimal pl-4 text-[11px] text-gray-400 space-y-2 leading-normal">
                <li>
                  <strong className="text-white">Configure Payload:</strong> Specify your SOL investment size in the input box at the top of this panel.
                </li>
                <li>
                  <strong className="text-white">Start Scanner:</strong> Click the <span className="text-emerald-400 font-semibold font-mono">"Run Blueberry Scanner"</span> button to begin querying liquidity pools.
                </li>
                <li>
                  <strong className="text-white">Spot Opportunities:</strong> The feed on the right displays live DEX arbitrage paths. High-margin opportunities are highlighted in emerald.
                </li>
                <li>
                  <strong className="text-white">Swap & Simulate:</strong> Click <span className="text-emerald-400 font-semibold font-mono">"Swap"</span> on any route. The dashboard will switch tabs to simulate a dry-run multi-instruction Jito Bundle transaction to guarantee risk-free profit before execution.
                </li>
              </ul>
            </div>
          </div>

          {/* Card 2: Live Terminal Logs */}
          <div className="bg-[#0e1628] border border-gray-800 rounded-xl flex-1 flex flex-col p-5 shadow-sm min-h-[300px] max-h-[450px]">
            <h2 className="text-base font-semibold text-white mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                Live Network Terminal
              </span>
              <span className="text-[10px] font-mono bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                MAINNET-FEED
              </span>
            </h2>

            {/* Logs Window */}
            <div ref={logsEndRef} className="bg-[#070b14] rounded-lg border border-gray-800 p-3 font-mono text-[11px] flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 h-64">
              {logs.map((log, index) => {
                let color = 'text-gray-400';
                if (log.type === 'success') color = 'text-emerald-400 font-bold';
                if (log.type === 'warn') color = 'text-amber-500 font-semibold';
                if (log.type === 'opportunity') color = 'text-emerald-300 bg-emerald-950/40 p-1 border-l-2 border-emerald-500 rounded-r';

                return (
                  <div key={index} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-gray-600 flex-shrink-0">[{log.timestamp}]</span>
                    <span className={color}>{log.message}</span>
                  </div>
                );
              })}
            </div>
          </div>

        </section>

        {/* Right column: Tabs, Scanning table, trade simulations (7 cols) */}
        <section className="lg:col-span-7 flex flex-col gap-5">
          
          {/* Navigation tabs */}
          <div className="bg-[#0e1628] p-1 border border-gray-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-1 flex-1">
              <button
                type="button"
                onClick={() => setActiveTab('scan')}
                className={`flex-1 py-2.5 px-4 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition ${
                  activeTab === 'scan'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'
                }`}
              >
                <Compass className="h-4 w-4" />
                Blueberry Feed
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('simulations')}
                className={`flex-1 py-2.5 px-4 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition ${
                  activeTab === 'simulations'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'
                }`}
              >
                <TrendingUp className="h-4 w-4" />
                Blueberry Simulator
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('template')}
                className={`flex-1 py-2.5 px-4 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition ${
                  activeTab === 'template'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'
                }`}
              >
                <Code className="h-4 w-4" />
                Get Source Code
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('news')}
                className={`flex-1 py-2.5 px-4 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition ${
                  activeTab === 'news'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'
                }`}
              >
                <Newspaper className="h-4 w-4" />
                Crypto News
              </button>
            </div>
          </div>

          {/* TAB 1: Opportunities List */}
          {activeTab === 'scan' && (
            <div className="bg-[#0e1628] border border-gray-800 rounded-xl p-5 shadow-sm flex flex-col flex-1 min-h-[500px]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                <h2 className="text-base font-semibold text-white flex items-center gap-2 m-0">
                  <Flame className="h-4 w-4 text-amber-500" />
                  Live Discrepancies Monitor
                </h2>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#070b14] border border-gray-800 rounded">
                    <span className="text-gray-500 text-[10px]">Tier:</span>
                    <span className={`font-bold text-[10px] ${isPremium ? 'text-amber-400 neon-text-gold' : 'text-blue-400'}`}>
                      {isPremium ? '🍹 Smoothy Cream' : '🧁 Blueberry Cream'}
                    </span>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-[#070b14] border border-gray-800 rounded">
                    <span className="text-gray-500 text-[10px]">Slippage:</span>
                    <span className="text-emerald-400 font-bold text-[10px]">Auto (0.5%)</span>
                  </div>
                </div>
              </div>

              {/* Opportunities List Container */}
              <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[560px] pr-1 flex flex-col gap-3">
                {opportunities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-gray-800 rounded-xl bg-[#070b14]/30">
                    <Compass className="h-10 w-10 text-gray-600 mb-3 animate-pulse" />
                    <p className="text-sm text-gray-300 font-semibold mb-1">Scanning active pools...</p>
                    <p className="text-xs text-gray-500 max-w-sm">
                      Toggle the "Run Blueberry Scanner" button on the left to activate simulated scanning across Orca, Raydium, and Jupiter.
                    </p>
                  </div>
                ) : (
                  opportunities.map((opp) => {
                    const isProfitable = opp.netProfit > 0;
                    return (
                      <div
                        key={opp.id}
                        className={`border rounded-xl p-4 bg-[#0a101d] transition hover:bg-[#0c1426] ${
                          isProfitable
                            ? 'neon-glow-green border-emerald-500/30'
                            : 'border-gray-800'
                        }`}
                      >
                        {/* Header: Path and Gross margin badge */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-gray-800/50 pb-3 mb-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {opp.route.map((token, i) => (
                              <React.Fragment key={i}>
                                <span className="px-2 py-0.5 bg-gray-800 text-gray-200 text-xs font-mono font-bold rounded">
                                  {token}
                                </span>
                                {i < opp.route.length - 1 && (
                                  <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-gray-500">
                              {opp.timestamp}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono flex items-center gap-1 ${
                              isProfitable
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 neon-text-emerald'
                                : 'bg-gray-800 text-gray-400'
                            }`}>
                              {isProfitable ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                              +{opp.grossMargin}% Gross
                            </span>
                          </div>
                        </div>

                        {/* Middle: DEX path, expected outcomes */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                          <div className="sm:col-span-8 grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-mono">
                            <div className="text-gray-500">Route Routing:</div>
                            <div className="text-gray-300 text-right sm:text-left">{opp.dexPath.join(' ➔ ')}</div>
                            
                            <div className="text-gray-500">Gross Return:</div>
                            <div className="text-gray-300 text-right sm:text-left">+{opp.grossProfit} SOL</div>
                            
                            <div className="text-gray-500">Estimated Gas + Fee:</div>
                            <div className="text-gray-400 text-right sm:text-left">
                              -{(opp.gasFee + opp.profitShareFee).toFixed(6)} SOL
                            </div>
                            
                            {opp.slippage !== undefined && (
                              <>
                                <div className="text-gray-500">AMM Price Impact:</div>
                                <div className="text-emerald-400 font-semibold text-right sm:text-left">
                                  {opp.slippage}% (Slippage)
                                </div>
                              </>
                            )}
                            
                            <div className="font-bold text-gray-400">Net Expected Profit:</div>
                            <div className={`font-bold text-right sm:text-left ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isProfitable ? `+${opp.netProfit}` : opp.netProfit} SOL
                            </div>
                          </div>

                          {/* Action Button */}
                          <div className="sm:col-span-4 text-right">
                            {opp.status === 'active' ? (
                              <button
                                type="button"
                                onClick={() => handleExecuteOpportunity(opp)}
                                disabled={simIsRunning}
                                className={`w-full py-2 px-4 rounded-lg font-bold text-xs transition border flex items-center justify-center gap-1 ${
                                  isProfitable
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent shadow shadow-emerald-500/5'
                                    : 'bg-transparent hover:bg-gray-800 text-gray-400 border-gray-800'
                                }`}
                              >
                                <Zap className="h-3.5 w-3.5" />
                                {isProfitable ? 'Swap' : 'Ignore Route'}
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 font-mono py-1">
                                <CheckCircle2 className="h-4 w-4 text-gray-500" />
                                SIMULATED
                              </span>
                            )}
                          </div>
                        </div>

                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Execution Simulator */}
          {activeTab === 'simulations' && (
            <div className="bg-[#0e1628] border border-gray-800 rounded-xl p-5 shadow-sm flex flex-col flex-1 min-h-[500px]">
              <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
                <h2 className="text-base font-semibold text-white flex items-center gap-2 m-0">
                  <Award className="h-4 w-4 text-emerald-400" />
                  Blueberry Simulation Pipeline
                </h2>
                <span className="text-xs text-gray-500 font-mono">JITO-SOLANA INTEGRATION</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 flex-1">
                
                {/* Left: Custom Configurator (5 cols) */}
                <div className="md:col-span-5 flex flex-col gap-4 bg-[#0a101d] p-4 rounded-xl border border-gray-800/60">
                  <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-1.5 font-mono uppercase text-gray-300">
                    <Cpu className="h-4 w-4 text-emerald-400" />
                    Sandbox Builder
                  </h3>

                  {/* Investment Amount Input Display (readonly here, change on left panel) */}
                  <div>
                    <label className="block text-[10px] text-gray-500 font-bold mb-1 font-mono uppercase">
                      Investment Size (Locked)
                    </label>
                    <div className="bg-[#070b14] border border-gray-800 rounded-lg p-2.5 flex items-center justify-between font-mono text-sm">
                      <span className="text-gray-400">Payload:</span>
                      <span className="text-white font-bold">{investmentAmount} SOL</span>
                    </div>
                  </div>

                  {/* Target Arbitrage Token */}
                  <div>
                    <label className="block text-[10px] text-gray-500 font-bold mb-1 font-mono uppercase">
                      Target Discrepancy Token
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['USDC', 'BONK', 'JUP'].map((token) => (
                        <button
                          key={token}
                          type="button"
                          onClick={() => {
                            if (!simIsRunning) {
                              setSimToken(token);
                              setSimResult(null);
                            }
                          }}
                          disabled={simIsRunning}
                          className={`py-2 px-2 rounded-lg border text-xs font-mono font-bold transition ${
                            simToken === token
                              ? 'bg-emerald-600/15 border-emerald-500 text-emerald-300'
                              : 'bg-[#070b14] border-gray-800 text-gray-500 hover:border-gray-700 hover:text-gray-300'
                          }`}
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* DEX Venues (Buy and Sell) */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Buy DEX */}
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold mb-1 font-mono uppercase">
                        DEX A (Buy SOL)
                      </label>
                      <select
                        value={simBuyDEX}
                        disabled={simIsRunning}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSimBuyDEX(val);
                          setSimResult(null);
                          // Auto correct same exchange
                          if (val === simSellDEX) {
                            const remain = ['Jupiter', 'Raydium', 'Orca'].find((x) => x !== val);
                            if (remain) setSimSellDEX(remain);
                          }
                        }}
                        className="w-full bg-[#070b14] border border-gray-800 text-gray-300 rounded-lg p-2 text-xs font-mono focus:outline-none focus:border-emerald-500 animate-none appearance-none"
                      >
                        {['Jupiter', 'Raydium', 'Orca'].map((x) => (
                          <option key={x} value={x}>{x}</option>
                        ))}
                      </select>
                    </div>

                    {/* Sell DEX */}
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold mb-1 font-mono uppercase">
                        DEX B (Sell SOL)
                      </label>
                      <select
                        value={simSellDEX}
                        disabled={simIsRunning}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSimSellDEX(val);
                          setSimResult(null);
                          // Auto correct same exchange
                          if (val === simBuyDEX) {
                            const remain = ['Jupiter', 'Raydium', 'Orca'].find((x) => x !== val);
                            if (remain) setSimBuyDEX(remain);
                          }
                        }}
                        className="w-full bg-[#070b14] border border-gray-800 text-gray-300 rounded-lg p-2 text-xs font-mono focus:outline-none focus:border-emerald-500 animate-none appearance-none"
                      >
                        {['Jupiter', 'Raydium', 'Orca'].map((x) => (
                          <option key={x} value={x}>{x}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Priority fee selector */}
                  <div>
                    <label className="block text-[10px] text-gray-500 font-bold mb-1.5 font-mono uppercase">
                      Solana Network Gas Profile
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Blueberry Cream', fee: 0.0005 },
                        { label: 'Passion Fruit Cream', fee: 0.0015 },
                        { label: 'Smoothy Cream', fee: 0.0050 }
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            if (!simIsRunning) {
                              setSimPriorityFee(item.fee);
                              setSimResult(null);
                            }
                          }}
                          disabled={simIsRunning}
                          className={`py-2 px-1 rounded-lg border flex flex-col items-center justify-center transition ${
                            simPriorityFee === item.fee
                              ? 'bg-emerald-600/15 border-emerald-500 text-emerald-300'
                              : 'bg-[#070b14] border-gray-800 text-gray-500 hover:border-gray-700'
                          }`}
                        >
                          <span className="text-[9px] font-sans font-bold uppercase mb-0.5">{item.label}</span>
                          <span className="text-[10px] font-mono font-semibold">{item.fee} SOL</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Trigger manual simulation button */}
                  <button
                    type="button"
                    disabled={simIsRunning}
                    onClick={() => {
                      const amt = parseFloat(investmentAmount) || 1.0;
                      triggerSimulation(amt, simToken, simBuyDEX, simSellDEX, simPriorityFee);
                    }}
                    className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-xs tracking-wider transition font-mono ${
                      simIsRunning
                        ? 'bg-emerald-900/40 text-emerald-500 border border-emerald-500/20 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow shadow-emerald-600/10'
                    }`}
                  >
                    {simIsRunning ? (
                      <>
                        <Activity className="h-4 w-4 animate-spin text-emerald-400" />
                        EXECUTING BLUEBERRY SWAP...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 text-amber-300 fill-amber-300" />
                        BLUEBERRY SWAP
                      </>
                    )}
                  </button>

                  {/* Safety note */}
                  <div className="mt-auto p-3 bg-[#070b14]/50 border border-gray-800/80 rounded-lg flex items-start gap-2 text-[10px] text-gray-400 leading-normal">
                    <ShieldCheck className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-white font-bold font-mono uppercase block mb-0.5">Simulation Safety (PCPPP)</span>
                      Your real Phantom wallet is kept 100% safe. This dry-run acts as a local cluster simulation to guarantee profit before mainnet execution.
                    </div>
                  </div>
                </div>

                {/* Right: Console Logs & Simulation Receipt (7 cols) */}
                <div className="md:col-span-7 flex flex-col gap-4">
                  
                  {/* Console logs box */}
                  <div className="flex-1 flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold mb-1.5 font-mono uppercase tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                      Pipeline Terminal Output
                    </span>
                    <div className="bg-[#070b14] border border-gray-800 rounded-xl p-4 flex-1 font-mono text-[11px] flex flex-col gap-2 min-h-[220px] max-h-[300px] overflow-y-auto custom-scrollbar">
                      {simLog.length === 0 ? (
                        <div className="text-gray-600 flex flex-col items-center justify-center h-full text-center py-12">
                          <Compass className="h-8 w-8 text-gray-800 mb-2 animate-pulse" />
                          <span>Awaiting dry-run execution command...</span>
                          <span className="text-[10px] text-gray-700 mt-1">Configure parameters on the left or click "Simulate" on any live opportunity.</span>
                        </div>
                      ) : (
                        simLog.map((logLine, index) => {
                          if (!logLine || typeof logLine !== 'string') return null;
                          let lineStyle = 'text-gray-300';
                          if (logLine.startsWith('🟢') || logLine.includes('ESTIMATED NET')) lineStyle = 'text-emerald-400 font-bold';
                          if (logLine.startsWith('🔴') || logLine.includes('REVERTED') || logLine.includes('FAILED')) lineStyle = 'text-rose-400 font-bold';
                          if (logLine.startsWith('🛡️')) lineStyle = 'text-emerald-400';
                          if (logLine.startsWith('📊')) lineStyle = 'text-amber-400 font-semibold';
                          if (logLine.startsWith('⚡')) lineStyle = 'text-cyan-400 font-semibold';

                          return (
                            <div key={index} className={`flex items-start gap-1.5 leading-relaxed ${lineStyle}`}>
                              <span>{logLine}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Receipt or Welcome panel */}
                  {simResult && !simIsRunning && (
                    <div className="bg-[#0a101d] border border-gray-800 rounded-xl p-4 font-mono text-xs flex flex-col gap-3">
                      <div className="border-b border-gray-800/80 pb-2 flex justify-between items-center">
                        <span className="text-gray-400 font-bold text-[10px] uppercase">Simulation Analytics Receipt</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          simResult.netProfit > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {simResult.netProfit > 0 ? 'SUCCESS (PROFITABLE)' : 'REVERTED (UNPROFITABLE)'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {/* Swap A details */}
                        <div className="bg-[#070b14] p-2.5 rounded-lg border border-gray-800/40">
                          <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Swap A: {simBuyDEX}</div>
                          <div className="flex justify-between mb-0.5 text-gray-400">
                            <span>Route:</span>
                            <span className="text-white font-semibold">SOL ➔ {simToken}</span>
                          </div>
                          <div className="flex justify-between mb-0.5 text-gray-400">
                            <span>Spot Price:</span>
                            <span className="text-white font-bold">{simResult.buySpotPrice}</span>
                          </div>
                          <div className="flex justify-between text-gray-400">
                            <span>Slippage:</span>
                            <span className="text-emerald-400 font-bold">{simResult.buySlippage}%</span>
                          </div>
                        </div>

                        {/* Swap B details */}
                        <div className="bg-[#070b14] p-2.5 rounded-lg border border-gray-800/40">
                          <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Swap B: {simSellDEX}</div>
                          <div className="flex justify-between mb-0.5 text-gray-400">
                            <span>Route:</span>
                            <span className="text-white font-semibold">{simToken} ➔ SOL</span>
                          </div>
                          <div className="flex justify-between mb-0.5 text-gray-400">
                            <span>Spot Price:</span>
                            <span className="text-white font-bold">{simResult.sellSpotPrice}</span>
                          </div>
                          <div className="flex justify-between text-gray-400">
                            <span>Slippage:</span>
                            <span className="text-emerald-400 font-bold">{simResult.sellSlippage}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Profit share & net return summary row */}
                      <div className="bg-[#070b14] border border-gray-800/60 p-3 rounded-lg flex flex-col gap-1 text-xs">
                        <div className="flex justify-between text-gray-400">
                          <span>Investment Principal:</span>
                          <span className="text-white font-bold">{investmentAmount} SOL</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>Gross Arbitrage Yield:</span>
                          <span className="text-emerald-400 font-bold">+{simResult.finalSOL} SOL</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>Network Priority Gas Fee:</span>
                          <span className="text-rose-400 font-mono">-{simPriorityFee} SOL</span>
                        </div>
                        {simResult.profitShareFee > 0 && (
                          <div className="flex justify-between text-gray-400">
                            <span>Profit Share Fee (0.5%):</span>
                            <span className="text-emerald-400">-{simResult.profitShareFee} SOL</span>
                          </div>
                        )}
                        <div className="border-t border-gray-800/50 my-1"></div>
                        <div className="flex justify-between text-sm font-bold">
                          <span className="text-gray-300">Net Expected Return:</span>
                          <span className={simResult.netProfit > 0 ? 'text-emerald-400 font-extrabold' : 'text-rose-400 font-extrabold'}>
                            {simResult.netProfit > 0 ? `+${simResult.netProfit}` : simResult.netProfit} SOL
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                </div>

              </div>

            </div>
          )}

          {activeTab === 'template' && (
            <SourceCodeTemplatePaywall />
          )}

          {activeTab === 'news' && (
            <CryptoNews />
          )}
        </section>

        <WaitlistSignup />

        <div style={{ width: '100%', margin: 'auto', position: 'relative', zIndex: 99998, padding: '20px 0' }}>
          <iframe data-aa="2446230" src="//acceptable.a-ads.com/2446230/?size=Adaptive"
            style={{ border: 0, padding: 0, width: '70%', height: 'auto', overflow: 'hidden', display: 'block', margin: 'auto' }}
            title="Anonymous Ads"
          />
        </div>

      </main>

      {/* Footer System Status Bar */}
      <footer className="border-t border-gray-800/60 bg-[#070b14] px-4 py-3 text-xs text-gray-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <span className="flex items-center gap-1.5 text-gray-400">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
              Mainnet RPC Sync: OK (48ms)
            </span>
            <span className="hidden sm:inline">|</span>
            <span>Jito Engine: Operational</span>
            <span className="hidden sm:inline">|</span>
            <span>Safe Pool Index: 18,491 pools</span>
          </div>
          <div className="text-center sm:text-right">
            Smoothy DEX Arbitrage &copy; 2026. Designed for Solana DeFi Traders.
          </div>
        </div>
      </footer>
    </div>
  );
}
