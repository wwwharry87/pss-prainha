// routes/inscricoes.js
const express = require('express');
const router = express.Router();
const { handleUploadInscricoes } = require('../middleware/upload');
const Inscricao = require('../models/Inscricao');
const Candidato = require('../models/Candidato');
const CargoRegiao = require('../models/CargoRegiao');

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const inscricao = await Inscricao.findByPk(id);
    if (!inscricao) {
      return res.status(404).json({ success: false, message: 'Inscrição não encontrada.' });
    }
    await inscricao.destroy();
    return res.json({ success: true, message: 'Inscrição excluída com sucesso.' });
  } catch (error) {
    console.error("Erro ao excluir inscrição:", error);
    return res.status(500).json({ success: false, message: 'Erro ao excluir inscrição.' });
  }
});

router.post('/create', handleUploadInscricoes, async (req, res) => {
  try {
    // Verifica se documento de identidade foi enviado
    if (!req.files || !req.files['doc_identidade']) {
      return res.status(400).json({
        success: false,
        message: "Documento de identidade é obrigatório"
      });
    }

    // Atualize para extrair o campo "tempo_exercicio_select" (não obrigatório)
    const { cpf, cargo_id, zona, tempo_exercicio_select } = req.body;
    
    if (!cpf || !cargo_id || !zona) {
      return res.status(400).json({ 
        success: false,
        message: "CPF, cargo e zona são obrigatórios." 
      });
    }
    
    // Se o campo de tempo de exercício não for informado, atribuímos um valor default (por exemplo, "0")
    const tempo_exercicio = tempo_exercicio_select && tempo_exercicio_select.trim() !== ""
      ? tempo_exercicio_select
      : "0";
    
    const cargoRegiao = await CargoRegiao.findOne({
      where: { cargo_id, zona }
    });
    if (!cargoRegiao) {
      return res.status(400).json({ 
        success: false,
        message: "O cargo selecionado não está disponível para a zona informada." 
      });
    }
    
    const candidato = await Candidato.findOne({ 
      where: { cpf: cpf.replace(/\D/g, '') } 
    });
    if (!candidato) {
      return res.status(404).json({ 
        success: false, 
        message: "Candidato não encontrado." 
      });
    }
    
    const inscricaoExistente = await Inscricao.findOne({
      where: {
        candidato_id: candidato.id,
        cargo_id,
        zona
      }
    });
    if (inscricaoExistente) {
      return res.status(400).json({ 
        success: false,
        message: "Você já está inscrito neste cargo na mesma zona." 
      });
    }
    
    const novaInscricao = await Inscricao.create({
      candidato_id: candidato.id,
      cargo_id,
      zona,
      tempo_exercicio, // valor default "0" se não informado
      doc_identidade_path: req.files['doc_identidade'][0].filename,
      doc_escolaridade_path: req.files['doc_escolaridade'] ? req.files['doc_escolaridade'][0].filename : null,
      doc_diploma_path: req.files['doc_diploma'] ? req.files['doc_diploma'][0].filename : null,
      doc_especifico_path: req.files['doc_especifico'] ? req.files['doc_especifico'][0].filename : null,
      doc_especializacao_path: req.files['doc_especializacao'] ? req.files['doc_especializacao'][0].filename : null,
      doc_mestrado_path: req.files['doc_mestrado'] ? req.files['doc_mestrado'][0].filename : null,
      doc_doutorado_path: req.files['doc_doutorado'] ? req.files['doc_doutorado'][0].filename : null,
      doc_plano_aula_path: req.files['doc_plano_aula'] ? req.files['doc_plano_aula'][0].filename : null,
      doc_certificado_path: req.files['doc_certificado'] ? req.files['doc_certificado'][0].filename : null,
      doc_certificado_fundamental_path: req.files['doc_certificado_fundamental'] ? req.files['doc_certificado_fundamental'][0].filename : null,
      doc_certificado_medio_path: req.files['doc_certificado_medio'] ? req.files['doc_certificado_medio'][0].filename : null,
      doc_certificado_fund_completo_path: req.files['doc_certificado_fund_completo'] ? req.files['doc_certificado_fund_completo'][0].filename : null,
      doc_cursos: req.files['doc_cursos'] ? JSON.stringify(req.files['doc_cursos'].map(f => f.filename)) : null,
      doc_pos: req.files['doc_pos'] ? JSON.stringify(req.files['doc_pos'].map(f => f.filename)) : null,
      doc_qualificacao: req.files['doc_qualificacao'] ? JSON.stringify(req.files['doc_qualificacao'].map(f => f.filename)) : null,
      doc_tempo_exercicio_path: req.files['doc_tempo_exercicio'] ? req.files['doc_tempo_exercicio'][0].filename : null,
      status: 'PENDENTE'
    });
    
    res.json({ 
      success: true, 
      message: 'Inscrição realizada com sucesso!', 
      data: novaInscricao 
    });
    
  } catch (error) {
    console.error("Erro ao criar inscrição:", error);
    res.status(500).json({ 
      success: false, 
      message: "Erro interno ao processar a inscrição", 
      error: error.message 
    });
  }
});

module.exports = router;
