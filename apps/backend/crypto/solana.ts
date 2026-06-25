import { Keypair } from "@solana/web3.js"
import bs58 from "bs58"
import bip39 from "bip39"

export function generateSolanaKeypair() {
  const keypair = Keypair.generate()

  return {
    publicKey: keypair.publicKey.toBase58(),
    privateKey: bs58.encode(keypair.secretKey)
  }
}

export function importSolanaPrivateKey(privateKey: string) {
  const keypair = Keypair.fromSecretKey(bs58.decode(privateKey))
  return {
    publicKey: keypair.publicKey.toBase58(),
    privateKey
  }
}

