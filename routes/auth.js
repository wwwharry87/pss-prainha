// routes/auth.js
const express = require('express');
const router = express.Router();
const Candidato = require('../models/Candidato');
const bcrypt = require('bcrypt');

router.post('/', async (req, res) => {
  try {
    let { cpf, senha } = req.body;
    cpf = cpf.replace(/\D/g, '');
    const candidato = await Candidato.findOne({ where: { cpf } });
    if (!candidato) {
      return res.status(404).json({ success: false, message: "Candidato não encontrado." });
    }
    const isValid = await bcrypt.compare(senha, candidato.senha);
    if (!isValid) {
      return res.status(400).json({ success: false, message: "CPF ou senha incorretos." });
    }
    res.json({ success: true, message: "Login realizado com sucesso.", candidato });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
