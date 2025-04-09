// routes/candidatos.js
const express = require('express');
const router = express.Router();
const Candidato = require('../models/Candidato');
const bcrypt = require('bcryptjs');
const { handleUploadCandidatos } = require('../middleware/upload');

// Endpoint para verificar se o CPF já está cadastrado
router.get('/check', async (req, res) => {
  try {
    let { cpf } = req.query;
    if (!cpf) {
      return res.status(400).json({ error: 'CPF é obrigatório.' });
    }
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

// Endpoint para cadastro de novo candidato
router.post('/create', handleUploadCandidatos, async (req, res) => {
  try {
    let { cpf, rg, orgao_expedidor, nome, data_nascimento, sexo, email, celular, cep, logradouro, bairro, numero, complemento, estado, municipio, pcd, senha } = req.body;
    cpf = cpf.replace(/\D/g, '');
    const existente = await Candidato.findOne({ where: { cpf } });
    if (existente) {
      return res.status(400).json({ error: 'CPF já cadastrado.' });
    }
    const hashedSenha = await bcrypt.hash(senha, 10);
    let laudoFilename = null;
    if (req.files && req.files.laudo && req.files.laudo.length > 0) {
      laudoFilename = req.files.laudo[0].filename;
    }
    const novoCandidato = await Candidato.create({
      cpf,
      rg,
      orgao_expedidor: orgao_expedidor.toUpperCase(),
      nome: nome.toUpperCase(),
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

// ====================================================================
// ENDPOINTS PARA RECUPERAÇÃO DE SENHA
// ====================================================================

// 1. Verificação dos dados do candidato para recuperação de senha
router.post('/recover/verify', async (req, res) => {
  try {
    let { cpf, rg, nome, data_nascimento, celular } = req.body;
    if (!cpf || !rg || !nome || !data_nascimento || !celular) {
      return res.status(400).json({ error: "Todos os campos são obrigatórios." });
    }
    cpf = cpf.replace(/\D/g, '');
    const candidato = await Candidato.findOne({ where: { cpf } });
    if (!candidato) {
      return res.status(404).json({ error: "Candidato não encontrado." });
    }
    // Verifica RG
    if (candidato.rg !== rg) {
      return res.status(400).json({ error: "RG não confere." });
    }
    // Verifica Nome (convertendo para uppercase)
    if (candidato.nome.toUpperCase() !== nome.toUpperCase()) {
      return res.status(400).json({ error: "Nome não confere." });
    }
    // Converte data de nascimento do formato DD/MM/AAAA para YYYY-MM-DD
    const parts = data_nascimento.split('/');
    if (parts.length !== 3) {
      return res.status(400).json({ error: "Data de nascimento em formato inválido." });
    }
    const inputDataNascimento = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    if (candidato.data_nascimento !== inputDataNascimento) {
      return res.status(400).json({ error: "Data de nascimento não confere." });
    }
    // Verifica celular (remove formatação para comparar)
    const inputCelular = celular.replace(/\D/g, '');
    const storedCelular = candidato.celular.replace(/\D/g, '');
    if (storedCelular !== inputCelular) {
      return res.status(400).json({ error: "Celular não confere." });
    }
    return res.json({ success: true, message: "Dados confirmados." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Atualização da senha após verificação dos dados
router.post('/recover/update', async (req, res) => {
  try {
    let { cpf, novaSenha } = req.body;
    if (!cpf || !novaSenha) {
      return res.status(400).json({ error: "CPF e nova senha são obrigatórios." });
    }
    cpf = cpf.replace(/\D/g, '');
    const candidato = await Candidato.findOne({ where: { cpf } });
    if (!candidato) {
      return res.status(404).json({ error: "Candidato não encontrado." });
    }
    const hashedSenha = await bcrypt.hash(novaSenha, 10);
    await candidato.update({ senha: hashedSenha });
    return res.json({ success: true, message: "Senha atualizada com sucesso." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
