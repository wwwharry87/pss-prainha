// routes/auth.js
const express = require('express');
const router = express.Router();
const Candidato = require('../models/Candidato');
const bcrypt = require('bcryptjs');

// Rota para autenticação de candidatos
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

// routes/auth.js - Rota para verificação de dados de recuperação de senha
router.post('/verificar-dados-recuperacao', async (req, res) => {
  try {
    const { cpf, rg, nome, dataNascimento, celular } = req.body;
    
    // Remove caracteres não numéricos do CPF e celular
    const cpfLimpo = cpf.replace(/\D/g, '');
    const celularLimpo = celular.replace(/\D/g, '');
    
    const candidato = await Candidato.findOne({ where: { cpf: cpfLimpo } });
    if (!candidato) {
      return res.status(404).json({ success: false, message: "Candidato não encontrado." });
    }
    
    // Converte a data de nascimento recebida ("DD/MM/AAAA") para o formato "AAAA-MM-DD"
    const dataNascimentoFormatada = dataNascimento.split('/').reverse().join('-');
    // Extrai a parte da data do candidato (se armazenado em formato ISO)
    const dataCandidatoFormatada = candidato.data_nascimento.split('T')[0];
    
    const dadosCorretos = (
      candidato.rg.trim().toUpperCase() === rg.trim().toUpperCase() &&
      candidato.nome.trim().toUpperCase() === nome.trim().toUpperCase() &&
      dataCandidatoFormatada === dataNascimentoFormatada &&
      candidato.celular.replace(/\D/g, '') === celularLimpo
    );
    
    if (!dadosCorretos) {
      return res.status(400).json({ success: false, message: "Dados não correspondem. Verifique as informações." });
    }
    
    res.json({ success: true, message: "Dados verificados com sucesso." });
  } catch (error) {
    console.error("Erro na verificação:", error);
    res.status(500).json({ success: false, message: "Erro interno no servidor." });
  }
});


// Rota para redefinir senha
router.post('/redefinir-senha', async (req, res) => {
  try {
    const { cpf, novaSenha } = req.body;
    
    const candidato = await Candidato.findOne({ where: { cpf } });
    if (!candidato) {
      return res.status(404).json({ success: false, message: "Candidato não encontrado." });
    }
    
    // Criptografa a nova senha
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(novaSenha, salt);
    
    // Atualiza a senha no banco de dados
    await candidato.update({ senha: senhaHash });
    
    res.json({ success: true, message: "Senha redefinida com sucesso." });
  } catch (error) {
    console.error("Erro na redefinição:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Rota para autenticação administrativa
router.post('/admin', async (req, res) => {
  try {
    const { usuario, senha } = req.body;
    const adminUser = "admin";
    const adminSenha = process.env.ADMIN_SENHA || "@dmin183";
    if (usuario === adminUser && senha === adminSenha) {
      res.json({ success: true, message: "Acesso administrativo concedido." });
    } else {
      res.status(400).json({ success: false, message: "Usuário ou senha incorretos." });
    }
  } catch (error) {
    console.error("Erro no login administrativo:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;