const express = require('express');
const { fn, col, Op } = require('sequelize');
const sequelize = require('../config/database');
const DashboardView = require('../models/DashboardView');
const Inscricao = require('../models/Inscricao');
const Cargo = require('../models/Cargo');
const Candidato = require('../models/Candidato');
const ValidacaoInscricao = require('../models/ValidacaoInscricao');
const CargoRegiao = require('../models/CargoRegiao');
const path = require('path');
const PdfPrinter = require('pdfmake/src/printer');
const router = express.Router();

// Mapear fontes para pdfmake
const fonts = {
  Roboto: {
    normal: path.join(__dirname, '../fonts/Roboto/Roboto-Regular.ttf'),
    bold: path.join(__dirname,  '../fonts/Roboto/Roboto-Bold.ttf'),
    italics: path.join(__dirname,  '../fonts/Roboto/Roboto-Italic.ttf'),
    bolditalics: path.join(__dirname,  '../fonts/Roboto/Roboto-BoldItalic.ttf')
  }
};

// Helper: converte valor para boolean PCD
function isPCD(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true';
  return false;
}

// Helper: calcula idade a partir da data de nascimento
function calcularIdade(dataNascimento) {
  if (!dataNascimento) return null;
  const hoje = new Date();
  const nasc = new Date(dataNascimento);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

// Helper: formata data YYYY-MM-DD → DD/MM/YYYY
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return dateStr;
}

// 1) Dashboard data
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
        group: ['cargo_nome'], raw: true
      }),
      DashboardView.findAll({
        attributes: ['regiao', [fn('COUNT', col('inscricao_id')), 'total']],
        group: ['regiao'], raw: true
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
    console.error('Erro ao gerar dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2) Listagem de inscrições
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
    const inscricoes = await DashboardView.findAll({ where, order: [['data_inscricao', 'DESC']] });
    res.json(inscricoes);
  } catch (error) {
    console.error('Erro ao buscar inscrições:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3) Buscar candidato e validações
router.get('/candidato/:cpf', async (req, res) => {
  try {
    const cpf = req.params.cpf.replace(/\D/g, '');
    const candidato = await Candidato.findOne({
      where: { cpf },
      include: [{ model: Inscricao, as: 'Inscricaos', include: [Cargo] }]
    });
    if (!candidato) return res.status(404).json({ error: 'Candidato não encontrado' });

    const detalhados = await Promise.all(candidato.Inscricaos.map(async insc => {
      const val = await ValidacaoInscricao.findOne({ where: { inscricao_id: insc.id }, raw: true });
      return {
        ...insc.get({ plain: true }),
        pontuacao: val?.pontuacao || 0,
        plano_aula_pontuacao: val?.plano_aula_pontuacao || 0, // NOVO CAMPO ENTREVISTA
        validacoes: val ? JSON.parse(val.validacoes) : {},
        justificativa_retificacao: val?.justificativa_retificacao || null,
        // CAMPOS DA ENTREVISTA
        entrevista_realizada: val?.entrevista_realizada ?? 0,
        entrevista_pontuacao: val?.entrevista_pontuacao ?? '',
        entrevista_obs: val?.entrevista_obs ?? '',
        entrevista_json: val?.entrevista_json ?? '',
        entrevista_data: val?.entrevista_data ?? ''
      };
    }));
    

    res.json({
      candidato: {
        nome: candidato.nome,
        cpf: candidato.cpf,
        email: candidato.email,
        pcd: candidato.pcd
      },
      inscricoes: detalhados
    });
  } catch (error) {
    console.error('Erro ao buscar candidato:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4) Validar inscrição
router.post('/verificar-inscricao/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { validacoes, observacoes } = req.body;
    const insc = await Inscricao.findByPk(id);
    if (!insc) return res.status(404).json({ success: false, message: 'Inscrição não encontrada' });
    const cargo = await Cargo.findByPk(insc.cargo_id);
    if (!cargo) return res.status(400).json({ success: false, message: 'Cargo associado não encontrado' });
    const pontuacao = calcularPontuacao(insc, cargo, validacoes);

    let valRec = await ValidacaoInscricao.findOne({ where: { inscricao_id: id } });
    const dados = {
      validacoes: JSON.stringify(validacoes),
      observacoes: observacoes || null,
      status: 'VALIDADO',
      pontuacao,
      justificativa_retificacao: valRec?.justificativa_retificacao || null
    };
    if (valRec) await valRec.update(dados);
    else await ValidacaoInscricao.create({ inscricao_id: id, ...dados });
    await insc.update({ status: 'VALIDADO' });

    res.json({ success: true, message: 'Validação registrada com sucesso', pontuacao });
  } catch (error) {
    console.error('Erro na validação:', error);
    res.status(500).json({ success: false, message: 'Erro ao processar validação', error: error.message });
  }
});

// Helper: calcular pontuação
function calcularPontuacao(insc, cargo, validacoes) {
  let pts = 0;
  if (validacoes['doc_escolaridade_path'] === 'confirmado') pts += 50;
  ['fundamental','medio','fund_completo'].forEach(k => {
    if (validacoes[`doc_certificado_${k}_path`] === 'confirmado') pts += 10;
  });
  if (validacoes['doc_tempo_exercicio_path'] === 'confirmado' && insc.tempo_exercicio) {
    const m = { ate02: 5, de02a04: 10, de04a06: 15, mais06: 20 };
    pts += m[insc.tempo_exercicio] || 0;
  }
  if (cargo.nivel.toUpperCase().includes('SUPERIOR')) {
    try {
      JSON.parse(insc.doc_qualificacao || '[]').forEach((_, i) => {
        if (validacoes[`doc_qualificacao_${i}`] === 'confirmado') pts += 5;
      });
      JSON.parse(insc.doc_pos || '[]').forEach((_, i) => {
        if (validacoes[`doc_pos_${i}`] === 'confirmado') pts += 5;
      });
    } catch {}
    if (validacoes['doc_mestrado_path'] === 'confirmado') pts += 5;
    if (validacoes['doc_doutorado_path'] === 'confirmado') pts += 5;
  }
  return pts;
}

// 5) Retificar inscrição
router.post('/retificar-inscricao/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { justificativa } = req.body;
    if (!justificativa?.trim()) {
      return res.status(400).json({ success: false, message: 'Justificativa obrigatória' });
    }
    const insc = await Inscricao.findByPk(id);
    const valRec = await ValidacaoInscricao.findOne({ where: { inscricao_id: id } });
    if (!insc || !valRec) {
      return res.status(404).json({ success: false, message: 'Registro não encontrado' });
    }
    await valRec.update({ justificativa_retificacao: justificativa.trim(), status: 'PENDENTE' });
    await insc.update({ status: 'PENDENTE' });
    res.json({ success: true, message: 'Retificação registrada com sucesso' });
  } catch (error) {
    console.error('Erro na retificação:', error);
    res.status(500).json({ success: false, message: 'Erro ao processar retificação', error: error.message });
  }
});

// 5b) Salvar entrevista (somente para inscrição validada)
router.post('/salvar-entrevista/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { entrevista_json, entrevista_pontuacao, entrevista_obs, plano_aula_pontuacao } = req.body; // NOVO CAMPO AQUI
    const valRec = await ValidacaoInscricao.findOne({ where: { inscricao_id: id } });
    if (!valRec) return res.status(404).json({ success: false, message: 'Inscrição não encontrada' });
    if (valRec.status !== 'VALIDADO') {
      return res.status(400).json({ success: false, message: 'Entrevista só pode ser registrada para inscrições validadas.' });
    }
    await valRec.update({
      entrevista_json: entrevista_json ? (typeof entrevista_json === 'object' ? JSON.stringify(entrevista_json) : entrevista_json) : null,
      entrevista_pontuacao: entrevista_pontuacao || 0,
      plano_aula_pontuacao: plano_aula_pontuacao || 0, // <-- SALVANDO NOVO CAMPO
      entrevista_obs: entrevista_obs || null,
      entrevista_data: new Date(),
      entrevista_realizada: 1
    });
    res.json({ success: true, message: 'Entrevista salva com sucesso!' });
  } catch (error) {
    console.error('Erro ao salvar entrevista:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6) Filtros para frontend
router.get('/resultados-pss/filtros', async (req, res) => {
  try {
    const [cargos, regioes] = await Promise.all([
      Cargo.findAll({ attributes: ['nome'], group: ['nome'], raw: true }),
      CargoRegiao.findAll({ attributes: ['zona'], group: ['zona'], raw: true })
    ]);
    res.json({ cargos: cargos.map(c => c.nome), regioes: regioes.map(r => r.zona) });
  } catch (error) {
    console.error('Erro ao buscar filtros:', error);
    res.status(500).json({ error: error.message });
  }
});

// Internal: fetch resultados brutos
async function fetchResultados(cargo, regiao) {
  const whereCargo = cargo ? `AND car.nome ILIKE '%${cargo.replace(/'/g,"''")}%'` : '';
  const whereRegiao = regiao ? `AND cr.zona ILIKE '%${regiao.replace(/'/g,"''")}%'` : '';
  const sql = `
    WITH validacoes_recentes AS (
      SELECT DISTINCT ON (inscricao_id) *
      FROM validacoes_inscricoes_backup
      WHERE status = 'VALIDADO'
      ORDER BY inscricao_id, "updatedAt" DESC
    )
    SELECT
      i.id AS inscricao_id,
      c.nome AS candidato_nome,
      c.cpf AS candidato_cpf,
      c.data_nascimento,
      c.pcd,
      car.nome AS cargo_nome,
      cr.zona AS regiao,
      v.pontuacao,
      cr.vagas_imediatas,
      cr.reserva_pcd
    FROM inscricoes i
    JOIN candidatos c ON i.candidato_id = c.id
    JOIN cargos car ON i.cargo_id = car.id
    JOIN cargo_regioes cr ON cr.cargo_id = car.id AND cr.zona = i.zona
    JOIN validacoes_recentes v ON v.inscricao_id = i.id
    WHERE 1=1
      ${whereCargo}
      ${whereRegiao}
    ORDER BY cr.zona, car.nome, v.pontuacao DESC, c.data_nascimento asc
  `;
  return sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
}

// 7) Resultados JSON com distribuição de vagas PcD
router.get('/resultados-pss', async (req, res) => {
  try {
    const { cargo, regiao } = req.query;
    const raw = await fetchResultados(cargo, regiao);
    const grupos = {};
    raw.forEach(item => {
      const key = `${item.cargo_nome}|${item.regiao}`;
      if (!grupos[key]) {
        grupos[key] = {
          cargo: item.cargo_nome,
          regiao: item.regiao,
          vagas_imediatas: item.vagas_imediatas || 0,
          reserva_pcd: item.reserva_pcd || 0,
          lista: []
        };
      }
      grupos[key].lista.push(item);
    });
    const resultadoFinal = Object.values(grupos).map(g => {
      const sorted = g.lista.sort((a,b) => {
        if (b.pontuacao !== a.pontuacao) return b.pontuacao - a.pontuacao;
        return calcularIdade(b.data_nascimento) - calcularIdade(a.data_nascimento);
      });
      const geraisCount = Math.max(g.vagas_imediatas - g.reserva_pcd, 0);
      const gerais = sorted.filter(c => !isPCD(c.pcd)).slice(0, geraisCount);
      const reservadas = g.reserva_pcd > 0
        ? sorted.filter(c => isPCD(c.pcd) && c.pontuacao >= 50).slice(0, g.reserva_pcd)
        : [];
      const others = sorted.filter(c =>
        !gerais.some(x => x.inscricao_id === c.inscricao_id) &&
        !reservadas.some(x => x.inscricao_id === c.inscricao_id)
      );
      const finalList = [...gerais, ...reservadas, ...others];
      return {
        cargo: g.cargo,
        regiao: g.regiao,
        vagas_imediatas: g.vagas_imediatas,
        reserva_pcd: g.reserva_pcd,
        candidatos: finalList.map((cand, idx) => ({
          ...cand,
          idade: calcularIdade(cand.data_nascimento),
          classificacao: idx + 1,
          situacao: idx < gerais.length
            ? 'Classificado'
            : (idx < gerais.length + reservadas.length
                ? 'Classificado (Reserva PCD)'
                : 'Não Classificado')
        }))
      };
    });
    res.json(resultadoFinal);
  } catch (error) {
    console.error('Erro ao buscar resultados:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8) Geração de PDF
router.get('/resultados-pss/pdf', async (req, res) => {
  try {
    const { cargo, regiao } = req.query;
    const raw = await fetchResultados(cargo, regiao);
    const gruposMap = {};
    raw.forEach(item => {
      const key = `${item.cargo_nome}|${item.regiao}`;
      if (!gruposMap[key]) {
        gruposMap[key] = {
          cargo: item.cargo_nome,
          regiao: item.regiao,
          vagas_imediatas: item.vagas_imediatas || 0,
          reserva_pcd: item.reserva_pcd || 0,
          lista: []
        };
      }
      gruposMap[key].lista.push(item);
    });
    const grupos = Object.values(gruposMap).map(g => {
      const sorted = g.lista.sort((a,b) => {
        if (b.pontuacao !== a.pontuacao) return b.pontuacao - a.pontuacao;
        return calcularIdade(b.data_nascimento) - calcularIdade(a.data_nascimento);
      });
      const geraisCount = Math.max(g.vagas_imediatas - g.reserva_pcd, 0);
      const gerais = sorted.filter(c => !isPCD(c.pcd)).slice(0, geraisCount);
      const reservadas = g.reserva_pcd > 0
        ? sorted.filter(c => isPCD(c.pcd) && c.pontuacao >= 50).slice(0, g.reserva_pcd)
        : [];
      const others = sorted.filter(c =>
        !gerais.some(x => x.inscricao_id === c.inscricao_id) &&
        !reservadas.some(x => x.inscricao_id === c.inscricao_id)
      );
      const finalList = [...gerais, ...reservadas, ...others];
      return {
        cargo: g.cargo,
        regiao: g.regiao,
        vagas_imediatas: g.vagas_imediatas,
        reserva_pcd: g.reserva_pcd,
        candidatos: finalList.map((cand, idx) => ({
          ...cand,
          idade: calcularIdade(cand.data_nascimento),
          classificacao: idx + 1,
          situacao: idx < gerais.length
            ? 'Classificado'
            : (idx < gerais.length + reservadas.length
                ? 'Classificado (Reserva PCD)'
                : 'Não Classificado')
        }))
      };
    });

    const printer = new PdfPrinter(fonts);
    const content = [
      { text: 'RESULTADO DAS INSCRIÇÕES - PSS 001/2025', style: 'header', alignment: 'center', margin: [0,0,0,20] }
    ];
    grupos.forEach(gr => {
      const total = gr.candidatos.length;
      const ratio = gr.vagas_imediatas ? (total / gr.vagas_imediatas).toFixed(2) : 'N/A';
      content.push(
        { text: `REGIÃO: ${gr.regiao.toUpperCase()} • CARGO: ${gr.cargo.toUpperCase()}`, style: 'subheader', margin: [0,10,0,5] },
        { text: `Vagas: ${gr.vagas_imediatas} | Reserva PcD: ${gr.reserva_pcd} | Inscritos: ${total}`, style: 'info', margin: [0,0,0,2] },
        { text: `Relação Inscritos/Vagas: ${total}/${gr.vagas_imediatas} (média ${ratio})`, style: 'info', margin: [0,0,0,10] }
      );
      const body = [
        ['Cl.', 'Nome', 'Idade', 'CPF', 'Pontuação', 'Situação'],
        ...gr.candidatos.map(c => [
          `${c.classificacao}º`,
          c.candidato_nome + (c.pcd ? ' (PcD)' : ''),
          c.idade ?? 'N/A',
          c.candidato_cpf,
          `${c.pontuacao}`,
          c.situacao
        ])
      ];
      content.push({
        table: { headerRows: 1, widths: ['auto','*','auto','auto','auto','auto'], body },
        layout: 'lightHorizontalLines'
      });
    });

    const docDef = {
      pageSize: 'A4',
      pageMargins: [40,60,40,60],
      defaultStyle: { font: 'Roboto' },
      content,
      styles: {
        header:    { fontSize: 16, bold: true },
        subheader: { fontSize: 14, bold: true },
        info:      { fontSize: 12, italics: true }
      }
    };

    res.setHeader('Content-Disposition', 'attachment; filename="resultados_pss.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    const pdfDoc = printer.createPdfKitDocument(docDef);
    pdfDoc.pipe(res);
    pdfDoc.end();

  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

module.exports = router;
