// models/Inscricao.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Candidato = require('./Candidato');
const Cargo = require('./Cargo');

const Inscricao = sequelize.define('Inscricao', {
  zona: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  // Campo para armazenar o valor selecionado no tempo de exercício
  tempo_exercicio: {
    type: DataTypes.STRING
  },
  plan_aula: {
    type: DataTypes.TEXT
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'PENDENTE',
  },
  doc_identidade_path: {
    type: DataTypes.STRING,
    allowNull: false
  },
  doc_escolaridade_path: {
    type: DataTypes.STRING
  },
  doc_diploma_path: {
    type: DataTypes.STRING
  },
  doc_especifico_path: {
    type: DataTypes.STRING
  },
  doc_especializacao_path: {
    type: DataTypes.STRING
  },
  doc_mestrado_path: {
    type: DataTypes.STRING
  },
  doc_doutorado_path: {
    type: DataTypes.STRING
  },
  doc_plano_aula_path: {
    type: DataTypes.STRING
  },
  // Novos campos para certificados e cursos
  doc_certificado_path: {
    type: DataTypes.STRING
  },
  doc_certificado_fundamental_path: {
    type: DataTypes.STRING
  },
  doc_certificado_medio_path: {
    type: DataTypes.STRING
  },
  doc_certificado_fund_completo_path: {
    type: DataTypes.STRING
  },
  // Para cursos complementares, armazenamos os nomes dos arquivos em formato JSON
  doc_cursos: {
    type: DataTypes.TEXT
  },
  // Campos específicos para Nível Superior
  doc_pos: {
    type: DataTypes.TEXT
  },
  doc_qualificacao: {
    type: DataTypes.TEXT
  },
  // Para o tempo de exercício, armazenamos também o arquivo comprobatório
  doc_tempo_exercicio_path: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'inscricoes',
  timestamps: true,
});

// Relações
Inscricao.belongsTo(Candidato, { foreignKey: 'candidato_id' });
Candidato.hasMany(Inscricao, { foreignKey: 'candidato_id' });

Inscricao.belongsTo(Cargo, { foreignKey: 'cargo_id' });
Cargo.hasMany(Inscricao, { foreignKey: 'cargo_id' });

module.exports = Inscricao;
