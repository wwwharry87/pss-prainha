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

// Helper para interpretar o valor da coluna PCD (considerando boolean e text)
function isPCD(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true';
  return false;
}

// Helper para formatar datas em texto 'YYYY-MM-DD'
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  
  // Extrai componentes diretamente da string
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  
  return 'Data inválida';
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
// Endpoint para gerar o PDF dos resultados (VERSÃO FINAL CORRIGIDA)
// Endpoint para gerar o PDF dos resultados (VERSÃO FINAL TESTADA)
// Endpoint para gerar o PDF corrigido
router.get('/resultados-pss/pdf', async (req, res) => {
  try {
    const { cargo, regiao } = req.query;
    const whereDashboard = { status: 'PENDENTE' };
    if (cargo) whereDashboard.cargo_nome = { [Op.iLike]: `%${cargo}%` };
    if (regiao) whereDashboard.regiao = { [Op.iLike]: `%${regiao}%` };

    // Busca os dados com verificação
    const resultados = await DashboardView.findAll({
      where: whereDashboard,
      order: [
        ['regiao', 'ASC'],
        ['candidato_nome', 'ASC']
      ],
      raw: true
    });

    console.log('Dados brutos da view:', JSON.stringify(resultados.slice(0, 2), null, 2));

    // Agrupa e formata dados
    const grupos = {};
    resultados.forEach(candidato => {
      const reg = candidato.regiao;
      if (!grupos[reg]) grupos[reg] = { regiao: reg, candidatos: [] };
      
      grupos[reg].candidatos.push({
        ...candidato,
        nomeFormatado: isPCD(candidato.pcd) ? `${candidato.candidato_nome} (PcD)` : candidato.candidato_nome,
        nascimento: formatDate(candidato.data_nascimento)
      });
    });

    // Configuração do PDF
    const doc = new PDFDocument({ margin: 40 });
    res.setHeader('Content-Disposition', 'attachment; filename="resultados_pss.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    // Cabeçalho Principal
    doc.font('Helvetica-Bold')
       .fontSize(16)
       .text('RESULTADO FINAL - PSS 001/2025', { align: 'center', underline: true })
       .moveDown(1.5);

    // Loop por região
    Object.values(grupos).forEach((grupo, index) => {
      if (index > 0) doc.addPage(); // Nova página para cada região
      
      // Cabeçalho da Região
      doc.font('Helvetica-Bold')
         .fontSize(12)
         .text(`REGIÃO: ${grupo.regiao.toUpperCase()} - ${grupo.candidatos.length} INSCRITOS`, { underline: true })
         .moveDown(1);

      // Configuração da tabela
      const colunas = [
        { header: 'INSCRIÇÃO', width: 70, align: 'center' },
        { header: 'NOME DO CANDIDATO', width: 250, align: 'left' },
        { header: 'DATA NASC.', width: 90, align: 'center' },
        { header: 'CARGO', width: 180, align: 'left' }
      ];

      // Posições iniciais
      let x = 40;
      let y = doc.y;
      const linhaAltura = 22;

      // Desenha cabeçalho
      doc.rect(x, y, colunas.reduce((sum, c) => sum + c.width, 0), linhaAltura)
         .fillAndStroke('#2c3e50', '#2c3e50')
         .fillColor('white');
      
      colunas.forEach((coluna, i) => {
        doc.font('Helvetica-Bold')
           .fontSize(10)
           .text(coluna.header, x + 5, y + 6, { width: coluna.width - 10, align: coluna.align });
        x += coluna.width;
      });

      // Linhas de dados
      y += linhaAltura;
      grupo.candidatos.forEach(candidato => {
        x = 40;
        
        // Quebra página se necessário
        if (y > doc.page.height - 50) {
          doc.addPage();
          y = 40;
        }

        // Conteúdo da linha
        doc.fillColor('black')
           .font('Helvetica')
           .fontSize(10);
        
        [candidato.inscricao_id?.toString(), 
         candidato.nomeFormatado, 
         candidato.nascimento, 
         candidato.cargo_nome].forEach((valor, i) => {
          doc.text(valor || 'N/A', x + 5, y + 6, { 
            width: colunas[i].width - 10, 
            align: colunas[i].align,
            lineBreak: false
          });
          x += colunas[i].width;
        });

        // Linha divisória
        doc.moveTo(40, y + linhaAltura - 2)
           .lineTo(40 + colunas.reduce((sum, c) => sum + c.width, 0), y + linhaAltura - 2)
           .stroke('#eeeeee');
        
        y += linhaAltura;
      });
    });

    doc.end();
  } catch (error) {
    console.error("Erro ao gerar PDF:", error);
    res.status(500).json({ error: "Erro ao gerar PDF", details: error.message });
  }
});

module.exports = router;
