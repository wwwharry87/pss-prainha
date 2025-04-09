// models/ValidacaoInscricao.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ValidacaoInscricao = sequelize.define('ValidacaoInscricao', {
  inscricao_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  // Armazena a validação individual de cada documento (formato JSON: ex. { "doc_identidade": "confirmado", ... } )
  validacoes: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'PENDENTE'
  },
  pontuacao: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
  }
}, {
  tableName: 'validacoes_inscricoes',
  timestamps: true,
});

module.exports = ValidacaoInscricao;
