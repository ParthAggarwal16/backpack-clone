import express from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt"

const prisma = new PrismaClient()

const app = express()

app.use(express.json())

let vaultUnlocked = false

app.post("/vault/create", async (req, res) => {
  try {
    const { password } = req.body

    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "Password required" })
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: "Invalid password length" })
    }

    const existingVault = await prisma.vault.findFirst();
    if (existingVault) {
      return res.status(409).json({
        error: "Vault already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

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
      "exists": true,
      "unlocked": false
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
    const { password } = req.body
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

app.listen(3000, () => {
  console.log("Server started on http://localhost:3000")
});
