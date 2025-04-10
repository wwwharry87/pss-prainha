// routes/admin.js
const express = require('express');
const router = express.Router();
const { fn, col, Op } = require('sequelize');
const sequelize = require('../config/database');
const DashboardView = require('../models/DashboardView');
const Inscricao = require('../models/Inscricao');
const Cargo = require('../models/Cargo');
const Candidato = require('../models/Candidato');
const ValidacaoInscricao = require('../models/ValidacaoInscricao');

// Endpoint para dados do dashboard (usando a view)
router.get('/dashboard-data', async (req, res) => {
  try {
    // Dados agregados
    const [porCargo, porRegiao, totais] = await Promise.all([
      DashboardView.findAll({
        attributes: [
          'cargo_nome',
          [fn('COUNT', col('inscricao_id')), 'total'],
          [fn('SUM', sequelize.literal("CASE WHEN status = 'VALIDADO' THEN 1 ELSE 0 END")), 'validados'],
          [fn('SUM', sequelize.literal("CASE WHEN status = 'PENDENTE' THEN 1 ELSE 0 END")), 'pendentes']
        ],
        group: ['cargo_nome'],
        raw: true
      }),
      DashboardView.findAll({
        attributes: [
          'regiao',
          [fn('COUNT', col('inscricao_id')), 'total']
        ],
        group: ['regiao'],
        raw: true
      }),
      DashboardView.findAll({
        attributes: [
          [fn('COUNT', col('inscricao_id')), 'total'],
          [fn('SUM', sequelize.literal("CASE WHEN status = 'VALIDADO' THEN 1 ELSE 0 END")), 'validados'],
          [fn('SUM', sequelize.literal("CASE WHEN status = 'PENDENTE' THEN 1 ELSE 0 END")), 'pendentes']
        ],
        raw: true
      })
    ]);

    res.json({
      porCargo,
      porRegiao,
      totais: totais[0] || { total: 0, validados: 0, pendentes: 0 }
    });
  } catch (error) {
    console.error("Erro ao gerar dashboard:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para listagem de inscrições (usando a view)
router.get('/inscricoes', async (req, res) => {
  try {
    const { cargo, regiao, status, search } = req.query;
    const where = {};
    
    if (cargo) where.cargo_nome = { [Op.iLike]: `%${cargo}%` };
    if (regiao) where.regiao = { [Op.iLike]: `%${regiao}%` };
    if (status) where.status = { [Op.iLike]: `%${status}%` };
    if (search) {
      where[Op.or] = [
        { candidato_nome: { [Op.iLike]: `%${search}%` } },
        { candidato_cpf: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const inscricoes = await DashboardView.findAll({
      where,
      order: [['data_inscricao', 'DESC']],
    });

    res.json(inscricoes);
  } catch (error) {
    console.error("Erro ao buscar inscrições:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para buscar candidato por CPF
router.get('/candidato/:cpf', async (req, res) => {
  try {
    const cpf = req.params.cpf.replace(/\D/g, '');
    const candidato = await Candidato.findOne({
      where: { cpf },
      include: [{
        model: Inscricao,
        include: [Cargo, ValidacaoInscricao]
      }]
    });

    if (!candidato) {
      return res.status(404).json({ error: 'Candidato não encontrado' });
    }

    // Tenta acessar pela propriedade padrão ou pelo alias (caso exista)
    const inscricoes = candidato.Inscricoes || candidato.inscricoes || [];

    res.json({
      candidato: {
        nome: candidato.nome,
        cpf: candidato.cpf,
        email: candidato.email
      },
      inscricoes: inscricoes.map(insc => ({
        id: insc.id,
        cargo: insc.Cargo ? `${insc.Cargo.nome} - ${insc.Cargo.nivel}` : 'Não informado',
        zona: insc.zona,
        status: (insc.ValidacaoInscricao && insc.ValidacaoInscricao.status) || 'PENDENTE',
        documentos: montarListaDocumentos(insc)
      }))
    });
  } catch (error) {
    console.error("Erro ao buscar candidato:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para validação de inscrição
router.post('/validar-inscricao/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, validacoes, observacoes, pontuacao } = req.body;

    await ValidacaoInscricao.upsert({
      inscricao_id: id,
      validacoes,
      observacoes,
      status,
      pontuacao
    });

    res.json({ success: true, message: 'Validação registrada com sucesso' });
  } catch (error) {
    console.error("Erro na validação:", error);
    res.status(500).json({ error: error.message });
  }
});

// Função auxiliar para montar lista de documentos
function montarListaDocumentos(inscricao) {
  const docs = [];
  const campos = [
    'doc_identidade_path', 'doc_escolaridade_path', 'doc_diploma_path',
    'doc_especifico_path', 'doc_especializacao_path', 'doc_mestrado_path',
    'doc_doutorado_path', 'doc_plano_aula_path', 'doc_tempo_exercicio_path'
  ];

  campos.forEach(campo => {
    if (inscricao[campo]) {
      const label = campo.replace('doc_', '').replace('_path', '').replace(/_/g, ' ');
      docs.push({ label, filename: inscricao[campo] });
    }
  });

  if (inscricao.doc_cursos) {
    try {
      const cursos = JSON.parse(inscricao.doc_cursos);
      cursos.forEach((filename, i) => {
        docs.push({ label: `Curso complementar ${i+1}`, filename });
      });
    } catch (e) { console.error(e); }
  }

  return docs;
}

module.exports = router;
