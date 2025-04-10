// models/DashboardView.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DashboardView = sequelize.define('DashboardView', {
  inscricao_id: {
    type: DataTypes.INTEGER,
    primaryKey: true
  },
  candidato_nome: DataTypes.STRING,
  candidato_cpf: DataTypes.STRING,
  cargo_nome: DataTypes.STRING,
  regiao: DataTypes.STRING,
  status: DataTypes.STRING,
  data_inscricao: DataTypes.DATE,
  observacoes: DataTypes.TEXT,
  pontuacao: DataTypes.FLOAT
}, {
  tableName: 'dashboard_view',
  timestamps: false,
  freezeTableName: true
});

module.exports = DashboardView;