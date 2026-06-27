import { Keypair } from "@solana/web3.js"
import bs58 from "bs58"
import bip39 from "bip39"
import { derivePath } from "ed25519-hd-key"

export function generateMnemonic() {
  return bip39.generateMnemonic()
}

export function validateMnemonic(mnemonic: string) {
  return bip39.validateMnemonic(mnemonic)
}

export function deriveSolanaWallet(mnemonic: string, accountIndex = 0) {
  if (!validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic")
  }

  const seed = bip39.mnemonicToSeedSync(mnemonic)
  const hexSeed = seed.toString("hex")

  const derivationPath = `m/44'/501'/${accountIndex}/0'`

  const deriveSeed = derivePath(derivationPath, hexSeed).key

  const keyPair = Keypair.fromSeed(deriveSeed)
  return {
    publicKey: keyPair.publicKey.toBase58(),
    privateKey: bs58.encode(keyPair.secretKey),
    derivationPath
  }
}

export function importSolanaKeyPair(privateKey: string) {
  const keyPair = Keypair.fromSecretKey(bs58.decode(privateKey))

  return {
    privateKey,
    publicKey: keyPair.publicKey.toBase58()
  }
}
