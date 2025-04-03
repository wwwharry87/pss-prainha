// routes/cargos.js
const express = require('express');
const router = express.Router();
const Cargo = require('../models/Cargo');
const CargoRegiao = require('../models/CargoRegiao');

router.get('/', async (req, res) => {
  try {
    const { zona } = req.query;
    if (!zona) {
      return res.status(400).json({ success: false, message: "Parâmetro 'zona' é obrigatório." });
    }
    const cargos = await Cargo.findAll({
      include: [{
        model: CargoRegiao,
        as: 'regioes',
        where: { zona },
        required: true
      }],
      order: [['nome', 'ASC'], ['nivel', 'ASC']]
    });
    res.json({ success: true, data: cargos });
  } catch (error) {
    console.error("Erro ao buscar cargos:", error);
    res.status(500).json({ success: false, message: "Erro interno ao processar a requisição.", error: error.message });
  }
});

module.exports = router;
