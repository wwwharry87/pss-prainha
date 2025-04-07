// routes/visualiza.js
const express = require('express');
const router = express.Router();
const Candidato = require('../models/Candidato');
const Inscricao = require('../models/Inscricao');
const Cargo = require('../models/Cargo');

// Rota para visualizar por CPF
router.get('/:cpf', async (req, res) => {
  try {
    const { cpf } = req.params;
    const candidato = await Candidato.findOne({ where: { cpf } });
    if (!candidato) {
      return res.status(404).json({ message: 'Candidato não encontrado.' });
    }
    const inscricoes = await Inscricao.findAll({
      where: { candidato_id: candidato.id },
      include: [
        {
          model: Cargo,
          attributes: ['nome', 'nivel']
        }
      ],
      order: [['createdAt', 'ASC']]
    });
    res.json({ candidato, inscricoes });
  } catch (error) {
    console.error("Erro na visualização:", error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para visualizar por token (caso esteja implementado)
router.get('/token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    // Lógica para buscar o candidato por token (implemente conforme sua lógica)
    const candidato = await Candidato.findOne({ where: { token } });
    if (!candidato) {
      return res.status(404).json({ message: 'Candidato não encontrado pelo token.' });
    }
    const inscricoes = await Inscricao.findAll({
      where: { candidato_id: candidato.id },
      include: [
        {
          model: Cargo,
          attributes: ['nome', 'nivel']
        }
      ],
      order: [['createdAt', 'ASC']]
    });
    res.json({ candidato, inscricoes });
  } catch (error) {
    console.error("Erro na visualização pelo token:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
