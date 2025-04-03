// routes/candidatos.js
const express = require('express');
const router = express.Router();
const Candidato = require('../models/Candidato');
const bcrypt = require('bcrypt');
const { handleUploadCandidatos } = require('../middleware/upload');

router.get('/check', async (req, res) => {
  try {
    let { cpf } = req.query;
    if (!cpf) {
      return res.status(400).json({ error: 'CPF é obrigatório.' });
    }
    // Remove máscara do CPF
    cpf = cpf.replace(/\D/g, '');
    const existente = await Candidato.findOne({ where: { cpf } });
    if (existente) {
      return res.json({ exists: true, message: 'CPF já cadastrado.' });
    } else {
      return res.json({ exists: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/create', handleUploadCandidatos, async (req, res) => {
  try {
    let { cpf, rg, nome, data_nascimento, sexo, email, celular, cep, logradouro, bairro, numero, complemento, estado, municipio, pcd, senha } = req.body;
    cpf = cpf.replace(/\D/g, '');
    const existente = await Candidato.findOne({ where: { cpf } });
    if (existente) {
      return res.status(400).json({ error: 'CPF já cadastrado.' });
    }
    const hashedSenha = await bcrypt.hash(senha, 10);
    let laudoFilename = null;
    // Verifica se o campo "laudo" foi enviado
    if (req.files && req.files.laudo && req.files.laudo.length > 0) {
      laudoFilename = req.files.laudo[0].filename;
    }
    const novoCandidato = await Candidato.create({
      cpf,
      rg,
      nome,
      data_nascimento,
      sexo,
      email,
      celular,
      cep,
      logradouro,
      bairro,
      numero,
      complemento,
      estado,
      municipio,
      pcd: pcd === "true",
      senha: hashedSenha,
      laudo: laudoFilename
    });
    res.json({ message: 'Cadastro realizado com sucesso!', candidato: novoCandidato });
  } catch (error) {
    console.error("Erro no cadastro:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
