// routes/admin.js
const express = require('express');
const router = express.Router();
const ValidacaoInscricao = require('../models/ValidacaoInscricao');
const Inscricao = require('../models/Inscricao');

// Endpoint para registrar ou atualizar a validação de uma inscrição
router.post('/verificar-inscricao/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Espera receber do frontend:
    // { status, validacoes (objeto JSON), observacoes, pontuacao }
    const { status, validacoes, observacoes, pontuacao } = req.body;

    // Verifica se a inscrição existe (opcional, mas recomendado)
    const inscricao = await Inscricao.findByPk(id);
    if (!inscricao) {
      return res.status(404).json({ success: false, message: 'Inscrição não encontrada.' });
    }

    // Cria ou atualiza (upsert) o registro de validação para essa inscrição
    await ValidacaoInscricao.upsert({
      inscricao_id: id,
      validacoes,
      observacoes,
      status,
      pontuacao
    });
    
    return res.json({ success: true, message: 'Validação registrada com sucesso.' });
  } catch (error) {
    console.error("Erro na validação:", error);
    return res.status(500).json({ success: false, message: 'Erro interno.' });
  }
});

module.exports = router;
