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
  tempo_servico: {
    type: DataTypes.INTEGER,
    allowNull: false
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