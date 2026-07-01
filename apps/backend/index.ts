import express from "express"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcrypt"
import { encryptPrivateKey, decryptPrivateKey } from "./crypto/encryption"
import { deriveSolanaWallet, importSolanaPrivateKey, generateMnemonic } from "./crypto/solana"
import { validateMnemonic } from "bip39"
import e from "express"

const prisma = new PrismaClient()

const app = express()

app.use(express.json())

let vaultUnlocked = false
let unlockedPassword: string | null = null

app.post("/vault/create", async (req, res) => {
  try {
    const { password } = req.body

    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "Password required" })
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: "Invalid password length" })
    }

    const existingVault = await prisma.vault.findFirst()
    if (existingVault) {
      return res.status(409).json({
        error: "Vault already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const vault = await prisma.vault.create({
      data: {
        passwordHash,
      },
    })
    return res.status(201).json({
      vaultId: vault.id,
      message: "Vault created",
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal server error" })
  }
})

app.get("/vault/status", async (req, res) => {
  try {
    const existingVault = await prisma.vault.findFirst();
    return res.status(200).json({
      "exists": !!existingVault,
      "unlocked": vaultUnlocked
    })
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Internal server error",
    })
  }
})

app.post("/vault/unlock", async (req, res) => {
  try {
    const { password } = req.body ?? {}
    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "Password required" })
    }
    const vault = await prisma.vault.findFirst()
    if (!vault) {
      return res.status(400).json({ error: "Vault not found" })
    }
    const isValidPassowrd = await bcrypt.compare(password, vault.passwordHash)
    if (!isValidPassowrd) {
      return res.status(401).json({ error: "InValid Password" })

    }
    vaultUnlocked = true
    unlockedPassword = password

    return res.status(200).json({
      message: "Vault unlocked"
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({
      error: "Internal Server Error"
    })
  }
})

app.post("/vault/lock", async (req, res) => {
  try {
    const vault = await prisma.vault.findFirst()
    if (!vault) {
      return res.status(400).json({ error: "Vault not found" })
    }
    if (!vaultUnlocked) {
      return res.status(400).json({ error: "Vault already locked" })
    }
    vaultUnlocked = false
    unlockedPassword = null

    return res.status(200).json({ message: "Vault locked" })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })
  }

})

app.post("/account/create", async (req, res) => {

  try {
    const vault = await prisma.vault.findFirst()
    if (!vault) {
      return res.status(404).json({ error: "Vault not found" })
    }
    if (!vaultUnlocked) {
      return res.status(401).json({ error: "Vault is locked" })
    }

    const { name } = req.body
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Account name required" })
    }

    const existingAccount = await prisma.account.findFirst({ where: { vaultId: vault.id, name } })
    if (existingAccount) {
      return res.status(409).json({ error: "Account already exists" })
    }

    const account = await prisma.account.create({
      data: {
        vaultId: vault.id,
        name
      }
    })
    return res.status(200).json({
      accountId: account.id,
      name: account.name,
      message: "Account created"
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

app.get("/accounts", async (req, res) => {
  try {
    const vault = await prisma.vault.findFirst()
    if (!vault) {
      return res.status(404).json({ error: "Vault doesnt exist" })
    }
    if (!vaultUnlocked) {
      return res.status(401).json({ error: "Vault is locked" })
    }

    const accounts = await prisma.account.findMany({
      where: { vaultId: vault.id },
      orderBy: { createdAt: "asc" }
    })

    return res.status(200).json({ accounts })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

app.get("/accounts/:id", async (req, res) => {
  try {
    if (!vaultUnlocked) {
      return res.status(401).json({ error: "Vault is locked" })
    }

    const { id } = req.params
    const account = await prisma.account.findUnique({ where: { id } })

    if (!account) {
      return res.status(404).json({ error: "Acciount not found" })
    }
    return res.status(200).json(account)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

app.delete("/accounts/:id", async (req, res) => {
  try {
    if (!vaultUnlocked) {
      return res.status(401).json({ error: "Vault is locked" })
    }

    const { id } = req.params
    const account = await prisma.account.findUnique({ where: { id } })

    if (!account) {
      return res.status(404).json({ error: "Account doesn't exist" })
    }
    await prisma.account.delete({ where: { id } })
    return res.status(200).json({ message: "Account deleted successfully" })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal server error" })
  }
})

app.post("/accounts/:id/addresses/create", async (req, res) => {
  try {
    if (!vaultUnlocked) {
      return res.status(401).json({ error: "Vault is locked" })
    }

    const { id: accountId } = req.params
    const { networkId } = req.body

    if (!networkId) {
      return res.status(400).json({ error: "Network id is required" })
    }

    const account = await prisma.account.findUnique({ where: { id: accountId }, include: { seedPhrase: true } })

    if (!account) {
      return res.status(404).json({ error: "Account not found" })
    }

    const network = await prisma.network.findUnique({ where: { id: networkId } })

    if (!network) {
      return res.status(404).json({ error: "Network not found" })
    }

    let mnemonic: string
    if (account.seedPhrase) {
      mnemonic = decryptPrivateKey(
        account.seedPhrase.encryptedMnemonic,
        unlockedPassword!
      )
    } else {
      mnemonic = generateMnemonic()

      await prisma.seedPhrase.create({ data: { accountId, encryptedMnemonic: encryptPrivateKey(mnemonic, unlockedPassword!) } })
    }

    const walletIndex = await prisma.address.count({ where: { accountId } })

    let publicKey: string
    let privateKey: string
    let derivationPath: string | null = null

    switch (network.type) {
      case "SOLANA": {
        const wallet = deriveSolanaWallet(mnemonic, walletIndex)

        publicKey = wallet.publicKey
        privateKey = wallet.privateKey
        derivationPath = wallet.derivationPath
        break
      }

      default:
        return res.status(400).json({
          error: `${network.type} not supported yet`,
        })
    }

    const encryptedKey = encryptPrivateKey(privateKey, unlockedPassword!)

    const address = await prisma.address.create({
      data: {
        publicKey,
        encryptedKey,
        derivationPath,
        accountId,
        networkId,
      },
    })

    return res.status(201).json({ message: "Address created", address })

  } catch (err) {
    console.error(err);

    return res.status(500).json({ error: "Internal Server Error" })
  }
})

app.get("/accounts/:id/addresses", async (req, res) => {
  try {
    if (!vaultUnlocked) {
      return res.status(401).json({ error: "Vault is lcoked" })
    }
    const { id: accountId } = req.params
    const account = await prisma.account.findUnique({ where: { id: accountId } })
    if (!account) {
      return res.status(400).json({ error: "Account doesn't exist" })
    }

    const addresses = await prisma.address.findMany({ where: { accountId } })

    return res.status(200).json({ addresses })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

app.get("/addresses/:id", async (req, res) => {
  try {
    if (!vaultUnlocked) {
      return res.status(401).json({ error: "Vault is locked" })
    }

    const { id } = req.params;
    const address = await prisma.address.findUnique({ where: { id } })

    if (!address) {
      return res.status(404).json({ error: "Address not found" })
    }

    return res.status(200).json(address)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

app.get("/addresses/:id/export", async (req, res) => {
  try {
    if (!vaultUnlocked || !unlockedPassword) {
      return res.status(401).json({ error: "Vault is Locked" })
    }

    const { id } = req.params
    const address = await prisma.address.findUnique({ where: { id } })
    if (!address) {
      return res.status(400).json({ error: "No Address found" })
    }

    const privateKey = decryptPrivateKey(address.encryptedKey, unlockedPassword)
    return res.status(200).json({ publicKey: address.publicKey, privateKey })
  } catch (err) {
    console.log(err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

app.post("/accounts/:id/addresses/import", async (req, res) => {
  try {
    if (!vaultUnlocked) {
      return res.status(401).json({ error: "Vault is Locked" })
    }

    const { id: accountId } = req.params

    const { networkId, privateKey, mnemonic } = req.body

    if (!networkId) {
      return res.status(400).json({ error: "Network id required" })
    }

    if (!privateKey && !mnemonic) {
      return res.status(400).json({ error: "Provide privateKey or mnemonic" })
    }

    if (privateKey && mnemonic) {
      return res.status(400).json({ error: "Provide only one import method" })
    }

    const account = await prisma.account.findUnique({ where: { id: accountId }, include: { seedPhrase: true } })

    if (!account) {
      return res.status(404).json({ error: "Account not found" })
    }

    const network = await prisma.network.findUnique({ where: { id: networkId } })

    if (!network) {
      return res.status(404).json({ error: "Network not found" })
    }

    let publicKey: string
    let encryptedKey: string
    let derivationPath: string | null = null

    if (privateKey) {
      switch (network.type) {
        case "SOLANA": {
          const wallet = importSolanaPrivateKey(privateKey)
          publicKey = wallet.publicKey
          encryptedKey = encryptPrivateKey(wallet.privateKey, unlockedPassword!)

          break
        }

        default:
          return res.status(400).json({ error: `${network.type} not supported yet` })
      }
    } else {
      if (!validateMnemonic(mnemonic)) {
        return res.status(400).json({ error: "Invalid mnemonic" })
      }

      let accountIndex = 0

      if (account.seedPhrase) {
        accountIndex = await prisma.address.count({
          where: { accountId, derivationPath: { not: null } },
        })
      } else {
        await prisma.seedPhrase.create({
          data: { accountId, encryptedMnemonic: encryptPrivateKey(mnemonic, unlockedPassword!) },
        })
      }

      switch (network.type) {
        case "SOLANA": {
          const wallet = deriveSolanaWallet(mnemonic, accountIndex)

          publicKey = wallet.publicKey
          encryptedKey = encryptPrivateKey(wallet.privateKey, unlockedPassword!)
          derivationPath = wallet.derivationPath

          break
        }

        default:
          return res.status(400).json({ error: `${network.type} not supported yet` })
      }

    }

    const existingAddress = await prisma.address.findFirst({ where: { publicKey, networkId } })

    if (existingAddress) {
      return res.status(409).json({ error: "Address already exists" })
    }

    const address = await prisma.address.create({
      data: { publicKey, encryptedKey, derivationPath, accountId, networkId }
    })

    return res.status(201).json({ message: "Address Imported", address })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

app.patch("/accounts/:id", async (req, res) => {
  try {
    if (!vaultUnlocked) {
      return res.status(401).json({ error: "Vault is locked" })
    }

    const { id } = req.params
    const { name } = req.body

    if (!name || typeof (name) !== "string") {
      return res.status(400).json({ error: "Account name required" })
    }

    const account = await prisma.account.findUnique({ where: { id } })
    if (!account) {
      return res.status(404).json({ error: "Account not found" })
    }

    const existingAccount = await prisma.account.findFirst({ where: { vaultId: account.vaultId, name, NOT: { id } } })

    if (existingAccount) {
      return res.status(409).json({ error: "Account already exists" })
    }

    const updatedAccount = await prisma.account.update({ where: { id }, data: { name } })

    return res.status(200).json({ message: "Account Updated", account: updatedAccount })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal server Error" })
  }
})

app.delete("/addresses/:id", async (req, res) => {
  try {
    if (!vaultUnlocked) {
      return res.status(401).json({ error: "Vault is Locked" })
    }

    const { id } = req.params
    const address = await prisma.address.findUnique({ where: { id } })
    if (!address) {
      return res.status(400).json({ error: "Address doesn't exist" })
    }

    await prisma.address.delete({ where: { id } })

    return res.status(200).json({ message: "Account deleted successfully" })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

app.get("/networks", async (req, res) => {
  try {
    const networks = await prisma.network.findMany({ orderBy: { name: "asc" } })
    return res.status(200).json({ networks })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

app.get("/networks/:id", async (req, res) => {

  try {
    const { id } = req.params
    const network = await prisma.network.findUnique({ where: { id } })
    if (!network) {
      return res.status(404).json({ error: "Network not found" })
    }
    return res.status(200).json(network)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })

  }

})

app.get("/networks/:id/tokens", async (req, res) => {

  try {
    const { id: networkId } = req.params

    const network = await prisma.network.findUnique({ where: { id: networkId } })

    if (!network) {
      return res.status(404).json({ error: "Network Not found" })
    }

    const tokens = await prisma.token.findMany({ where: { networkId }, orderBy: { name: "asc" } })
    return res.status(200).json({ tokens })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })
  }
})

app.get("/tokens/:id", async (req, res) => {

  try {
    const { id } = req.params
    const token = await prisma.token.findUnique({ where: { id } })
    if (!token) {
      return res.status(404).json({ error: "Token not found" })
    }

    return res.status(200).json(token)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: "Internal Server Error" })

  }
})

app.listen(3000, () => {
  console.log("Server started on http://localhost:3000")
});
