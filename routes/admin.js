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
const fs = require('fs');

// Mapear fontes para pdfmake
const fonts = {
  Roboto: {
    normal: path.join(__dirname, '../fonts/Roboto/Roboto-Regular.ttf'),
    bold: path.join(__dirname,  '../fonts/Roboto/Roboto-Bold.ttf'),
    italics: path.join(__dirname,  '../fonts/Roboto/Roboto-Italic.ttf'),
    bolditalics: path.join(__dirname,  '../fonts/Roboto/Roboto-BoldItalic.ttf')
  },
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
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

// Retificação da Entrevista (endpoint novo)
router.post('/retificar-entrevista/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { justificativa } = req.body;
    if (!justificativa?.trim()) {
      return res.status(400).json({ success: false, message: 'Justificativa obrigatória' });
    }
    const valRec = await ValidacaoInscricao.findOne({ where: { inscricao_id: id } });
    if (!valRec) {
      return res.status(404).json({ success: false, message: 'Registro não encontrado' });
    }
    await valRec.update({
      justificativa_retificacao_entrevista: justificativa.trim(),
      data_retificacao_entrevista: new Date(),
      entrevista_realizada: 0,
      entrevista_pontuacao: null,
      plano_aula_pontuacao: null,
      entrevista_obs: null,
      entrevista_json: null,
      entrevista_data: null,
    });
    res.json({ success: true, message: 'Retificação da entrevista registrada com sucesso' });
  } catch (error) {
    console.error('Erro na retificação da entrevista:', error);
    res.status(500).json({ success: false, message: 'Erro ao processar retificação', error: error.message });
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

// Carregamento do logo (opcional)
let logoBase64 = null;
const logoPath = path.resolve(__dirname, '..', 'logo.jpeg');
try { logoBase64 = fs.readFileSync(logoPath).toString('base64'); } catch {}


router.get('/resultados-pss/pdf-detalhado', async (req, res) => {
  try {
    const { cargo = '', regiao = '' } = req.query;
    const sql = `
WITH ultimas_validacoes AS (
  SELECT DISTINCT ON (inscricao_id) *
  FROM validacoes_inscricoes_backup
  WHERE status = 'VALIDADO'
  ORDER BY inscricao_id, "updatedAt" DESC
),
base AS (
  SELECT
    v.inscricao_id,
    cad.nome AS nome,
    cad.pcd,
    trim(both '"' from translate(v.validacoes::text, E'\\\\', ''))::jsonb AS valj,
    CASE WHEN cad.pcd THEN 'PcD' ELSE 'Ampla Concorrência' END AS modalidade,
    cad.data_nascimento,
    to_char(cad.data_nascimento, 'DD/MM/YYYY') AS dn,
    i.tempo_exercicio,
    c.nome AS cargo,
    cr.zona AS regiao,
    cr.vagas_imediatas AS vagas,
    cr.reserva_pcd,
    c.nivel,
    v.entrevista_pontuacao,
    v.plano_aula_pontuacao
  FROM ultimas_validacoes v
  JOIN inscricoes i ON i.id = v.inscricao_id
  JOIN candidatos cad ON cad.id = i.candidato_id
  JOIN cargos c ON c.id = i.cargo_id
  JOIN cargo_regioes cr ON cr.cargo_id = c.id AND cr.zona = i.zona
  WHERE c.nome ILIKE :cargoFilter
    AND cr.zona ILIKE :regiaoFilter
),
calculo AS (
  SELECT
    b.*,
    (CASE WHEN b.valj->>'doc_escolaridade_path'='confirmado' THEN 50 ELSE 0 END) AS "I - RCM",
    (CASE
      WHEN b.valj->>'doc_certificado_fundamental_path'='confirmado'
        OR b.valj->>'doc_certificado_fund_completo_path'='confirmado'
      THEN 10 ELSE 0 END) AS "II - CCF",
    (CASE WHEN b.valj->>'doc_certificado_medio_path'='confirmado' THEN 10 ELSE 0 END) AS "III - CCM",
    (LEAST(
      (SELECT COUNT(*) FROM jsonb_each_text(b.valj) AS d(k,v)
        WHERE d.k LIKE 'doc_cursos_%' AND d.v='confirmado')
      ,4) * 5) AS "IV - CC",
    (CASE WHEN b.valj->>'doc_tempo_exercicio_path'='confirmado'
      THEN CASE b.tempo_exercicio
        WHEN 'ate02' THEN 5
        WHEN 'de02a04' THEN 10
        WHEN 'de04a06' THEN 15
        WHEN 'mais06' THEN 20
        ELSE 0
      END
      ELSE 0 END) AS "V - TEAP",
    (LEAST(
      (SELECT COUNT(*) FROM jsonb_each_text(b.valj) AS p(k,v)
        WHERE p.k LIKE 'doc_pos_%' AND p.v='confirmado')
      ,2) * 5) AS "VI - PG/E",
    (CASE WHEN b.valj->>'doc_mestrado_path'='confirmado' THEN 5 ELSE 0 END) AS "VII - MES",
    (CASE WHEN b.valj->>'doc_doutorado_path'='confirmado' THEN 5 ELSE 0 END) AS "VIII - DOU",
    (LEAST(
      (SELECT COUNT(*) FROM jsonb_each_text(b.valj) AS q(k,v)
        WHERE q.k LIKE 'doc_qualificacao_%' AND q.v='confirmado')
      ,2) * 5) AS "IX - CQA",
    (
      (CASE WHEN b.valj->>'doc_escolaridade_path'='confirmado' THEN 50 ELSE 0 END)
      + (CASE WHEN b.valj->>'doc_certificado_fundamental_path'='confirmado' OR b.valj->>'doc_certificado_fund_completo_path'='confirmado' THEN 10 ELSE 0 END)
      + (CASE WHEN b.valj->>'doc_certificado_medio_path'='confirmado' THEN 10 ELSE 0 END)
      + LEAST((SELECT COUNT(*) FROM jsonb_each_text(b.valj) AS d(k,v) WHERE d.k LIKE 'doc_cursos_%' AND d.v='confirmado'),4)*5
      + (CASE WHEN b.valj->>'doc_tempo_exercicio_path'='confirmado'
          THEN CASE b.tempo_exercicio WHEN 'ate02' THEN 5 WHEN 'de02a04' THEN 10 WHEN 'de04a06' THEN 15 WHEN 'mais06' THEN 20 ELSE 0 END
          ELSE 0 END)
      + LEAST((SELECT COUNT(*) FROM jsonb_each_text(b.valj) AS p(k,v) WHERE p.k LIKE 'doc_pos_%' AND p.v='confirmado'),2)*5
      + (CASE WHEN b.valj->>'doc_mestrado_path'='confirmado' THEN 5 ELSE 0 END)
      + (CASE WHEN b.valj->>'doc_doutorado_path'='confirmado' THEN 5 ELSE 0 END)
      + LEAST((SELECT COUNT(*) FROM jsonb_each_text(b.valj) AS q(k,v) WHERE q.k LIKE 'doc_qualificacao_%' AND q.v='confirmado'),2)*5
      + COALESCE(b.entrevista_pontuacao, 0)
      + COALESCE(b.plano_aula_pontuacao, 0)
    ) AS pontos,
    date_part('year', age(current_date,b.data_nascimento)) AS idade,
    -- Definição da situação:
    CASE
      WHEN (b.valj ? 'doc_plano_aula_path') THEN 
        CASE WHEN COALESCE(b.plano_aula_pontuacao, 0) < 5 THEN 'Eliminado' ELSE 'Classificado' END
      WHEN (NOT (b.valj ? 'doc_plano_aula_path')) THEN 
        CASE WHEN COALESCE(b.entrevista_pontuacao, 0) < 6 THEN 'Eliminado' ELSE 'Classificado' END
      ELSE 'Classificado'
    END AS situacao
  FROM base b
),
classificacao_normal AS (
  SELECT
    *, ROW_NUMBER() OVER (PARTITION BY cargo,regiao ORDER BY
      situacao ASC, -- Classificado primeiro, depois Eliminado
      pontos DESC,
      idade DESC
    ) AS posicao_geral
  FROM calculo
),
best_non_pcd AS (
  SELECT DISTINCT ON (cargo,regiao) cargo, regiao, inscricao_id AS best_non_pcd
  FROM classificacao_normal WHERE NOT pcd AND situacao='Classificado' ORDER BY cargo,regiao,pontos DESC,idade DESC
),
best_pcd AS (
  SELECT DISTINCT ON (cargo,regiao) cargo, regiao, inscricao_id AS best_pcd
  FROM classificacao_normal WHERE pcd AND reserva_pcd AND pontos>=50 AND situacao='Classificado' ORDER BY cargo,regiao,pontos DESC,idade DESC
),
classificacao_final AS (
  SELECT
    cn.*,
    ROW_NUMBER() OVER (
      PARTITION BY cn.cargo,cn.regiao
      ORDER BY
        CASE WHEN cn.inscricao_id=bc.best_non_pcd THEN 1 WHEN cn.inscricao_id=bp.best_pcd THEN 2 ELSE 3 END,
        cn.situacao ASC,
        cn.pontos DESC,
        cn.idade DESC
    ) AS classificacao
  FROM classificacao_normal cn
  LEFT JOIN best_non_pcd bc ON cn.cargo=bc.cargo AND cn.regiao=bc.regiao
  LEFT JOIN best_pcd bp ON cn.cargo=bp.cargo AND cn.regiao=bp.regiao
)
SELECT
  cf.cargo||' - '||cf.regiao||' | VAGAS: '||cf.vagas||(CASE WHEN cf.reserva_pcd THEN ' (reserva PcD)' ELSE '' END) AS cabecalho,
  cf.inscricao_id AS inscricao_id,
  cf.nome, cf.modalidade, cf.dn,
  cf."I - RCM",cf."II - CCF",cf."III - CCM",cf."IV - CC",cf."V - TEAP",cf."VI - PG/E",cf."VII - MES",cf."VIII - DOU",cf."IX - CQA",
  cf.entrevista_pontuacao,
  cf.plano_aula_pontuacao,
  cf.pontos,
  cf.situacao,
  cf.classificacao
FROM classificacao_final cf
ORDER BY cf.cargo,cf.regiao,cf.situacao,cf.classificacao;
    `;
    const rows = await sequelize.query(sql, {
      type: sequelize.QueryTypes.SELECT,
      replacements: { cargoFilter: `%${cargo}%`, regiaoFilter: `%${regiao}%` }
    });

    // Montar colunas para o PDF
    const columns = [
      { title: 'Inscrição', key: 'inscricao_id', width: 30 },
      { title: 'Nome', key: 'nome', width: '*' },
      { title: 'Modalidade', key: 'modalidade', width: 50 },
      { title: 'D.N.', key: 'dn', width: 40 },
      { title: 'I - RCM', key: 'I - RCM', width: 25 },
      { title: 'II - CCF', key: 'II - CCF', width: 25 },
      { title: 'III - CCM', key: 'III - CCM', width: 25 },
      { title: 'IV - CC', key: 'IV - CC', width: 25 },
      { title: 'V - TEAP', key: 'V - TEAP', width: 30 },
      { title: 'VI - PG/E', key: 'VI - PG/E', width: 30 },
      { title: 'VII - MES', key: 'VII - MES', width: 25 },
      { title: 'VIII - DOU', key: 'VIII - DOU', width: 25 },
      { title: 'IX - CQA', key: 'IX - CQA', width: 25 },
      { title: 'Entrevista', key: 'entrevista_pontuacao', width: 25 },
      { title: 'Plano Aula', key: 'plano_aula_pontuacao', width: 25 },
      { title: 'Pontos', key: 'pontos', width: 25 },
      { title: 'Situação', key: 'situacao', width: 40 },
      { title: 'Classif.', key: 'classificacao', width: 30 }
    ];

    // Agrupa candidatos por cargo+regiao para o relatório
    const groups = rows.reduce((acc, row) => {
      acc[row.cabecalho] = acc[row.cabecalho] || [];
      acc[row.cabecalho].push(row);
      return acc;
    }, {});

    const printedAt = new Date().toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',timeZone: 'America/Sao_Paulo' // <<< Isso força horário de Brasília!
    });

    // Gera o conteúdo do PDF
    const content = [];
    if (logoBase64) content.push({
      image: `data:image/jpeg;base64,${logoBase64}`,
      width: 80,
      alignment: 'center',
      margin: [0, 0, 0, 5]
    });
    content.push({
      text: 'RELATÓRIO DETALHADO - PSS',
      style: 'header',
      alignment: 'center',
      margin: [0, 0, 0, 8]
    });

    const hdrStyle = { fillColor: '#2c3e50', color: '#fff', bold: true, fontSize: 6, alignment: 'center' };
    const cellStyle = { fontSize: 5, alignment: 'center' };
    const cellPcd = { fontSize: 5, alignment: 'center', fillColor: '#e3f2fd' };
    const cellEliminado = { fontSize: 5, alignment: 'center', fillColor: '#ffcccc' };

    Object.entries(groups).forEach(([cab, grp], idx) => {
      if (idx > 0) content.push({ text: '', pageBreak: 'before' });
      content.push({
        text: `${cab} | Total inscritos: ${grp.length}`,
        style: 'subheader',
        alignment: 'center',
        margin: [0, 0, 0, 5]
      });

      // Monta tabela (classificados acima, eliminados abaixo)
      const classificados = grp.filter(r => r.situacao === 'Classificado');
      const eliminados = grp.filter(r => r.situacao === 'Eliminado');

      const body = [];
      body.push(columns.map(col => ({ text: col.title, style: hdrStyle })));

      classificados.forEach(r => {
        body.push(columns.map(col => {
          let style = cellStyle;
          if (r.modalidade === 'PcD') style = cellPcd;
          return { text: r[col.key] !== undefined ? r[col.key] : '', style };
        }));
      });

      if (eliminados.length > 0) {
        // Linha separadora no PDF
        body.push(columns.map(col =>
          ({ text: col.title === 'Nome' ? '--- ELIMINADOS ---' : '', style: { fontSize: 6, alignment: 'center', bold: true, color: '#900' } })
        ));
        eliminados.forEach(r => {
          body.push(columns.map(col => {
            // Cor diferenciada para eliminados
            return { text: r[col.key] !== undefined ? r[col.key] : '', style: cellEliminado };
          }));
        });
      }

      content.push({
        table: { headerRows: 1, widths: columns.map(c => c.width), body },
        layout: {
          hLineWidth: (i) => i === 0 ? 0.4 : 0.2,
          vLineWidth: () => 0.2,
          hLineColor: (i) => i === 0 ? '#2c3e50' : '#ccc',
          vLineColor: () => '#ccc',
          padding: [1, 1, 1, 1]
        },
        margin: [0, 0, 0, 8]
      });
    });

    content.push({
      text: 'Legenda: RCM=Requisitos Mínimos para Cargo, CCF=Cert. Conclusão Fundamental, CCM=Cert. Conclusão Ensino Médio, CC=Cursos Complementares, TEAP=Tempo de Exercício, PG/E=Pós Graduação/Especialização, MES=Mestrado, DOU=Doutorado, CQA=Qualificação/Aperfeiçoamento',
      fontSize: 5,
      margin: [0, 2, 0, 0]
    });

    const docDef = {
      content,
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [10, 15, 10, 15],
      defaultStyle: { font: 'Helvetica' },
      styles: {
        header: { fontSize: 10, bold: true },
        subheader: { fontSize: 8, bold: true }
      },
      footer: (cp, pc) => ({
        columns: [
          { text: `Gerado em: ${printedAt}`, fontSize: 5 },
          { text: `Página ${cp} de ${pc}`, alignment: 'right', fontSize: 5 }
        ],
        margin: [10, 0, 10, 0]
      })
    };

    const printer = new PdfPrinter(fonts);

    res.setHeader('Content-Disposition', 'attachment; filename="relatorio_pss_detalhado.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    const pdfDoc = printer.createPdfKitDocument(docDef);
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (err) {
    console.error('Erro ao gerar PDF detalhado:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// Endpoint para retornar resultados detalhados em JSON (igual ao PDF)
router.get('/resultados-pss/detalhado', async (req, res) => {
  try {
    const { cargo = '', regiao = '' } = req.query;
    const sql = `
WITH ultimas_validacoes AS (
  SELECT DISTINCT ON (inscricao_id) *
  FROM validacoes_inscricoes_backup
  WHERE status = 'VALIDADO'
  ORDER BY inscricao_id, "updatedAt" DESC
),
base AS (
  SELECT
    v.inscricao_id,
    cad.nome AS nome,
    cad.pcd,
    trim(both '"' from translate(v.validacoes::text, E'\\\\', ''))::jsonb AS valj,
    CASE WHEN cad.pcd THEN 'PcD' ELSE 'Ampla Concorrência' END AS modalidade,
    cad.data_nascimento,
    to_char(cad.data_nascimento, 'DD/MM/YYYY') AS dn,
    i.tempo_exercicio,
    c.nome AS cargo,
    cr.zona AS regiao,
    cr.vagas_imediatas AS vagas,
    cr.reserva_pcd,
    c.nivel,
    v.entrevista_pontuacao,
    v.plano_aula_pontuacao
  FROM ultimas_validacoes v
  JOIN inscricoes i ON i.id = v.inscricao_id
  JOIN candidatos cad ON cad.id = i.candidato_id
  JOIN cargos c ON c.id = i.cargo_id
  JOIN cargo_regioes cr ON cr.cargo_id = c.id AND cr.zona = i.zona
  WHERE c.nome ILIKE :cargoFilter
    AND cr.zona ILIKE :regiaoFilter
),
calculo AS (
  SELECT
    b.*,
    (CASE WHEN b.valj->>'doc_escolaridade_path'='confirmado' THEN 50 ELSE 0 END) AS "I - RCM",
    (CASE
      WHEN b.valj->>'doc_certificado_fundamental_path'='confirmado'
        OR b.valj->>'doc_certificado_fund_completo_path'='confirmado'
      THEN 10 ELSE 0 END) AS "II - CCF",
    (CASE WHEN b.valj->>'doc_certificado_medio_path'='confirmado' THEN 10 ELSE 0 END) AS "III - CCM",
    (LEAST(
      (SELECT COUNT(*) FROM jsonb_each_text(b.valj) AS d(k,v)
        WHERE d.k LIKE 'doc_cursos_%' AND d.v='confirmado')
      ,4) * 5) AS "IV - CC",
    (CASE WHEN b.valj->>'doc_tempo_exercicio_path'='confirmado'
      THEN CASE b.tempo_exercicio
        WHEN 'ate02' THEN 5
        WHEN 'de02a04' THEN 10
        WHEN 'de04a06' THEN 15
        WHEN 'mais06' THEN 20
        ELSE 0
      END
      ELSE 0 END) AS "V - TEAP",
    (LEAST(
      (SELECT COUNT(*) FROM jsonb_each_text(b.valj) AS p(k,v)
        WHERE p.k LIKE 'doc_pos_%' AND p.v='confirmado')
      ,2) * 5) AS "VI - PG/E",
    (CASE WHEN b.valj->>'doc_mestrado_path'='confirmado' THEN 5 ELSE 0 END) AS "VII - MES",
    (CASE WHEN b.valj->>'doc_doutorado_path'='confirmado' THEN 5 ELSE 0 END) AS "VIII - DOU",
    (LEAST(
      (SELECT COUNT(*) FROM jsonb_each_text(b.valj) AS q(k,v)
        WHERE q.k LIKE 'doc_qualificacao_%' AND q.v='confirmado')
      ,2) * 5) AS "IX - CQA",
    (
      (CASE WHEN b.valj->>'doc_escolaridade_path'='confirmado' THEN 50 ELSE 0 END)
      + (CASE WHEN b.valj->>'doc_certificado_fundamental_path'='confirmado' OR b.valj->>'doc_certificado_fund_completo_path'='confirmado' THEN 10 ELSE 0 END)
      + (CASE WHEN b.valj->>'doc_certificado_medio_path'='confirmado' THEN 10 ELSE 0 END)
      + LEAST((SELECT COUNT(*) FROM jsonb_each_text(b.valj) AS d(k,v) WHERE d.k LIKE 'doc_cursos_%' AND d.v='confirmado'),4)*5
      + (CASE WHEN b.valj->>'doc_tempo_exercicio_path'='confirmado'
          THEN CASE b.tempo_exercicio WHEN 'ate02' THEN 5 WHEN 'de02a04' THEN 10 WHEN 'de04a06' THEN 15 WHEN 'mais06' THEN 20 ELSE 0 END
          ELSE 0 END)
      + LEAST((SELECT COUNT(*) FROM jsonb_each_text(b.valj) AS p(k,v) WHERE p.k LIKE 'doc_pos_%' AND p.v='confirmado'),2)*5
      + (CASE WHEN b.valj->>'doc_mestrado_path'='confirmado' THEN 5 ELSE 0 END)
      + (CASE WHEN b.valj->>'doc_doutorado_path'='confirmado' THEN 5 ELSE 0 END)
      + LEAST((SELECT COUNT(*) FROM jsonb_each_text(b.valj) AS q(k,v) WHERE q.k LIKE 'doc_qualificacao_%' AND q.v='confirmado'),2)*5
      + COALESCE(b.entrevista_pontuacao, 0)
      + COALESCE(b.plano_aula_pontuacao, 0)
    ) AS pontos,
    date_part('year', age(current_date,b.data_nascimento)) AS idade,
    -- Definição da situação:
    CASE
      WHEN (b.valj ? 'doc_plano_aula_path') THEN 
        CASE WHEN COALESCE(b.plano_aula_pontuacao, 0) < 5 THEN 'Eliminado' ELSE 'Classificado' END
      WHEN (NOT (b.valj ? 'doc_plano_aula_path')) THEN 
        CASE WHEN COALESCE(b.entrevista_pontuacao, 0) < 6 THEN 'Eliminado' ELSE 'Classificado' END
      ELSE 'Classificado'
    END AS situacao
  FROM base b
),
classificacao_normal AS (
  SELECT
    *, ROW_NUMBER() OVER (PARTITION BY cargo,regiao ORDER BY
      situacao ASC, -- Classificado primeiro, depois Eliminado
      pontos DESC,
      idade DESC
    ) AS posicao_geral
  FROM calculo
),
best_non_pcd AS (
  SELECT DISTINCT ON (cargo,regiao) cargo, regiao, inscricao_id AS best_non_pcd
  FROM classificacao_normal WHERE NOT pcd AND situacao='Classificado' ORDER BY cargo,regiao,pontos DESC,idade DESC
),
best_pcd AS (
  SELECT DISTINCT ON (cargo,regiao) cargo, regiao, inscricao_id AS best_pcd
  FROM classificacao_normal WHERE pcd AND reserva_pcd AND pontos>=50 AND situacao='Classificado' ORDER BY cargo,regiao,pontos DESC,idade DESC
),
classificacao_final AS (
  SELECT
    cn.*,
    ROW_NUMBER() OVER (
      PARTITION BY cn.cargo,cn.regiao
      ORDER BY
        CASE WHEN cn.inscricao_id=bc.best_non_pcd THEN 1 WHEN cn.inscricao_id=bp.best_pcd THEN 2 ELSE 3 END,
        cn.situacao ASC,
        cn.pontos DESC,
        cn.idade DESC
    ) AS classificacao
  FROM classificacao_normal cn
  LEFT JOIN best_non_pcd bc ON cn.cargo=bc.cargo AND cn.regiao=bc.regiao
  LEFT JOIN best_pcd bp ON cn.cargo=bp.cargo AND cn.regiao=bp.regiao
)
SELECT
  cf.cargo||' - '||cf.regiao||' | VAGAS: '||cf.vagas||(CASE WHEN cf.reserva_pcd THEN ' (reserva PcD)' ELSE '' END) AS cabecalho,
  cf.inscricao_id AS inscricao_id,
  cf.nome, cf.modalidade, cf.dn,
  cf."I - RCM",cf."II - CCF",cf."III - CCM",cf."IV - CC",cf."V - TEAP",cf."VI - PG/E",cf."VII - MES",cf."VIII - DOU",cf."IX - CQA",
  cf.entrevista_pontuacao,
  cf.plano_aula_pontuacao,
  cf.pontos,
  cf.situacao,
  cf.classificacao
FROM classificacao_final cf
ORDER BY cf.cargo,cf.regiao,cf.situacao,cf.classificacao;
    `;
    const rows = await sequelize.query(sql, {
      type: sequelize.QueryTypes.SELECT,
      replacements: { cargoFilter: `%${cargo}%`, regiaoFilter: `%${regiao}%` }
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;