import express from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt"

const prisma = new PrismaClient()

const app = express()

app.use(express.json())

app.post('/vault/create', async (req, res) => {
  const { password } = req.body

  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "Password required" })
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Invalid Password Length" })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const vault = await prisma.vault.create({
    data: {
      passwordHash
    }
  })
  return res.status(201).json({
    vaultId: vault.id,
    message: "Vault Created"
  })
})

app.listen(3000);
