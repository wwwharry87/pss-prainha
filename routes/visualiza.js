// routes/visualiza.js
const express = require('express');
const router = express.Router();
const Candidato = require('../models/Candidato');
const Inscricao = require('../models/Inscricao');
const Cargo = require('../models/Cargo');

router.get('/:cpf', async (req, res) => {
  try {
    const { cpf } = req.params;
    
    // Procura o candidato pelo CPF
    const candidato = await Candidato.findOne({ where: { cpf } });
    if (!candidato) {
      return res.status(404).json({ message: 'Candidato não encontrado.' });
    }
    
    // Busca todas as inscrições do candidato e inclui nome e nível do cargo
    const inscricoes = await Inscricao.findAll({
      where: { candidato_id: candidato.id },
      include: [
        {
          model: Cargo,
          attributes: ['nome', 'nivel'] // <-- Importante incluir também "nivel"
        }
      ],
      order: [['createdAt', 'ASC']] // Ordena pela data de criação (1ª inscrição primeiro)
    });
    
    res.json({ candidato, inscricoes });
  } catch (error) {
    console.error("Erro na visualização:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
