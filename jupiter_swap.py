#!/usr/bin/env python3
"""
Smoothy - Live Solana Mainnet Jupiter Swap Automation Script
Implements the full Jupiter Routing Pipeline using your premium endpoints in Python:
- RPC_URL: https://api.mainnet-beta.solana.com
- QUOTE_URL: https://api.jup.ag/swap/v1/quote
- SWAP_URL: https://api.jup.ag/swap/v2/swap (or official v6 swap generation)
- JUP_API_KEY: 15fecbfd-f16a-4d69-b4d6-0130de797456
"""

import os
import sys
import json
import base64
import requests

# 1. API Configuration Constants
RPC_URL = "https://api.mainnet-beta.solana.com"
QUOTE_URL = "https://api.jup.ag/swap/v1/quote"
SWAP_URL = "https://api.jup.ag/swap/v6/swap"  # Jupiter's official high-performance transaction builder endpoint
JUP_API_KEY = "15fecbfd-f16a-4d69-b4d6-0130de797456"

# 2. Token Mint Configurations (Solana Mainnet)
MINTS = {
    "SOL": "So11111111111111111111111111111111111111112",
    "USDC": "EPjFW3101i3vY867WSPmw48aBbz86ca24tC1Y3h75C8",
    "BONK": "DezXAZ8z7PnrnRJjz3wXupHUEgAhQAj7YJJZdRsn929",
    "JUP": "JUPyiwrYJF1mH69A9s1gU8beR89Mgh8Bq9m1YAb1Zf5"
}

def get_headers():
    """Returns headers with Jup API Key authorization."""
    return {
        "x-api-key": JUP_API_KEY.strip(),
        "Content-Type": "application/json"
    }

def fetch_quote(input_token: str, output_token: str, amount_lamports: int):
    """
    Step 1: Queries the Jupiter Quote API for the optimal routing path and price.
    """
    input_mint = MINTS.get(input_token.upper())
    output_mint = MINTS.get(output_token.upper())
    
    if not input_mint or not output_mint:
        print(f"Error: Token {input_token} or {output_token} is not supported in the mint registry.")
        return None

    params = {
        "inputMint": input_mint,
        "outputMint": output_mint,
        "amount": str(amount_lamports),
        "slippageBps": "50"  # Default 0.5% slippage
    }

    print(f"\n📡 Step 1: Querying Jupiter Quote Endpoint...")
    print(f"   URL: {QUOTE_URL}")
    print(f"   Route: {input_token} -> {output_token} ({amount_lamports} Lamports/Smallest Units)")
    
    try:
        response = requests.get(QUOTE_URL, params=params, headers=get_headers())
        if response.status_code != 200:
            print(f"   ❌ HTTP Error {response.status_code}: {response.text}")
            return None
            
        quote_data = response.json()
        print("   ✅ Quote retrieved successfully!")
        print(f"   Expected Output Amount: {quote_data.get('outAmount')}")
        print(f"   Price Impact: {quote_data.get('priceImpactPct')}%")
        return quote_data
        
    except Exception as e:
        print(f"   ❌ Network error during quote request: {e}")
        return None

def build_swap_transaction(quote_response: dict, user_public_key: str):
    """
    Step 2: Posts the retrieved route quote back to Jupiter to construct a fully serialized,
    unsigned transaction containing optimal compute budget priority fees.
    """
    if not quote_response:
        return None

    payload = {
        "quoteResponse": quote_response,
        "userPublicKey": user_public_key,
        "wrapAndUnwrapSol": True,
        "computeUnitPriceMicroLamports": 50000  # Built-in compute budget priority fee limit
    }

    print(f"\n📦 Step 2: Requesting Serialized Swap Transaction Payload...")
    print(f"   URL: {SWAP_URL}")
    
    try:
        response = requests.post(SWAP_URL, json=payload, headers=get_headers())
        if response.status_code != 200:
            print(f"   ❌ HTTP Error {response.status_code}: {response.text}")
            return None
            
        swap_data = response.json()
        print("   ✅ Serialized transaction constructed!")
        print(f"   Required Heap / Compute Limit: {swap_data.get('prioritizationFeeLamports', 0)} Lamports")
        return swap_data.get("swapTransaction")
        
    except Exception as e:
        print(f"   ❌ Network error during transaction construction: {e}")
        return None

def main():
    print("=" * 65)
    print("     SMOUTHY - SOLANA JUPITER AUTOMATION CLI (PYTHON ENGINE)     ")
    print("=" * 65)
    
    # Quick CLI arguments setup
    input_token = "SOL"
    output_token = "USDC"
    amount = 1.0  # 1 SOL
    
    # Scale SOL to lamports (1e9)
    amount_lamports = int(amount * 1_000_000_000)
    
    # Target signer address (mock/placeholder to show construction)
    user_wallet = "HqSmW6naRKm4irXNjjA73dgvwm1nAKDyUE99U52jRtxh"

    # Execute flow
    quote = fetch_quote(input_token, output_token, amount_lamports)
    
    if quote:
        serialized_tx = build_swap_transaction(quote, user_wallet)
        if serialized_tx:
            print(f"\n🚀 Step 3: Transaction Ready for Signing & Broadcast!")
            print(f"   Base64 Transaction Payload (trunc): {serialized_tx[:60]}...")
            print(f"   Target Writing RPC Node: {RPC_URL}")
            print("\n   [INFO] To broadcast on Solana mainnet:")
            print("   1. Decode the base64 transaction string.")
            print("   2. Sign with your private key using `solders` or `solana` SDK.")
            print("   3. Post to the RPC node using `sendTransaction` / `send_raw_transaction`.")
            print("=" * 65)
            print("   Status: Operational | Authenticated")
        else:
            print("\n❌ Failed to build swap transaction.")
    else:
        print("\n❌ Failed to retrieve optimal quote.")

if __name__ == "__main__":
    main()
