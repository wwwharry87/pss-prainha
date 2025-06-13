const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ValidacaoInscricao = sequelize.define('ValidacaoInscricao', {
  inscricao_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
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
  },
  justificativa_retificacao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // NOVOS CAMPOS
  entrevista_json: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  entrevista_pontuacao: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
  },
  entrevista_obs: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  entrevista_data: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  entrevista_realizada: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  }  
}, 
{
  tableName: 'validacoes_inscricoes',
  timestamps: true,
});

module.exports = ValidacaoInscricao;
