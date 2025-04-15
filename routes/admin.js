const express = require('express');
const { fn, col, Op } = require('sequelize');
const sequelize = require('../config/database');
const DashboardView = require('../models/DashboardView');
const Inscricao = require('../models/Inscricao');
const Cargo = require('../models/Cargo');
const Candidato = require('../models/Candidato');
const ValidacaoInscricao = require('../models/ValidacaoInscricao');
const CargoRegiao = require('../models/CargoRegiao'); // Modelo para a tabela cargo_regioes

const PDFDocument = require('pdfkit'); // Biblioteca para gerar PDF (usada em outros endpoints, se necessário)
const router = express.Router();

// Helper para interpretar o valor da coluna PCD
function isPCD(val) {
  return val === true || (typeof val === 'string' && val.toLowerCase() === 'true');
}

// Helper para formatar a data (agora com suporte a strings YYYY-MM-DD)
function formatDate(date) {
  if (!date) return 'N/A';
  
  // Se for string no formato YYYY-MM-DD
  if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
  }
  
  // Se for objeto Date
  const d = new Date(date);
  if (isNaN(d)) return 'N/A';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}


// ======================================================================
// 1. Endpoints já existentes (Dashboard, Inscrições, Candidato, etc.)
// ======================================================================

// Endpoint para dados do dashboard (usando a view)
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

// Endpoint para buscar candidato relacionado com as inscrições 
router.get('/candidato/:cpf', async (req, res) => {
  try {
    const cpf = req.params.cpf.replace(/\D/g, '');
    
    // Usa o alias "Inscricaos" conforme definido na associação do modelo
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

    // Acesse as inscrições através do alias definido, 'Inscricaos'
    const inscricoes = candidato.Inscricaos || [];
    
    // Para cada inscrição, consulta a tabela de validações
    const inscricoesComValidacao = await Promise.all(inscricoes.map(async (insc) => {
      const validacao = await ValidacaoInscricao.findOne({
        where: { inscricao_id: insc.id },
        raw: true
      });
      
      return {
        ...insc.get({ plain: true }),
        pontuacao: validacao ? validacao.pontuacao : 0,
        validacoes: validacao ? JSON.parse(validacao.validacoes) : {}
      };
    }));

    res.json({
      candidato: {
        nome: candidato.nome,
        cpf: candidato.cpf,
        email: candidato.email,
        pcd: candidato.pcd
      },
      inscricoes: inscricoesComValidacao.map(insc => ({
        id: insc.id,
        zona: insc.zona,
        tempo_exercicio: insc.tempo_exercicio,
        pontuacao: insc.pontuacao,
        validacoes: insc.validacoes,
        Cargo: insc.Cargo,
        doc_identidade_path: insc.doc_identidade_path,
        doc_escolaridade_path: insc.doc_escolaridade_path,
        doc_diploma_path: insc.doc_diploma_path,
        doc_especifico_path: insc.doc_especifico_path,
        doc_especializacao_path: insc.doc_especializacao_path,
        doc_mestrado_path: insc.doc_mestrado_path,
        doc_doutorado_path: insc.doc_doutorado_path,
        doc_plano_aula_path: insc.doc_plano_aula_path,
        doc_certificado_path: insc.doc_certificado_path,
        doc_certificado_fundamental_path: insc.doc_certificado_fundamental_path,
        doc_certificado_medio_path: insc.doc_certificado_medio_path,
        doc_certificado_fund_completo_path: insc.doc_certificado_fund_completo_path,
        doc_cursos: insc.doc_cursos,
        doc_pos: insc.doc_pos,
        doc_qualificacao: insc.doc_qualificacao,
        doc_tempo_exercicio_path: insc.doc_tempo_exercicio_path,
        status: insc.status
      }))
    });
  } catch (error) {
    console.error("Erro ao buscar candidato:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para validação de inscrição (calcula pontuação e atualiza o status)
router.post('/verificar-inscricao/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, validacoes, observacoes } = req.body;
    
    const inscricao = await Inscricao.findByPk(id);
    if (!inscricao) {
      return res.status(404).json({ message: 'Inscrição não encontrada' });
    }
    
    // Buscar o cargo para obter o nível
    const cargo = await Cargo.findByPk(inscricao.cargo_id);
    
    let pontuacaoFinal = 0;
    
    // Campos fixos
    if (validacoes["doc_escolaridade_path"] === "confirmado") {
      pontuacaoFinal += 50;
    }
    if (validacoes["doc_certificado_fundamental_path"] === "confirmado") {
      pontuacaoFinal += 10;
    }
    if (validacoes["doc_certificado_medio_path"] === "confirmado") {
      pontuacaoFinal += 10;
    }
    if (validacoes["doc_certificado_fund_completo_path"] === "confirmado") {
      pontuacaoFinal += 10;
    }
    
    // Tempo de Exercício
    if (validacoes["doc_tempo_exercicio_path"]) {
      const tempoPoints = { "ate02": 5, "de02a04": 10, "de04a06": 15, "mais06": 20 };
      pontuacaoFinal += tempoPoints[validacoes["doc_tempo_exercicio_path"]] || 0;
    }
    
    // Para cargos de Nível FUNDAMENTAL: doc_cursos (limite 4)
    if (cargo && cargo.nivel.toUpperCase().includes("FUNDAMENTAL") && validacoes["doc_cursos"] === "confirmado") {
      try {
        const cursos = JSON.parse(inscricao.doc_cursos);
        let count = Math.min(cursos.length, 4);
        pontuacaoFinal += count * 5;
      } catch (e) {
        console.error("Erro ao parsear doc_cursos", e);
      }
    }
    
    // Para cargos de Nível SUPERIOR: doc_pos e doc_qualificacao (limite 2 cada)
    if (cargo && cargo.nivel.toUpperCase().includes("SUPERIOR")) {
      if (validacoes["doc_pos"] === "confirmado") {
        try {
          const pos = JSON.parse(inscricao.doc_pos);
          let count = Math.min(pos.length, 2);
          pontuacaoFinal += count * 5;
        } catch (e) {
          console.error("Erro ao parsear doc_pos", e);
        }
      }
      if (validacoes["doc_qualificacao"] === "confirmado") {
        try {
          const qual = JSON.parse(inscricao.doc_qualificacao);
          let count = Math.min(qual.length, 2);
          pontuacaoFinal += count * 5;
        } catch (e) {
          console.error("Erro ao parsear doc_qualificacao", e);
        }
      }
    }
    
    await ValidacaoInscricao.upsert({
      inscricao_id: id,
      validacoes: JSON.stringify(validacoes),
      observacoes,
      status,
      pontuacao: pontuacaoFinal
    });
    
    await inscricao.update({ status: 'VALIDADO' });
    
    return res.json({ 
      success: true, 
      message: 'Validação registrada com sucesso', 
      pontuacao: pontuacaoFinal 
    });
    
  } catch (error) {
    console.error("Erro na validação:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------
// NOVOS ENDPOINTS: RESULTADOS COM FILTROS E GERAÇÃO DO PDF
// ---------------------------------------------------------------

// Endpoint para obter os resultados (agrupados por cargo/região e com dados das vagas)
router.get('/resultados-pss', async (req, res) => {
  try {
    const { cargo, regiao } = req.query;
    const whereDashboard = { status: 'PENDENTE' };
    if (cargo) whereDashboard.cargo_nome = { [Op.iLike]: `%${cargo}%` };
    if (regiao) whereDashboard.regiao = { [Op.iLike]: `%${regiao}%` };

    // Buscar os candidatos na DashboardView
    const resultados = await DashboardView.findAll({
      where: whereDashboard,
      order: [
        ['cargo_nome', 'ASC'],
        ['regiao', 'ASC'],
        ['pontuacao', 'DESC']
      ],
      raw: true
    });

    // Agrupar os resultados por cargo e região
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

    // Buscar vagas disponíveis (juntando com o modelo Cargo para obter o nome)
    const vagas = await CargoRegiao.findAll({
      include: [{
        model: Cargo,
        as: 'cargo',
        attributes: ['nome']
      }],
      raw: true,
      nest: true
    });

    // Para cada grupo, adiciona informações de vagas e classifica os candidatos,
    // usando a função isPCD para determinar corretamente o valor.
    const resultadoFinal = Object.values(grupos).map(grupo => {
      // Procura a vaga que corresponda ao cargo e região
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
          // Inclui o valor convertido usando isPCD para ser utilizado no PDF e na tela
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

// Endpoint para gerar o PDF dos resultados filtrados
// Requisitos atualizados:
// - Exibir as informações: Número de Inscrição, Nome, Modalidade da Concorrência, Data de Nascimento e Cargo.
// - A Modalidade da Concorrência deverá exibir "PcD" se o campo pcd for verdadeiro e "AMPLA CONCORRÊNCIA" caso contrário.
// - Agrupar os registros pela região.
// - No cabeçalho de cada grupo, exibir o total de inscritos naquela região.
// Endpoint para gerar o PDF dos resultados (ATUALIZADO)
router.get('/resultados-pss/pdf', async (req, res) => {
  try {
    const { cargo, regiao } = req.query;
    const whereDashboard = { status: 'PENDENTE' };
    if (cargo) whereDashboard.cargo_nome = { [Op.iLike]: `%${cargo}%` };
    if (regiao) whereDashboard.regiao = { [Op.iLike]: `%${regiao}%` };

    // Busca os resultados filtrados
    const resultados = await DashboardView.findAll({
      where: whereDashboard,
      order: [
        ['regiao', 'ASC'],
        ['candidato_nome', 'ASC']
      ],
      raw: true
    });

    // DEBUG: Verificar os primeiros registros
    if (resultados.length > 0) {
      console.log('Debug - Primeiro registro:', {
        id: resultados[0].inscricao_id,
        nome: resultados[0].candidato_nome,
        pcd: resultados[0].pcd,
        data_nasc: resultados[0].data_nascimento,
        tipo_pcd: typeof resultados[0].pcd,
        tipo_data: typeof resultados[0].data_nascimento
      });
    }

    // Agrupa por região
    const grupos = {};
    resultados.forEach(candidato => {
      const reg = candidato.regiao;
      if (!grupos[reg]) {
        grupos[reg] = {
          regiao: reg,
          candidatos: []
        };
      }
      grupos[reg].candidatos.push(candidato);
    });

    // Configuração do documento PDF
    const content = [
      { 
        text: 'Resultado Final do PSS 001/2025', 
        style: 'header',
        margin: [0, 0, 0, 20]
      }
    ];

    // Adiciona cada região como uma seção no PDF
    Object.values(grupos).forEach(grupo => {
      // Cabeçalho da região
      content.push({ 
        text: `Região: ${grupo.regiao} | Total de Inscritos: ${grupo.candidatos.length}`,
        style: 'subheader',
        margin: [0, 0, 0, 10]
      });

      // Tabela de candidatos
      const tableBody = [
        [
          { text: 'Inscrição', style: 'tableHeader', alignment: 'center' },
          { text: 'Nome do Candidato', style: 'tableHeader', alignment: 'left' },
          { text: 'Modalidade', style: 'tableHeader', alignment: 'center' },
          { text: 'Nascimento', style: 'tableHeader', alignment: 'center' },
          { text: 'Cargo', style: 'tableHeader', alignment: 'left' }
        ]
      ];

      // Linhas da tabela
      grupo.candidatos.forEach(candidato => {
        tableBody.push([
          { text: candidato.inscricao_id?.toString() || 'N/A', alignment: 'center' },
          { text: candidato.candidato_nome || 'N/A', alignment: 'left' },
          { text: isPCD(candidato.pcd) ? "PcD" : "Ampla", alignment: 'center' },
          { text: formatDate(candidato.data_nascimento), alignment: 'center' },
          { text: candidato.cargo_nome || 'N/A', alignment: 'left' }
        ]);
      });

      content.push({
        table: {
          headerRows: 1,
          widths: [60, '*', 70, 80, '*'],
          body: tableBody
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === node.table.body.length) ? 1 : 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#aaaaaa',
          vLineColor: () => '#aaaaaa',
          paddingTop: (i) => i === 0 ? 5 : 3,
          paddingBottom: (i, node) => (i === node.table.body.length - 1) ? 5 : 3
        },
        margin: [0, 0, 0, 20]
      });
    });

    // Definição completa do PDF
    const docDefinition = {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [40, 60, 40, 60],
      content: content,
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          alignment: 'center',
          color: '#2c3e50'
        },
        subheader: {
          fontSize: 14,
          bold: true,
          color: '#34495e',
          margin: [0, 5, 0, 5]
        },
        tableHeader: {
          bold: true,
          fontSize: 10,
          color: '#ffffff',
          fillColor: '#3498db',
          margin: [0, 2, 0, 2]
        }
      },
      defaultStyle: {
        font: 'Helvetica',
        fontSize: 10
      }
    };

    // Criação do PDF
    const PdfPrinter = require('pdfmake');
    const fonts = {
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique'
      }
    };

    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    // Configura os headers da resposta
    res.setHeader('Content-Disposition', 'attachment; filename="resultados_pss.pdf"');
    res.setHeader('Content-Type', 'application/pdf');

    // Envia o PDF
    pdfDoc.pipe(res);
    pdfDoc.end();

  } catch (error) {
    console.error("Erro ao gerar PDF:", error);
    res.status(500).json({ 
      error: "Erro ao gerar PDF",
      details: error.message 
    });
  }
});

module.exports = router;
