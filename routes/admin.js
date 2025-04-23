const express = require('express');
const { fn, col, Op } = require('sequelize');
const sequelize = require('../config/database');
const DashboardView = require('../models/DashboardView');
const Inscricao = require('../models/Inscricao');
const Cargo = require('../models/Cargo');
const Candidato = require('../models/Candidato');
const ValidacaoInscricao = require('../models/ValidacaoInscricao');
const CargoRegiao = require('../models/CargoRegiao');
const PDFDocument = require('pdfkit');
const router = express.Router();

// Helper para interpretar o valor da coluna PCD
function isPCD(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true';
  return false;
}

// Helper para formatar datas
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return 'Data inválida';
}

// Endpoint para dados do dashboard
router.get('/dashboard-data', async (req, res) => {
  try {
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

// Endpoint para listagem de inscrições
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

// Endpoint para buscar candidato com inscrições
router.get('/candidato/:cpf', async (req, res) => {
  try {
    const cpf = req.params.cpf.replace(/\D/g, '');
    
    const candidato = await Candidato.findOne({
      where: { cpf },
      include: [{
        model: Inscricao,
        as: 'Inscricaos',
        include: [Cargo]
      }]
    });

    if (!candidato) {
      return res.status(404).json({ error: 'Candidato não encontrado' });
    }

    const inscricoes = candidato.Inscricaos || [];
    
    const inscricoesComValidacao = await Promise.all(inscricoes.map(async (insc) => {
      const validacao = await ValidacaoInscricao.findOne({
        where: { inscricao_id: insc.id },
        raw: true
      });
      
      return {
        ...insc.get({ plain: true }),
        pontuacao: validacao ? validacao.pontuacao : 0,
        validacoes: validacao ? JSON.parse(validacao.validacoes) : {},
        justificativa_retificacao: validacao ? validacao.justificativa_retificacao : null
      };
    }));

    res.json({
      candidato: {
        nome: candidato.nome,
        cpf: candidato.cpf,
        email: candidato.email,
        pcd: candidato.pcd
      },
      inscricoes: inscricoesComValidacao
    });
  } catch (error) {
    console.error("Erro ao buscar candidato:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para validação de inscrição
// Endpoint para validação de inscrição (completo e corrigido)
router.post('/verificar-inscricao/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, validacoes, observacoes } = req.body;
    
    // Verifica se a inscrição existe
    const inscricao = await Inscricao.findByPk(id);
    if (!inscricao) {
      return res.status(404).json({ 
        success: false,
        message: 'Inscrição não encontrada' 
      });
    }
    
    // Busca o cargo relacionado
    const cargo = await Cargo.findByPk(inscricao.cargo_id);
    if (!cargo) {
      return res.status(400).json({
        success: false,
        message: 'Cargo associado à inscrição não encontrado'
      });
    }
    
    // Calcula a pontuação total
    let pontuacaoFinal = calcularPontuacao(inscricao, cargo, validacoes);
    
    // Busca validação existente
    const validacaoExistente = await ValidacaoInscricao.findOne({ 
      where: { inscricao_id: id } 
    });

    // Prepara dados para atualização/criação
    const dadosValidacao = {
      validacoes: JSON.stringify(validacoes),
      observacoes: observacoes || null,
      status: 'VALIDADO',
      pontuacao: pontuacaoFinal,
      // Mantém justificativa se existir, senão define como null
      justificativa_retificacao: validacaoExistente?.justificativa_retificacao || null
    };

    // Atualiza ou cria a validação
    if (validacaoExistente) {
      await validacaoExistente.update(dadosValidacao);
    } else {
      await ValidacaoInscricao.create({
        inscricao_id: id,
        ...dadosValidacao
      });
    }
    
    // Atualiza status da inscrição
    await inscricao.update({ status: 'VALIDADO' });
    
    return res.json({ 
      success: true, 
      message: 'Validação registrada com sucesso', 
      pontuacao: pontuacaoFinal 
    });
    
  } catch (error) {
    console.error("Erro na validação:", error);
    return res.status(500).json({ 
      success: false,
      error: error.message,
      message: 'Erro ao processar validação'
    });
  }
});

// Função auxiliar para cálculo de pontuação (ajustada)
function calcularPontuacao(inscricao, cargo, validacoes) {
  let pontuacao = 0;
  
  // Pontos por documentos obrigatórios
  if (validacoes["doc_escolaridade_path"] === "confirmado") pontuacao += 50;
  if (validacoes["doc_certificado_fundamental_path"] === "confirmado") pontuacao += 10;
  if (validacoes["doc_certificado_medio_path"] === "confirmado") pontuacao += 10;
  if (validacoes["doc_certificado_fund_completo_path"] === "confirmado") pontuacao += 10;

  // Pontuação para plano de aula (se aplicável)
  if (validacoes["doc_plano_aula_path"] === "confirmado") {
    pontuacao += 0; // Adiciona pontos para plano de aula confirmado
  }
  
  // Tempo de exercício
  if (validacoes["doc_tempo_exercicio_path"] === "confirmado" && inscricao.tempo_exercicio) {
    const tempoPoints = { "ate02": 5, "de02a04": 10, "de04a06": 15, "mais06": 20 };
    pontuacao += tempoPoints[inscricao.tempo_exercicio] || 0;
  }
  
  // Cursos complementares (para cargos de nível fundamental)
  if (cargo.nivel.toUpperCase().includes("FUNDAMENTAL") && inscricao.doc_cursos) {
    try {
      const cursos = JSON.parse(inscricao.doc_cursos || '[]');
      // Verifica se há validação específica para cada curso
      const cursosValidados = cursos.filter((_, index) => {
        const chave = `doc_cursos_${index}`;
        return validacoes[chave] === "confirmado";
      });
      pontuacao += Math.min(cursosValidados.length, 4) * 5;
    } catch (e) {
      console.error("Erro ao processar cursos complementares:", e);
    }
  }
  
  // Pós-graduações e qualificações (para cargos de nível superior)
  if (cargo.nivel.toUpperCase().includes("SUPERIOR")) {
    if (inscricao.doc_pos) {
      try {
        const pos = JSON.parse(inscricao.doc_pos || '[]');
        const posValidados = pos.filter((_, index) => {
          const chave = `doc_pos_${index}`;
          return validacoes[chave] === "confirmado";
        });
        pontuacao += Math.min(posValidados.length, 2) * 5;
      } catch (e) {
        console.error("Erro ao processar pós-graduações:", e);
      }
    }
    
    if (inscricao.doc_qualificacao) {
      try {
        const qual = JSON.parse(inscricao.doc_qualificacao || '[]');
        const qualValidados = qual.filter((_, index) => {
          const chave = `doc_qualificacao_${index}`;
          return validacoes[chave] === "confirmado";
        });
        pontuacao += Math.min(qualValidados.length, 2) * 5;
      } catch (e) {
        console.error("Erro ao processar qualificações:", e);
      }
    }
  }
  
  return pontuacao;
}

// Endpoint para retificação de inscrição (completo e corrigido)
router.post('/retificar-inscricao/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { justificativa } = req.body;
    
    // Validação da justificativa
    if (!justificativa || justificativa.trim() === '') {
      return res.status(400).json({ 
        success: false,
        message: 'A justificativa é obrigatória para solicitar retificação.' 
      });
    }

    // Verifica se a inscrição existe
    const inscricao = await Inscricao.findByPk(id);
    if (!inscricao) {
      return res.status(404).json({ 
        success: false,
        message: 'Inscrição não encontrada.' 
      });
    }

    // Busca a validação existente
    const validacao = await ValidacaoInscricao.findOne({ 
      where: { inscricao_id: id } 
    });
    
    if (!validacao) {
      return res.status(404).json({ 
        success: false,
        message: 'Validação não encontrada para esta inscrição.' 
      });
    }
    
    // Atualiza a validação com a justificativa
    await validacao.update({
      justificativa_retificacao: justificativa.trim(),
      status: 'PENDENTE'
      // Mantém os outros campos (pontuação, validações) para histórico
    });
    
    // Atualiza o status da inscrição
    await inscricao.update({ status: 'PENDENTE' });
    
    return res.json({ 
      success: true, 
      message: 'Retificação registrada com sucesso. A validação deverá ser refeita.',
      justificativa: justificativa.trim() 
    });
    
  } catch (error) {
    console.error('Erro na retificação:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message,
      message: 'Erro ao processar retificação'
    });
  }
});
// Endpoint para resultados do PSS
router.get('/resultados-pss', async (req, res) => {
  try {
    const { cargo, regiao } = req.query;
    const whereDashboard = { status: 'PENDENTE' };
    if (cargo) whereDashboard.cargo_nome = { [Op.iLike]: `%${cargo}%` };
    if (regiao) whereDashboard.regiao = { [Op.iLike]: `%${regiao}%` };

    const resultados = await DashboardView.findAll({
      where: whereDashboard,
      order: [
        ['cargo_nome', 'ASC'],
        ['regiao', 'ASC'],
        ['pontuacao', 'DESC']
      ],
      raw: true
    });

    const grupos = {};
    resultados.forEach(candidato => {
      const chave = `${candidato.cargo_nome}|${candidato.regiao}`;
      if (!grupos[chave]) {
        grupos[chave] = {
          cargo: candidato.cargo_nome,
          regiao: candidato.regiao,
          candidatos: []
        };
      }
      grupos[chave].candidatos.push(candidato);
    });

    const vagas = await CargoRegiao.findAll({
      include: [{
        model: Cargo,
        as: 'cargo',
        attributes: ['nome']
      }],
      raw: true,
      nest: true
    });

    const resultadoFinal = Object.values(grupos).map(grupo => {
      const vaga = vagas.find(v =>
        v.cargo && v.cargo.nome === grupo.cargo && v.zona === grupo.regiao
      );
      const vagas_imediatas = vaga ? parseInt(vaga.vagas_imediatas, 10) : 0;
      const reserva_pcd = vaga && vaga.reserva_pcd ? 1 : 0;
      
      grupo.candidatos = grupo.candidatos.map((candidato, index) => {
        let situacao = 'Não Classificado';
        if (index < vagas_imediatas) {
          situacao = 'Classificado';
        } else if (isPCD(candidato.pcd) || isPCD(candidato.PCD)) {
          if (index < (vagas_imediatas + reserva_pcd)) {
            situacao = 'Classificado (Reserva PCD)';
          }
        }
        return {
          ...candidato,
          classificacao: index + 1,
          situacao,
          pcd: isPCD(candidato.pcd) || isPCD(candidato.PCD)
        };
      });
      return {
        ...grupo,
        vagas_imediatas,
        reserva_pcd
      };
    });

    res.json(resultadoFinal);
  } catch (error) {
    console.error("Erro ao buscar resultados:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para gerar PDF de resultados
router.get('/resultados-pss/pdf', async (req, res) => {
  try {
    const { cargo, regiao } = req.query;
    const whereDashboard = { status: 'PENDENTE' };
    if (cargo) whereDashboard.cargo_nome = { [Op.iLike]: `%${cargo}%` };
    if (regiao) whereDashboard.regiao = { [Op.iLike]: `%${regiao}%` };

    const resultados = await DashboardView.findAll({
      where: whereDashboard,
      attributes: ['inscricao_id', 'candidato_nome', 'data_nascimento', 'pcd', 'cargo_nome', 'regiao'],
      order: [
        ['regiao', 'ASC'],
        ['cargo_nome', 'ASC'],
        ['candidato_nome', 'ASC']
      ],
      raw: true
    });

    const hierarquia = {};
    resultados.forEach(candidato => {
      const regiaoKey = candidato.regiao;
      const cargoKey = candidato.cargo_nome;

      if (!hierarquia[regiaoKey]) {
        hierarquia[regiaoKey] = {
          regiao: regiaoKey,
          cargos: {}
        };
      }

      if (!hierarquia[regiaoKey].cargos[cargoKey]) {
        hierarquia[regiaoKey].cargos[cargoKey] = {
          cargo: cargoKey,
          candidatos: []
        };
      }

      hierarquia[regiaoKey].cargos[cargoKey].candidatos.push({
        inscricao_id: candidato.inscricao_id,
        nome: candidato.candidato_nome + (isPCD(candidato.pcd) ? " - PcD" : ""),
        nascimento: formatDate(candidato.data_nascimento)
      });
    });

    const content = [];
    content.push({ 
      text: [
        { text: 'RESULTADO DAS INSCRIÇÕES - PSS 001/2025', style: 'header' },
        { text: '\nOs candidatos não identificados como PcD concorrem na modalidade de Ampla Concorrência', style: 'observacao' }
      ],
      margin: [0, 0, 0, 20],
      alignment: 'center'
    });

    Object.keys(hierarquia).sort().forEach(regiaoKey => {
      const regiaoData = hierarquia[regiaoKey];

      content.push({
        text: `REGIÃO: ${regiaoData.regiao.toUpperCase()}`,
        style: 'regiaoHeader',
      });

      Object.keys(regiaoData.cargos).sort().forEach(cargoKey => {
        const cargoData = regiaoData.cargos[cargoKey];

        content.push({
          text: `Cargo: ${cargoData.cargo} (${cargoData.candidatos.length} candidatos)`,
          style: 'cargoHeader',
          margin: [0, 10, 0, 5]
        });

        const tableBody = [
          [
            { text: 'Inscrição', style: 'tableHeader', alignment: 'center' },
            { text: 'Nome do Candidato', style: 'tableHeader', alignment: 'left' },
            { text: 'Data de Nascimento', style: 'tableHeader', alignment: 'center' }
          ]
        ];

        cargoData.candidatos.forEach(candidato => {
          tableBody.push([
            { text: candidato.inscricao_id || 'N/A', alignment: 'center' },
            { text: candidato.nome, alignment: 'left' },
            { text: candidato.nascimento, alignment: 'center' }
          ]);
        });

        content.push({
          table: {
            headerRows: 1,
            widths: ['20%', '60%', '20%'],
            body: tableBody,
            dontBreakRows: true
          },
          layout: {
            hLineWidth: (i) => (i === 0 || i === tableBody.length) ? 1 : 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#444',
            vLineColor: () => '#444',
            fillColor: (rowIndex) => (rowIndex === 0) ? '#2c3e50' : null
          },
          margin: [0, 0, 0, 20]
        });
      });
    });

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      header: (currentPage, pageCount) => ({
        text: `Página ${currentPage} de ${pageCount}`,
        alignment: 'right',
        margin: [0, 10, 20, 0],
        fontSize: 9
      }),
      content: content,
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          color: '#2c3e50'
        },
        observacao: {
          fontSize: 10,
          italics: true,
          margin: [0, 5, 0, 0]
        },
        regiaoHeader: {
          fontSize: 14,
          bold: true,
          color: '#2c3e50',
          margin: [0, 20, 0, 10]
        },
        cargoHeader: {
          fontSize: 12,
          bold: true,
          color: '#34495e'
        },
        tableHeader: {
          bold: true,
          fontSize: 10,
          color: 'white',
          fillColor: '#2c3e50'
        }
      },
      defaultStyle: {
        font: 'Helvetica',
        fontSize: 10
      }
    };

    const PdfPrinter = require('pdfmake');
    const printer = new PdfPrinter({
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique'
      }
    });

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    res.setHeader('Content-Disposition', 'attachment; filename="resultados_pss.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    pdfDoc.pipe(res);
    pdfDoc.end();

  } catch (error) {
    console.error("Erro ao gerar PDF:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;